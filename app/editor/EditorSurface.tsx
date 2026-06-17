import { Editor, EditorContent } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getEffectiveMarginMm, getPageDims, useEditorStore } from '../store';

interface Props {
  editor: Editor | null;
  // 让 EditorSurface 把真实滚动容器暴露给外层目录组件。
  // 目录跳转不能滚动 window，因为正文滚动发生在 .workspace 内。
  onScrollParent?: (el: HTMLElement | null) => void;
}

/** 毫米转 CSS 像素：浏览器名义上按 96dpi 换算，1in = 25.4mm。 */
const mmToPx = (mm: number) => (mm * 96) / 25.4;
// 固定页面区域。信头/页脚图片的真实渲染高度会在图片加载后根据宽高比修正；
// fallback 值用于图片还没加载时先给正文预留一个安全空间，避免首屏重叠。
const HEADER_ZONE_FALLBACK_MM = 28; // used before the letterhead image loads
const FOOTER_ZONE_FALLBACK_MM = 13; // image (7mm) + bottom margin (4mm) + breathing (2mm)
const CONTENT_LEFT_MM = 20;
const CONTENT_RIGHT_MM = 15;
const PAGE_GAP_PX = 24; // 页面之间的视觉间距，需要和 CSS / PDF 导出保持一致。

/**
 * 可编辑纸张画布。
 *
 * 分页开启时，它会在正文后方堆叠 N 张 page-bg 作为纸张背景；
 * ProseMirror 正文仍然是一条连续文档流，只是 Pagination 插件会插入 spacer，
 * 让正文在视觉上落入每一页的可写区域。
 */
