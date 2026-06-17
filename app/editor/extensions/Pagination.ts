import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { Extension } from "@tiptap/react";

/**
 * 分页插件
 * --------
 * ProseMirror 的文档模型本身是一条连续流，不天然知道“纸张页边界”。
 * 这个插件通过 Decoration 在视觉层插入空白 spacer，让会跨越页边界的块
 * 被推到下一页内容区，从而获得接近 Word 的分页效果。
 *
 * 这里使用两类 Decoration：
 *
 * 1. 根级 WIDGET spacer：
 *    插在普通块节点前，或插在“第一行已经放不下”的表格前。
 *    它渲染成透明 div，把后续内容精确推到下一页内容区顶部。
 *
 * 2. 单元格 NODE decoration：
 *    当表格中某一行会跨页时，给“上一行”的每个单元格追加 padding-bottom。
 *    上一行被撑高后，下一行整体掉到下一页，边框和单元格不会被截成两半。
 *
 * 布局前提
 * --------
 * .ProseMirror 位于 .paper-content-wrap 内，并覆盖在一叠 page-bg 背景纸张上。
 * EditorSurface 会把尺寸指标写入 view.dom 的 data-* 属性：
 *   data-page-h-px       - 完整纸张高度（px）
 *   data-page-content-px - 每页可写内容区高度（px）
 *   data-margin-px       - 页面边距换算像素
 *   data-gap-px          - 页面背景之间的视觉间距
 *
 * 在 ProseMirror 坐标系里正文仍是一条连续流；相邻页面内容区之间隔着
 * “页脚安全区 + 页间距 + 下一页信头安全区”。因此：
 *   stride = pageHpx + gapPx
 *   pageContentEnd(N) = N * stride + contentPerPage
 */

const pgKey = new PluginKey<DecorationSet>('pagination');
const BREAK_GUARD_PX = 2;
// 行底部至少要离页面内容边界这么多像素，才算“能放下”。
// 这个安全值吸收字体度量、浏览器渲染、html2canvas 截图之间的细小误差。
const ROW_FIT_SAFETY_PX = 6;
// spacer 高度按桶向上取整，避免 ResizeObserver 连续触发时 1-2px 抖动导致
// Decoration 签名反复变化，形成“出现/消失”的无限循环。
const HEIGHT_BUCKET_PX = 8;
const bucket = (h: number) => Math.ceil(h / HEIGHT_BUCKET_PX) * HEIGHT_BUCKET_PX;

interface WidgetSpec {
  kind: 'widget';
  pos: number;
  height: number;
}
interface CellPadSpec {
  kind: 'cellPad';
  from: number;
  to: number;
  height: number;
}
type DecoSpec = WidgetSpec | CellPadSpec;

function readMetrics(view: EditorView) {
  // 所有分页尺寸都从 DOM dataset 读取，避免插件直接依赖 React/Zustand。
  const ds = (view.dom as HTMLElement).dataset;
  const pageContentPx = parseFloat(ds.pageContentPx || '0');
  const pageHpx = parseFloat(ds.pageHPx || '0');
  const marginPx = parseFloat(ds.marginPx || '0');
  const gapPx = parseFloat(ds.gapPx || '0');
  return { pageContentPx, pageHpx, marginPx, gapPx };
}

/** 读取分页插件之前给单元格注入的 padding-bottom，用来还原“不含分页补偿”的自然几何尺寸。 */
function cellExtraPad(cell: HTMLElement): number {
  const raw = cell.getAttribute('data-pg-pad');
  if (!raw) return 0;
  const v = parseFloat(raw);
  return isFinite(v) && v > 0 ? v : 0;
}
function rowExtraPad(row: HTMLElement): number {
  let max = 0;
  for (const cell of Array.from(row.children) as HTMLElement[]) {
    const e = cellExtraPad(cell);
    if (e > max) max = e;
  }
  return max;
}

