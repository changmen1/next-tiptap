import { Editor, useEditorState } from '@tiptap/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { downloadPdf } from '../io';
import { getPageDims, useEditorStore } from '../store';

interface Props {
  editor: Editor | null;
}

const mmToPx = (mm: number) => (mm * 96) / 25.4;
const PAGE_GAP_PX = 24;
// 这些值必须和 EditorSurface 保持一致，否则编辑区和预览区的分页/安全区会错位。
const HEADER_ZONE_FALLBACK_MM = 28;
const HEADER_META_TOP_MM = 6;
const HEADER_META_HEIGHT_MM = 8;
const CONTENT_AFTER_META_MM = HEADER_META_TOP_MM + HEADER_META_HEIGHT_MM; // 12mm
const FOOTER_ZONE_FALLBACK_MM = 13;
const CONTENT_LEFT_MM = 20;
const CONTENT_RIGHT_MM = 15;

/**
 * 实时预览面板。
 *
 * 它镜像编辑器已经渲染出来的 DOM，而不是只用 editor.getHTML()。
 * 原因是 Pagination 插件插入的 spacer 只存在于 live DOM 中；
 * 如果预览丢掉这些 spacer，用户看到的分页和导出的分页就会不一致。
 */
export default function PreviewPane({ editor }: Props) {
  const { docId, title, pageSize, orientation, paginated, previewZoom, previewZoomIn, previewZoomOut, previewZoomReset } = useEditorStore();
  const dims = getPageDims(pageSize, orientation);
  const referenceNo = `SEPL-${docId.replace(/^doc_/, '').toUpperCase()}`;
  const displayDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  // useEditorState 会在编辑器事务变化时刷新 selector 返回值。
  // 优先读取 view.dom.innerHTML，兜底才用 getHTML。
  const html = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return '';
      return e.view?.dom?.innerHTML ?? e.getHTML();
    }
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [letterheadSafePx, setLetterheadSafePx] = useState(mmToPx(HEADER_ZONE_FALLBACK_MM));
  const [footerSafePx, setFooterSafePx] = useState(mmToPx(FOOTER_ZONE_FALLBACK_MM));
  // 分页模式下顶部安全区只包含信头；SEPL 信息条的首段 padding 已经在正文流里体现。
  const topReservePx = letterheadSafePx;
  const bottomReservePx = footerSafePx;
  const contentPerPagePx = Math.max(1, mmToPx(dims.h) - topReservePx - bottomReservePx);

  const handleLetterheadLoad = (img: HTMLImageElement) => {
    // 和 EditorSurface 一样，使用图片天然宽高比计算逻辑高度，避免被 previewZoom 缩放影响。
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cssH = mmToPx(dims.w) * (nh / nw);
    if (cssH > 0) setLetterheadSafePx((prev) => (Math.abs(prev - cssH) > 0.5 ? cssH : prev));
  };

  const handleFooterLoad = (img: HTMLImageElement) => {
    // 页脚按页面宽度等比渲染，计算高度后给正文预留底部安全区。
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cssH = mmToPx(dims.w) * (nh / nw);
    if (cssH > 0) setFooterSafePx((prev) => (Math.abs(prev - cssH) > 0.5 ? cssH : prev));
  };

  // 根据预览内容高度重新计算页数；预览与编辑器使用同样 pageStride 公式。
  useLayoutEffect(() => {
    if (!paginated) {
      queueMicrotask(() => setPageCount(1));
      return;
    }
    const el = contentRef.current;
    if (!el) return;
    const pageStride = mmToPx(dims.h) + PAGE_GAP_PX;

    const recalc = () => {
      const h = el.scrollHeight;
      const pages = pageStride > 0
        ? Math.max(1, Math.floor((h - 2) / pageStride) + 1)
        : Math.max(1, Math.ceil((h + PAGE_GAP_PX - 2) / (contentPerPagePx + PAGE_GAP_PX)));
      setPageCount(pages);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paginated, contentPerPagePx, html, dims.h]);

  return (
    <div className="preview-pane" aria-label="Preview">
      <div className="preview-header">
        <span>Preview</span>
        <div className="preview-actions">
          <button
            type="button"
            className="rb-btn sm preview-pdf-btn"
            onClick={() => {
              if (!editor) return;
              downloadPdf(editor, {
                title: title || 'Untitled Document',
                referenceNo,
                displayDate,
                pageWmm: dims.w,
                pageHmm: dims.h,
                pageCount,
                letterheadSafePx,
                pageGapPx: PAGE_GAP_PX
              });
            }}
            title="Download as PDF"
            onMouseDown={(e) => e.preventDefault()}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }}>
              <path d="M8 1.5 V10.5 M5 7.5 L8 10.5 L11 7.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 13.5 H13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            PDF
          </button>
        </div>
        <div className="preview-zoom">
          <button
            type="button"
            className="rb-btn sm"
            onClick={previewZoomOut}
            title="Zoom out"
            onMouseDown={(e) => e.preventDefault()}
          >−</button>
          <button
            type="button"
            className="zoom-readout"
            onClick={previewZoomReset}
            title="Reset zoom"
            onMouseDown={(e) => e.preventDefault()}
          >{Math.round(previewZoom * 100)}%</button>
          <button
            type="button"
            className="rb-btn sm"
            onClick={previewZoomIn}
            title="Zoom in"
            onMouseDown={(e) => e.preventDefault()}
          >+</button>
        </div>
      </div>
      <div className="preview-scroll">
        <div
          className="paper-stack preview-stack"
          data-pages={pageCount}
          style={{
            width: `${dims.w}mm`,
            transform: `scale(${previewZoom})`,
            transformOrigin: 'top center',
            ['--letterhead-safe-px' as string]: `${letterheadSafePx}px`
          }}
        >
          {paginated &&
            Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i}
                className="page-bg preview-page-bg"
                style={{
                  height: `${dims.h}mm`,
                  marginBottom: i === pageCount - 1 ? 0 : `${PAGE_GAP_PX}px`
                }}
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

          <div
            className="paper-content-wrap preview-content-wrap"
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
            <div
              className="paper preview-paper"
              data-size={pageSize}
              data-orient={orientation}
              style={
                paginated
                  ? undefined
                  : {
                    width: `${dims.w}mm`,
                    minHeight: `${dims.h}mm`,
                    paddingTop: `calc(${letterheadSafePx}px + ${CONTENT_AFTER_META_MM}mm)`,
                    paddingRight: `${CONTENT_RIGHT_MM}mm`,
                    paddingBottom: `${footerSafePx}px`,
                    paddingLeft: `${CONTENT_LEFT_MM}mm`,
                    position: 'relative'
                  }
              }
            >
              {!paginated && (
                <>
                  <img className="page-letterhead" src="/letterhead.png" alt="" onLoad={(e) => handleLetterheadLoad(e.currentTarget)} />
                  <div className="page-letterhead-meta" aria-hidden="true">
                    <span>SEPL reference number: {referenceNo}</span>
                    <span>Date: {displayDate}</span>
                  </div>
                  <img className="page-footer" src="/footer.png" alt="" onLoad={(e) => handleFooterLoad(e.currentTarget)} />
                </>
              )}
              <div
                ref={contentRef}
                className="paper-content ProseMirror preview-content"
                dangerouslySetInnerHTML={{ __html: html || '<p></p>' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
