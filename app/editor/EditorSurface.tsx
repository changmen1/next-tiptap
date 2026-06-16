import { Editor, EditorContent } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getEffectiveMarginMm, getPageDims, useEditorStore } from '../store';

interface Props {
  editor: Editor | null;
  // 让 EditorSurface 暴露滚动容器
  onScrollParent?: (el: HTMLElement | null) => void;
}

/** mm → px at the browser's nominal 96dpi. */
const mmToPx = (mm: number) => (mm * 96) / 25.4;
// Fixed-height page zones (mm). The header band height matches the
// letterhead image's natural rendered height (measured on load); the
// meta + footer bands stay fixed.
const HEADER_ZONE_FALLBACK_MM = 28; // used before the letterhead image loads
const HEADER_META_TOP_MM = 6;    // gap between letterhead and SEPL meta band
const HEADER_META_HEIGHT_MM = 8; // yellow SEPL band height
const CONTENT_AFTER_META_MM = HEADER_META_TOP_MM + HEADER_META_HEIGHT_MM; // 12mm reserve under letterhead
const FOOTER_ZONE_FALLBACK_MM = 13; // image (7mm) + bottom margin (4mm) + breathing (2mm)
const CONTENT_LEFT_MM = 20;
const CONTENT_RIGHT_MM = 15;

/**
 * Editable surface. When pagination is on, content height is measured
 * with a ResizeObserver and N A4-shaped page backgrounds are stacked
 * behind the editable area so the document visually divides into pages.
 */
export default function EditorSurface({ editor, onScrollParent }: Props) {
  const { docId, pageSize, orientation, margins, marginMm, zoom, paginated } = useEditorStore();
  const dims = getPageDims(pageSize, orientation);
  const m = getEffectiveMarginMm(margins, marginMm);
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
  // Top reserve is the letterhead clearance only; the SEPL meta band's
  // extra 14mm is added as padding-top on the editor's first child so it
  // only consumes space on page 1, not on every page.
  const topReservePx = letterheadSafePx;
  const bottomReservePx = footerSafePx;
  const contentPerPagePx = Math.max(1, mmToPx(dims.h) - topReservePx - bottomReservePx);

  useEffect(() => {
    onScrollParent?.(workspaceRef.current);
    if (workspaceRef.current && editor) {
      editor.commands.bindOutlineScrollParent(workspaceRef.current);
    }
  }, [editor, onScrollParent]);

  // CSS vars for paper sizing + zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.style.setProperty('--page-w', `${dims.w}mm`);
    el.style.setProperty('--page-h', `${dims.h}mm`);
    el.style.setProperty('--page-margin', `${m}mm`);
    el.style.setProperty('--zoom', String(zoom));
  }, [dims.w, dims.h, m, zoom]);

  // Feed pagination metrics to the Pagination ProseMirror plugin via data
  // attributes on the ProseMirror DOM. The plugin watches these attrs with
  // a MutationObserver and recomputes spacers whenever they change.
  useEffect(() => {
    if (!editor) return;
    const pm = editor.view.dom as HTMLElement;
    if (paginated) {
      pm.dataset.pageHPx = String(mmToPx(dims.h));
      pm.dataset.marginPx = String(mmToPx(m));
      pm.dataset.pageContentPx = String(contentPerPagePx);
      pm.dataset.gapPx = String(pageGapPx);
    } else {
      delete pm.dataset.pageHPx;
      delete pm.dataset.marginPx;
      delete pm.dataset.pageContentPx;
      delete pm.dataset.gapPx;
    }
  }, [editor, paginated, dims.h, m, contentPerPagePx]);

  // Recompute page count from editor content height.
  useLayoutEffect(() => {
    if (!paginated || !editor) {
      setPageCount(1);
      return;
    }
    const wrap = contentWrapRef.current;
    if (!wrap) return;
    const pm = wrap.querySelector('.ProseMirror') as HTMLElement | null;
    if (!pm) return;

    const recalc = () => {
      const h = pm.scrollHeight;
      // Pagination spacers fill the dead zone between content areas, so the
      // editor's scrollHeight equals (pages-1)*stride + tail, where stride is
      // pageH + visual-gap. Use that directly to count pages.
      const stride = mmToPx(dims.h) + pageGapPx;
      const pages = stride > 0
        ? Math.max(1, Math.floor((h - 2) / stride) + 1)
        : Math.max(1, Math.ceil((h - 2) / contentPerPagePx));
      setPageCount(pages);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(pm);
    return () => ro.disconnect();
  }, [paginated, editor, contentPerPagePx]);

  const pageGapPx = 24; // gap between page tiles (matches CSS)

  const handleLetterheadLoad = (img: HTMLImageElement) => {
    // Compute rendered height from the image's intrinsic aspect ratio times
    // the *logical* page width (mm -> px). This is independent of any ancestor
    // transform (.paper-canvas zoom) and immune to layout-not-ready timing
    // when the image is served from cache. Avoids using offsetHeight /
    // getBoundingClientRect which gave the wrong value at zoom != 100% or
    // before first paint and caused the SEPL meta band to overlap the
    // phone/email block of the letterhead image.
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cssH = mmToPx(dims.w) * (nh / nw);
    if (cssH > 0) setLetterheadSafePx((prev) => (Math.abs(prev - cssH) > 0.5 ? cssH : prev));
  };

  const handleFooterLoad = (img: HTMLImageElement) => {
    // Footer renders edge-to-edge at natural aspect ratio. Compute the
    // rendered height from intrinsic dimensions so we know how much
    // bottom space to reserve for content above it.
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
          {/* Background tiles: one A4-sized "page" per page count */}
          {paginated &&
            Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i}
                className="page-bg"
                style={{ height: `${dims.h}mm`, marginBottom: i === pageCount - 1 ? 0 : `${pageGapPx}px` }}
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

          {/* Editable content overlays the entire stack */}
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