function buildDecoSpecs(view: EditorView): DecoSpec[] {
  const { pageContentPx, pageHpx, marginPx, gapPx } = readMetrics(view);
  const contentPerPage = pageContentPx > 0 ? pageContentPx : pageHpx - 2 * marginPx;
  if (!contentPerPage || contentPerPage <= 0) return [];
  const pageStride = pageHpx > 0 ? pageHpx + gapPx : contentPerPage + gapPx;

  const root = view.dom as HTMLElement;
  // 检测祖先元素上的 zoom transform：
  // getBoundingClientRect() 是缩放后的显示像素，offsetHeight 是未缩放布局像素。
  // dataset 中的分页指标也是未缩放逻辑像素，所以需要把 rect 坐标除以 scale。
  const rootRect = root.getBoundingClientRect();
  const rootOffsetH = root.offsetHeight || 1;
  const scale = rootRect.height > 0 ? rootRect.height / rootOffsetH : 1;
  const inv = scale > 0.01 ? 1 / scale : 1;
  const rootTop = rootRect.top;
  const topInRoot = (el: HTMLElement): number =>
    (el.getBoundingClientRect().top - rootTop) * inv;
  const heightInRoot = (el: HTMLElement): number =>
    el.getBoundingClientRect().height * inv;

  const blocks = Array.from(root.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.classList.contains('pm-page-spacer')
  );

  const specs: DecoSpec[] = [];
  // plannedShift 记录本轮即将插入到当前块之前的根级 spacer 总高度。
  // 它让后续块在“即将生效”的坐标系中继续计算。
  let plannedShift = 0;

  const widgetShiftAbove = (block: HTMLElement): number => {
    let shift = 0;
    let cur = block.previousElementSibling as HTMLElement | null;
    while (cur) {
      if (cur.classList.contains('pm-page-spacer')) shift += heightInRoot(cur);
      cur = cur.previousElementSibling as HTMLElement | null;
    }
    return shift;
  };

  // 获取块节点在父节点中的前置位置，用于把 root widget 插到该块之前。
  const posBeforeBlock = (block: HTMLElement): number | null => {
    try {
      const parent = block.parentNode as HTMLElement | null;
      if (!parent) return null;
      const idx = Array.from(parent.children).indexOf(block);
      if (idx < 0) return null;
      return view.posAtDOM(parent, idx);
    } catch {
      return null;
    }
  };

  // 获取单元格节点的 ProseMirror 范围，这样 Decoration.node 可以精准作用于该 cell。
  const cellRange = (cell: HTMLElement): { from: number; to: number } | null => {
    try {
      const tr = cell.parentNode as HTMLElement | null;
      if (!tr) return null;
      const idx = Array.from(tr.children).indexOf(cell);
      if (idx < 0) return null;
      const from = view.posAtDOM(tr, idx);
      const node = view.state.doc.nodeAt(from);
      if (!node) return null;
      return { from, to: from + node.nodeSize };
    } catch {
      return null;
    }
  };

  for (const block of blocks) {
    const blockH = heightInRoot(block);
    if (!blockH) continue;
    const blockTop = topInRoot(block);

    const tbl: HTMLTableElement | null =
      block.tagName === 'TABLE'
        ? (block as HTMLTableElement)
        : (block.querySelector('table') as HTMLTableElement | null);

    if (tbl) {
      const rows = Array.from(tbl.querySelectorAll('tr')) as HTMLTableRowElement[];
      if (!rows.length) continue;

      // rowsCurTop 是当前 DOM 坐标，已经包含上一轮 Decoration 造成的位移。
      // rowsNaturalTop 要扣掉这些位移，还原没有分页补偿时的自然位置，
      // 否则每轮重算都会把上次 padding 当成真实内容高度，越算越偏。
      const rowsCurTop: number[] = rows.map(topInRoot);
      const rowsExtraPad: number[] = rows.map(rowExtraPad);
      const rowsCurH: number[] = rows.map(heightInRoot);
      const widgetAbove = widgetShiftAbove(block);
      const rowsNaturalTop: number[] = [];
      let priorPad = 0;
      for (let i = 0; i < rows.length; i++) {
        rowsNaturalTop.push(rowsCurTop[i] - widgetAbove - priorPad);
        priorPad += rowsExtraPad[i];
      }
      // 当前行高度也要扣掉自己被分页 padding 撑出的高度，得到自然行高。
      const rowsNaturalH: number[] = rowsCurH.map((h, i) =>
        Math.max(0, h - rowsExtraPad[i])
      );

      // 逐行判断是否跨页；如果跨页，就把 spacer 加到上一行（或整个表格前）。
      let tableExtra = 0;
      for (let ri = 0; ri < rows.length; ri++) {
        // 本轮 rowTop = 自然位置 + 本轮块前 spacer + 本轮表格内上方 padding。
        const rowTop = rowsNaturalTop[ri] + plannedShift + tableExtra;
        const rowH = rowsNaturalH[ri];
        if (rowH <= 0) continue;
        const startPage = Math.floor(rowTop / pageStride);
        const pageContentEnd = startPage * pageStride + contentPerPage;
        const pageBoundary = (startPage + 1) * pageStride;

        // 严格判断是否放得下：行底部必须在内容区结束线之前，并留出安全像素。
        const fitsHere =
          rowTop < pageContentEnd &&
          rowTop + rowH + ROW_FIT_SAFETY_PX <= pageContentEnd;
        if (fitsHere) continue;

        const spacerH = bucket(pageBoundary - rowTop + BREAK_GUARD_PX);
        if (spacerH <= 0) continue;

        if (ri === 0) {
          // 表格第一行就放不下时，没有上一行可撑高，只能在表格前插 root spacer。
          const pos = posBeforeBlock(block);
          if (pos != null) {
            specs.push({ kind: 'widget', pos, height: spacerH });
            plannedShift += spacerH;
            tableExtra += spacerH;
          }
        } else {
          // 非首行跨页：给上一行所有单元格增加 padding-bottom，把当前行推到下一页。
          const prevCells = Array.from(rows[ri - 1].children) as HTMLElement[];
          for (const cell of prevCells) {
            const r = cellRange(cell);
            if (!r) continue;
            specs.push({ kind: 'cellPad', from: r.from, to: r.to, height: spacerH });
          }
          tableExtra += spacerH;
        }
      }
      plannedShift += tableExtra;
      continue;
    }

    // 普通块节点：如果会跨页，就在块前插入 root widget spacer。
    const blockNaturalTop = blockTop - widgetShiftAbove(block) + plannedShift;
    let curTop = blockNaturalTop;
    let safety = 0;
    while (safety++ < 32) {
      const startPage = Math.floor(curTop / pageStride);
      const pageContentEnd = startPage * pageStride + contentPerPage;
      if (curTop + blockH <= pageContentEnd) break;
      const pos = posBeforeBlock(block);
      if (pos == null) break;
      const spacerH = bucket(
        (startPage + 1) * pageStride - curTop + BREAK_GUARD_PX
      );
      if (spacerH <= 0) break;
      specs.push({ kind: 'widget', pos, height: spacerH });
      plannedShift += spacerH;
      curTop += spacerH;
      // 如果单个不可拆分块本身高于一页，推一次后停止，避免死循环。
      if (blockH > contentPerPage) break;
    }
  }

  return specs;
}

