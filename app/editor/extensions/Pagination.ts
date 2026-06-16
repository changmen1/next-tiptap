import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { Extension } from "@tiptap/react";

/**
 * Pagination plugin
 * -----------------
 * Splits the document across page-sized "content areas" so blocks that
 * would cross a page boundary get pushed to the next page.
 *
 * Two decoration mechanisms are used:
 *
 *   1) Root-level WIDGET spacers, inserted before any non-table block
 *      (or before a table whose FIRST row would already overflow). The
 *      widget renders as a tall transparent <div> that pushes everything
 *      after it down by exactly the amount needed to land at the next
 *      page's content top.
 *
 *   2) Cell NODE decorations adding inline `padding-bottom` to every
 *      cell of the row that sits ABOVE a row that would cross the page
 *      boundary. The previous row grows; the breaking row drops to the
 *      next page along with its top border, cells, and bottom border.
 *
 * Layout assumptions
 * ------------------
 * The .ProseMirror DOM sits inside a .paper-content-wrap that is
 * absolutely positioned over a stack of page-bg tiles separated by a
 * visible gap. Inputs come from data-attributes on view.dom:
 *   data-page-h-px       – full page tile height in px
 *   data-page-content-px – usable content height per page in px
 *   data-margin-px       – top+bottom page margin in px (one side)
 *   data-gap-px          – visual gap between page-bg tiles in px
 *
 * In ProseMirror coordinates the .ProseMirror is one continuous flow,
 * so successive content areas are separated by the dead zone
 * (footer band + visual gap + next letterhead). The vertical distance
 * between the start of page N's content and page N+1's content is
 *   stride = pageHpx + gapPx
 * and the end of page N's usable content is at
 *   pageContentEnd(N) = N * stride + contentPerPage
 */

const pgKey = new PluginKey<DecorationSet>('pagination');
const BREAK_GUARD_PX = 2;
// A row is considered to fit on the current page only if its bottom
// is at least this many pixels above the page-content boundary. This
// absorbs any tiny rounding/measurement skew between the editor's
// rendering pass and what html2canvas captures for the PDF, so rows
// always break cleanly between pages instead of leaking the bottom
// few pixels of text into the dead zone above the footer image.
const ROW_FIT_SAFETY_PX = 6;
// Round spacer heights up to this bucket so 1-2px measurement jitter on
// successive ResizeObserver ticks does not flip the decoration signature
// and trigger an infinite appear/disappear loop.
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
  const ds = (view.dom as HTMLElement).dataset;
  const pageContentPx = parseFloat(ds.pageContentPx || '0');
  const pageHpx = parseFloat(ds.pageHPx || '0');
  const marginPx = parseFloat(ds.marginPx || '0');
  const gapPx = parseFloat(ds.gapPx || '0');
  return { pageContentPx, pageHpx, marginPx, gapPx };
}

/** Padding-bottom we previously injected on a cell, read back from the
 *  data-pg-pad attribute the decoration writes. Used to subtract the
 *  pagination-added growth so we can compute "natural" geometry that is
 *  stable across recompute passes. */
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
  // Detect any ancestor zoom transform by comparing the view's bounding-rect
  // height (scaled) to its offsetHeight (unscaled). Bounding rects are in
  // viewport (display) pixels; the dataset metrics are in logical (unscaled)
  // pixels. We normalise rect-derived offsets by `1/scale` to get logical px.
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
  // plannedShift accumulates root-level widget spacers above the current
  // block (in stable, decoration-independent coords).
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

  // Position right BEFORE the block in its parent (used for root widgets).
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

  // PM range that exactly covers a single cell node, so a node decoration
  // applied to {from, to} targets that cell.
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

      // Each row's CURRENT top in root coords (already includes any
      // cell-pad applied to rows above it from prior passes, plus any
      // widgets above the block from prior passes). The "natural" top
      // (= position with NO decorations at all) is currentTop minus the
      // cumulative cell-pad on rows above this one minus the widget
      // shift above the block.
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
      // Each row's natural height is its current height minus its own
      // cell-pad (pad-bottom inflates the row's own height too).
      const rowsNaturalH: number[] = rowsCurH.map((h, i) =>
        Math.max(0, h - rowsExtraPad[i])
      );

      // Walk rows; emit padding-bottom on the previous row of any
      // breaking row.
      let tableExtra = 0;
      for (let ri = 0; ri < rows.length; ri++) {
        // rowTop in this pass = natural top + this-pass widget shift
        // before the block + this-pass cell-pads on rows above.
        const rowTop = rowsNaturalTop[ri] + plannedShift + tableExtra;
        const rowH = rowsNaturalH[ri];
        if (rowH <= 0) continue;
        const startPage = Math.floor(rowTop / pageStride);
        const pageContentEnd = startPage * pageStride + contentPerPage;
        const pageBoundary = (startPage + 1) * pageStride;

        // Strict overflow check: a row fits only if its bottom is at or
        // before the page-content end MINUS a small safety margin. The
        // safety absorbs sub-pixel rounding, font-metric drift between
        // editor and PDF rendering, and ResizeObserver jitter so rows
        // always break cleanly.
        const fitsHere =
          rowTop < pageContentEnd &&
          rowTop + rowH + ROW_FIT_SAFETY_PX <= pageContentEnd;
        if (fitsHere) continue;

        const spacerH = bucket(pageBoundary - rowTop + BREAK_GUARD_PX);
        if (spacerH <= 0) continue;

        if (ri === 0) {
          // First row of the table — no previous row to grow. Push the
          // entire table down via a root widget before the block.
          const pos = posBeforeBlock(block);
          if (pos != null) {
            specs.push({ kind: 'widget', pos, height: spacerH });
            plannedShift += spacerH;
            tableExtra += spacerH;
          }
        } else {
          // Add padding-bottom to every cell of the previous row.
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

    // Non-table block: emit root widget spacers as needed.
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
      // Unsplittable block taller than a page — pushed once, stop.
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
      // IMPORTANT: write the pad as `calc(<baseline> + Npx)` so the
      // baseline cell padding-bottom (6px from editor.css) is preserved
      // and the ACTUAL on-screen displacement of the next row equals
      // exactly `s.height`. We then write that same value to
      // `data-pg-pad` so `cellExtraPad` reads back the true displacement.
      // Replacing padding-bottom outright (e.g. `padding-bottom: Npx`)
      // would clobber the 6px baseline, so the real displacement would
      // be `N - 6` while we'd still record `N` — that 6px mismatch puts
      // the broken row right on the page boundary and the recompute
      // loop oscillates the spacer in and out forever.
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
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              const specs = buildDecoSpecs(view);
              const sig = specsSignature(specs);
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