export default function EditorSurface({ editor, onScrollParent }: Props) {
  // 这些设置来自全局 store，改变它们会立即反映到 CSS 变量和分页指标中。
  const { docId, pageSize, orientation, margins, marginMm, zoom, paginated } = useEditorStore();
  const dims = getPageDims(pageSize, orientation);
  const m = getEffectiveMarginMm(margins, marginMm);
  // 演示用参考号：用本地 docId 派生。生产系统通常会替换为论文编号/项目编号。
  const referenceNo = `SEPL-${docId.replace(/^doc_/, '').toUpperCase()}`;
  const displayDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  const canvasRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [letterheadSafePx, setLetterheadSafePx] = useState(mmToPx(HEADER_ZONE_FALLBACK_MM));
  const [footerSafePx, setFooterSafePx] = useState(mmToPx(FOOTER_ZONE_FALLBACK_MM));
  const workspaceRef = useRef<HTMLDivElement>(null);
  // 顶部保留区只包含信头高度；黄色 SEPL 信息条的额外占位由 editor.css 给第一页首个正文节点加 padding。
  // 这样信息条只占第一页空间，而不会让每一页正文都额外下移。
  const topReservePx = letterheadSafePx;
  const bottomReservePx = footerSafePx;
  const contentPerPagePx = Math.max(1, mmToPx(dims.h) - topReservePx - bottomReservePx);

  useEffect(() => {
    onScrollParent?.(workspaceRef.current);
    if (workspaceRef.current && editor) {
      // 通过自定义 Tiptap command 把滚动容器传给 TableOfContents 扩展。
      editor.commands.bindOutlineScrollParent(workspaceRef.current);
    }
  }, [editor, onScrollParent]);

  // 将纸张尺寸、页边距、缩放写成 CSS 变量，样式层只读变量，不必重复计算。
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.style.setProperty('--page-w', `${dims.w}mm`);
    el.style.setProperty('--page-h', `${dims.h}mm`);
    el.style.setProperty('--page-margin', `${m}mm`);
    el.style.setProperty('--zoom', String(zoom));
  }, [dims.w, dims.h, m, zoom]);

  // 把分页插件需要的尺寸指标写到 ProseMirror DOM 的 data-* 属性上。
  // 插件内部用 MutationObserver 监听这些属性，页面大小/边距变化时会重新计算 spacer。
  useEffect(() => {
    if (!editor) return;
    const pm = editor.view.dom as HTMLElement;
    if (paginated) {
      // eslint-disable-next-line react-hooks/immutability -- 这里同步的是外部 ProseMirror DOM dataset，不是修改 React props。
      pm.dataset.pageHPx = String(mmToPx(dims.h));
      pm.dataset.marginPx = String(mmToPx(m));
      pm.dataset.pageContentPx = String(contentPerPagePx);
      pm.dataset.gapPx = String(PAGE_GAP_PX);
    } else {
      delete pm.dataset.pageHPx;
      delete pm.dataset.marginPx;
      delete pm.dataset.pageContentPx;
      delete pm.dataset.gapPx;
    }
  }, [editor, paginated, dims.h, m, contentPerPagePx]);

  // 根据 ProseMirror DOM 高度重新计算页数，用 ResizeObserver 监听正文高度变化。
  useLayoutEffect(() => {
    if (!paginated || !editor) {
      queueMicrotask(() => setPageCount(1));
      return;
    }
    const wrap = contentWrapRef.current;
    if (!wrap) return;
    const pm = wrap.querySelector('.ProseMirror') as HTMLElement | null;
    if (!pm) return;

    const recalc = () => {
      const h = pm.scrollHeight;
      // Pagination spacer 会填充“页脚 + 页间距 + 下一页信头”的不可写区域；
      // 因此连续正文流的页间步长是 pageH + gap，而不是单纯的内容区高度。
      const stride = mmToPx(dims.h) + PAGE_GAP_PX;
      const pages = stride > 0
        ? Math.max(1, Math.floor((h - 2) / stride) + 1)
        : Math.max(1, Math.ceil((h - 2) / contentPerPagePx));
      setPageCount(pages);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(pm);
    return () => ro.disconnect();
  }, [paginated, editor, contentPerPagePx, dims.h]);

  const handleLetterheadLoad = (img: HTMLImageElement) => {
    // 不能用 offsetHeight/getBoundingClientRect 读信头高度，因为画布可能被 zoom transform 缩放；
    // 这里用图片天然宽高比 * 页面逻辑宽度算出未缩放 CSS 高度，结果更稳定。
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cssH = mmToPx(dims.w) * (nh / nw);
    if (cssH > 0) setLetterheadSafePx((prev) => (Math.abs(prev - cssH) > 0.5 ? cssH : prev));
  };

  const handleFooterLoad = (img: HTMLImageElement) => {
    // 页脚同样按页面宽度等比渲染；计算它的逻辑高度后给正文底部预留空间。
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cssH = mmToPx(dims.w) * (nh / nw);
    if (cssH > 0) setFooterSafePx((prev) => (Math.abs(prev - cssH) > 0.5 ? cssH : prev));
  };

  return (
    <div ref={workspaceRef} className="workspace" data-paginated={paginated ? '1' : '0'}>
      <div ref={canvasRef} className="paper-canvas">
        <div
          className="paper-stack"
          data-pages={pageCount}
          style={{ width: `${dims.w}mm`, ['--letterhead-safe-px' as string]: `${letterheadSafePx}px` }}
        >
          {/* 页面背景层：每一页一张固定高度纸张，包含信头、页脚和页码。 */}
          {paginated &&
            Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i}
                className="page-bg"
                style={{ height: `${dims.h}mm`, marginBottom: i === pageCount - 1 ? 0 : `${PAGE_GAP_PX}px` }}
                aria-hidden="true"
              >
                <img
                  className="page-letterhead"
                  src={i === 0 ? '/letterhead.png' : '/letterhead2.png'}
                  alt=""
                  onLoad={(e) => handleLetterheadLoad(e.currentTarget)}
                />
                {i === 0 && (
                  <div className="page-letterhead-meta" aria-hidden="true">
                    <span>SEPL reference number: {referenceNo}</span>
                    <span>Date: {displayDate}</span>
                  </div>
                )}
                <img
                  className="page-footer"
                  src="/footer.png"
                  alt=""
                  onLoad={(e) => handleFooterLoad(e.currentTarget)}
                />
                <span className="page-number">{i + 1}</span>
              </div>
            ))}

          {/* 编辑层：一条连续 ProseMirror 文档流覆盖在页面背景层上方。 */}
          <div
            ref={contentWrapRef}
            className="paper-content-wrap"
            style={
              paginated
                ? {
                  position: 'absolute',
                  inset: 0,
                  paddingTop: `${letterheadSafePx}px`,
                  paddingRight: `${CONTENT_RIGHT_MM}mm`,
                  paddingBottom: `${footerSafePx}px`,
                  paddingLeft: `${CONTENT_LEFT_MM}mm`
                }
                : undefined
            }
          >
            <div className="paper" data-size={pageSize} data-orient={orientation}>
              <EditorContent editor={editor} className="paper-content" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