function toDecorationSet(view: EditorView, specs: DecoSpec[]): DecorationSet {
  if (!specs.length) return DecorationSet.empty;
  const decos: Decoration[] = [];
  for (const s of specs) {
    if (s.kind === 'widget') {
      decos.push(
        Decoration.widget(
          s.pos,
          () => {
            const el = document.createElement('div');
            el.className = 'pm-page-spacer';
            el.style.height = `${s.height}px`;
            el.style.pointerEvents = 'none';
            el.setAttribute('aria-hidden', 'true');
            return el;
          },
          { side: -1, key: `wg-${s.pos}-${s.height}` }
        )
      );
    } else {
      // 重要：padding-bottom 写成 calc(基础 padding + Npx)，保留 editor.css 中的 6px 基础内边距。
      // 如果直接覆盖成 Npx，真实位移会少 6px，但 data-pg-pad 仍记录 N，
      // 下一轮还原自然几何时就会出现 6px 误差，导致 spacer 反复抖动。
      decos.push(
        Decoration.node(s.from, s.to, {
          style: `--pg-pad-h: ${s.height}px; padding-bottom: calc(6px + ${s.height}px) !important`,
          'data-pg-pad': String(s.height)
        })
      );
    }
  }
  return DecorationSet.create(view.state.doc, decos);
}

function specsSignature(specs: DecoSpec[]): string {
  return specs
    .map((s) =>
      s.kind === 'widget'
        ? `wg:${s.pos}:${s.height}`
        : `cp:${s.from}:${s.to}:${s.height}`
    )
    .join('|');
}

export const Pagination = Extension.create({
  name: 'pagination',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pgKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(pgKey) as DecorationSet | undefined;
            if (meta) return meta;
            return old.map(tr.mapping, tr.doc);
          }
        },
        props: {
          decorations(state) {
            return pgKey.getState(state) || DecorationSet.empty;
          }
        },
        view(view) {
          let raf = 0;
          let lastSig = '';
          const schedule = () => {
            // 用 requestAnimationFrame 合并同一帧内的多次 DOM/事务变化。
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              const specs = buildDecoSpecs(view);
              const sig = specsSignature(specs);
              // Decoration 签名没变就不 dispatch，避免制造无意义事务。
              if (sig === lastSig) return;
              lastSig = sig;
              const next = toDecorationSet(view, specs);
              view.dispatch(view.state.tr.setMeta(pgKey, next));
            });
          };
          const ro = new ResizeObserver(schedule);
          ro.observe(view.dom);
          const mo = new MutationObserver(schedule);
          mo.observe(view.dom, {
            attributes: true,
            attributeFilter: [
              'data-page-content-px',
              'data-page-h-px',
              'data-margin-px',
              'data-gap-px'
            ]
          });
          schedule();
          return {
            update: schedule,
            destroy() {
              cancelAnimationFrame(raf);
              ro.disconnect();
              mo.disconnect();
            }
          };
        }
      })
    ];
  }
});
