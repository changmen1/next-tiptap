import { Editor } from '@tiptap/react';
import {
    AlignmentType,
    Document,
    TableCell as DocxCell,
    TableRow as DocxRow,
    Table as DocxTable,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    TextRun,
    WidthType
} from 'docx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import mammoth from 'mammoth';
import MarkdownIt from 'markdown-it';
const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false
});

/* ---------------- Export HTML ---------------- */
export function exportHtml(editor: Editor, title: string) {
    const body = editor.getHTML();
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#222}
h1,h2,h3,h4{font-family:Inter,Arial,sans-serif}
table{border-collapse:collapse}
table td,table th{border:1px solid #999;padding:6px 10px}
img{max-width:100%}
.page-break{page-break-after:always;border-top:1px dashed #bbb;margin:1rem 0}
blockquote{border-left:4px solid #ccc;padding-left:1rem;color:#555;margin-left:0}
pre{background:#f4f4f4;padding:.75rem 1rem;border-radius:6px;overflow:auto}
</style></head><body>${body}</body></html>`;
    saveAs(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeFile(title)}.html`);
}

/* ---------------- Export TXT ---------------- */
export function exportTxt(editor: Editor, title: string) {
    saveAs(new Blob([editor.getText()], { type: 'text/plain;charset=utf-8' }), `${safeFile(title)}.txt`);
}

/* ---------------- Print / PDF ---------------- */
export function printDoc(editor: Editor, title: string) {
    const body = editor.getHTML();
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page{margin:1in}
body{font-family:Calibri,Arial,sans-serif;line-height:1.5;color:#000}
h1,h2,h3,h4{font-family:Inter,Arial,sans-serif}
table{border-collapse:collapse;width:100%}
table td,table th{border:1px solid #444;padding:6px 10px}
img{max-width:100%}
.page-break{page-break-after:always;border:0;height:0}
blockquote{border-left:4px solid #888;padding-left:1rem;color:#444}
pre{background:#f4f4f4;padding:.5rem;border-radius:4px}
</style></head><body>${body}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
        w.print();
    }, 250);
}

/**
 * Download the paginated preview as PDF.
 *
 * Renders N independent A4-sized "page sheets" (one per preview page)
 * into a hidden offscreen container, captures each with html2canvas,
 * and assembles a multi-page PDF via jsPDF. Triggers an automatic
 * file download — no print dialog, no popup window.
 */
const PDF_MM_TO_PX = (mm: number) => (mm * 96) / 25.4;

export function downloadPdf(
    editor: Editor,
    opts: {
        title: string;
        referenceNo: string;
        displayDate: string;
        pageWmm: number;
        pageHmm: number;
        pageCount: number;
        /** Letterhead height in CSS px (rendered at the page's logical width). */
        letterheadSafePx: number;
        /** Footer image height in CSS px (rendered at the page's logical width). */
        footerSafePx?: number;
        /** Visual gap between page tiles in px (matches the editor; default 24). */
        pageGapPx?: number;
    }
) {
    // Wait two animation frames so any pending Pagination plugin update
    // has committed to the DOM before we serialise the body.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        void (editor.view?.dom as HTMLElement | undefined)?.offsetHeight;
        runPdfExport(editor, opts).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('PDF export failed:', err);
        });
    }));
}

async function runPdfExport(
    editor: Editor,
    opts: Parameters<typeof downloadPdf>[1]
) {
    const body = editor.view?.dom?.innerHTML ?? editor.getHTML();

    const {
        title,
        referenceNo,
        displayDate,
        pageWmm,
        pageHmm,
        letterheadSafePx,
        footerSafePx = 0,
        pageGapPx = 24
    } = opts;

    // Recompute pageCount from the LIVE editor DOM height now that pagination
    // has settled — the caller's React-state value may be from a prior pass.
    const stridePx = PDF_MM_TO_PX(pageHmm) + pageGapPx;
    let pageCount = opts.pageCount;
    const liveDom = editor.view?.dom as HTMLElement | undefined;
    if (liveDom) {
        const h = liveDom.scrollHeight;
        const pages = Math.max(1, Math.floor((h - 2) / stridePx) + 1);
        pageCount = pages;
    }

    const safeTitle = escapeHtml(title);
    const safeRef = escapeHtml(referenceNo);
    const safeDate = escapeHtml(displayDate);

    const letterheadSafeMm = (letterheadSafePx * 25.4) / 96;
    // SEPL band sits 6mm below the letterhead bottom and is 8mm tall.
    const seplTopMm = letterheadSafeMm + 6;
    const SEPL_BAND_HEIGHT_MM = 8;
    const CONTENT_LEFT_MM = 20;
    const CONTENT_RIGHT_MM = 15;

    const sheetHtml = (i: number) => {
        const isFirst = i === 0;
        // .pdf-content-window now starts at sheet y = letterheadSafePx, so
        // a flow positioned at top=0 already aligns to the content-area
        // top. For pages > 0 we shift up by i*stridePx so the i-th content
        // band lands at the visible top of the window.
        const topPx = -i * stridePx;
        const letterheadSrc = isFirst
            ? `${location.origin}/letterhead.png`
            : `${location.origin}/letterhead2.png`;
        return `<section class="pdf-page${isFirst ? ' first' : ''}">
        <div class="pdf-content-window">
          <div class="pdf-content-flow" style="top: ${topPx}px">${body}</div>
        </div>
        <img class="pdf-letterhead" src="${letterheadSrc}" alt="" />
        ${isFirst
                ? `<div class="pdf-sepl-band">
                 <span>SEPL reference number: ${safeRef}</span>
                 <span>Date: ${safeDate}</span>
               </div>`
                : ''
            }
        <img class="pdf-footer" src="${location.origin}/footer.png" alt="" />
        <span class="pdf-page-num">${i + 1}</span>
      </section>`;
    };
    const sheets = Array.from({ length: Math.max(1, pageCount) }, (_, i) => sheetHtml(i)).join('\n');

    // Build an offscreen container in the *current* document and render
    // all sheets there. The container is positioned far off-screen so the
    // user never sees it, but it is part of the live layout, which is
    // required for html2canvas to capture it correctly.
    const css = `
.pdf-export-root {
  position: fixed;
  left: -10000px;
  top: 0;
  z-index: -1;
  pointer-events: none;
  background: #fff;
  font-family: 'Calibri', 'Carlito', 'Segoe UI', Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.15;
  color: #222;
}
.pdf-export-root, .pdf-export-root * { box-sizing: border-box; }

/* Each sheet is a real ${pageWmm}mm x ${pageHmm}mm page. */
.pdf-export-root .pdf-page {
  width: ${pageWmm}mm;
  height: ${pageHmm}mm;
  position: relative;
  overflow: hidden;
  background: #fff;
}

/* Content layer — clips to the SAME area the editor uses for content
 * ([letterheadSafePx, pageHpx - footerSafePx]). This prevents any
 * sub-pixel overflow from the editor's pagination from leaking into
 * the dead zone above the footer image. */
.pdf-export-root .pdf-content-window {
  position: absolute;
  top: ${letterheadSafePx}px;
  bottom: ${footerSafePx}px;
  left: 0;
  right: 0;
  overflow: hidden;
  z-index: 1;
}
.pdf-export-root .pdf-content-flow {
  position: absolute;
  left: ${CONTENT_LEFT_MM}mm;
  right: ${CONTENT_RIGHT_MM}mm;
  /* top set inline per page; relative to .pdf-content-window which now
   * starts at sheet y = letterheadSafePx, so flow y=0 aligns to that
   * top when topPx = -i*stridePx. */
  font-family: inherit;
  font-size: 11pt;
  line-height: 1.15;
  color: #222;
}
/* Page-1-only SEPL meta-band reservation matches the editor's
 * .ProseMirror > :first-child rule. */
.pdf-export-root .pdf-content-flow > :first-child:not(.pm-page-spacer),
.pdf-export-root .pdf-content-flow > .pm-page-spacer:first-child + :not(.pm-page-spacer) {
  padding-top: 14mm;
}

/* Body content rules (mirror editor styling). */
.pdf-export-root .pdf-content-flow p { margin: 0 0 8pt; }
.pdf-export-root .pdf-content-flow h1 { font-size: 16pt; margin: 12pt 0 0; font-weight: 400; color: #2e74b5; line-height: 1.25; }
.pdf-export-root .pdf-content-flow h2 { font-size: 13pt; margin: 2pt 0 0; font-weight: 400; color: #2e74b5; line-height: 1.25; }
.pdf-export-root .pdf-content-flow h3 { font-size: 12pt; margin: 2pt 0 0; font-weight: 400; color: #1f4e79; line-height: 1.25; }
.pdf-export-root .pdf-content-flow h4 { font-size: 11pt; margin: 2pt 0 0; font-weight: 400; font-style: italic; color: #2e74b5; line-height: 1.25; }
.pdf-export-root .pdf-content-flow h5 { font-size: 11pt; margin: 2pt 0 0; font-weight: 400; color: #2e74b5; line-height: 1.25; }
.pdf-export-root .pdf-content-flow h6 { font-size: 11pt; margin: 2pt 0 0; font-weight: 400; font-style: italic; color: #1f4e79; line-height: 1.25; }
.pdf-export-root .pdf-content-flow ul { list-style-type: disc; padding-left: 0.5in; margin: 0 0 8pt; }
.pdf-export-root .pdf-content-flow ul ul { list-style-type: circle; }
.pdf-export-root .pdf-content-flow ul ul ul { list-style-type: square; }
.pdf-export-root .pdf-content-flow ol { list-style-type: decimal; padding-left: 0.5in; margin: 0 0 8pt; }
.pdf-export-root .pdf-content-flow ol ol { list-style-type: lower-alpha; }
.pdf-export-root .pdf-content-flow ol ol ol { list-style-type: lower-roman; }
.pdf-export-root .pdf-content-flow li { margin: 0; }
.pdf-export-root .pdf-content-flow li > p { margin: 0; }
.pdf-export-root .pdf-content-flow blockquote {
  border-left: 4px solid #1f4f88;
  margin: 8px 0;
  padding: 4px 12px;
  color: #555;
  background: #eaf1fa;
  border-radius: 0 4px 4px 0;
}
.pdf-export-root .pdf-content-flow pre,
.pdf-export-root .pdf-content-flow .code-block {
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px 12px;
  font-family: 'Source Code Pro', 'Consolas', monospace;
  font-size: 10pt;
  overflow: auto;
}
.pdf-export-root .pdf-content-flow a { color: #1f4f88; text-decoration: underline; }
.pdf-export-root .pdf-content-flow hr,
.pdf-export-root .pdf-content-flow hr.hr {
  border: 0;
  border-top: 1px solid #888;
  margin: 8pt 0;
}
.pdf-export-root .pdf-content-flow strong { font-weight: 700; }
.pdf-export-root .pdf-content-flow em { font-style: italic; }
.pdf-export-root .pdf-content-flow u { text-decoration: underline; }
.pdf-export-root .pdf-content-flow s { text-decoration: line-through; }
.pdf-export-root .pdf-content-flow sub { vertical-align: sub; font-size: 0.75em; }
.pdf-export-root .pdf-content-flow sup { vertical-align: super; font-size: 0.75em; }

/* Chrome layers — opaque, z-index above content. */
.pdf-export-root .pdf-letterhead {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: auto;
  display: block;
  z-index: 5;
  background: #fff;
}
.pdf-export-root .pdf-sepl-band {
  position: absolute;
  top: ${seplTopMm}mm;
  left: ${CONTENT_LEFT_MM}mm;
  right: ${CONTENT_RIGHT_MM}mm;
  height: ${SEPL_BAND_HEIGHT_MM}mm;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8mm;
  padding: 0 4mm;
  background: #fff3b6;
  font-size: 10pt;
  font-weight: 600;
  color: #1b1b1b;
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
}
.pdf-export-root .pdf-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: auto;
  display: block;
  background: #fff;
  z-index: 5;
}
.pdf-export-root .pdf-page-num {
  position: absolute;
  right: ${CONTENT_RIGHT_MM}mm;
  bottom: 6mm;
  font-size: 9pt;
  color: #555;
  z-index: 7;
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
}

/* Spacer widgets stay in flow so slice math matches the editor. */
.pdf-export-root .pm-page-spacer {
  pointer-events: none;
  user-select: none;
}

/* Editor's per-page chrome (when leaked into cloned innerHTML) hidden. */
.pdf-export-root .pdf-content-flow .page-letterhead,
.pdf-export-root .pdf-content-flow .page-letterhead-meta,
.pdf-export-root .pdf-content-flow .page-footer,
.pdf-export-root .pdf-content-flow .page-number,
.pdf-export-root .pdf-content-flow .we-table-select-all { display: none !important; }

.pdf-export-root .pdf-content-flow table {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
  word-break: break-word;
  overflow-wrap: anywhere;
  margin: 0 0 8pt;
}
.pdf-export-root .pdf-content-flow table[style*="width"],
.pdf-export-root .pdf-content-flow table[width] {
  width: 100% !important;
  max-width: 100% !important;
}
.pdf-export-root .pdf-content-flow td,
.pdf-export-root .pdf-content-flow th {
  border: 1px solid #8c96a3;
  padding: 6px 8px;
  vertical-align: top;
  position: relative;
  font-size: 11pt;
  line-height: 1.15;
}
.pdf-export-root .pdf-content-flow td[style*="width"],
.pdf-export-root .pdf-content-flow th[style*="width"],
.pdf-export-root .pdf-content-flow td[width],
.pdf-export-root .pdf-content-flow th[width] {
  width: auto !important;
  max-width: 100% !important;
  white-space: normal !important;
}
.pdf-export-root .pdf-content-flow th {
  background: transparent;
  font-weight: bold;
  text-align: left;
}
.pdf-export-root .pdf-content-flow table[data-table-style] th {
  background: #f1f3f5;
}

/* Cell-pad mask (mirrors editor). */
.pdf-export-root .pdf-content-flow td[data-pg-pad]::before,
.pdf-export-root .pdf-content-flow th[data-pg-pad]::before {
  content: '';
  position: absolute;
  left: -2px;
  right: -2px;
  bottom: -1px;
  height: calc(var(--pg-pad-h, 0px) + 2px);
  background: #fff;
  z-index: 2;
  pointer-events: none;
}

.pdf-export-root .pdf-content-flow img { max-width: 100%; height: auto; }
.pdf-export-root .pdf-content-flow .page-break {
  border: 0;
  height: 0;
  margin: 0;
}
`;

    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-pdf-export', '1');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    const root = document.createElement('div');
    root.className = 'pdf-export-root';
    root.innerHTML = sheets;
    document.body.appendChild(root);

    try {
        // Wait for every <img> in the offscreen tree to finish loading.
        const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
        await Promise.all(
            imgs.map(
                (img) =>
                    new Promise<void>((resolve) => {
                        if (img.complete && img.naturalHeight > 0) {
                            resolve();
                            return;
                        }
                        const done = () => resolve();
                        img.addEventListener('load', done, { once: true });
                        img.addEventListener('error', done, { once: true });
                    })
            )
        );

        // jsPDF page setup matches sheet size in millimetres.
        const orientation = pageWmm > pageHmm ? 'l' : 'p';
        const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: [pageWmm, pageHmm],
            compress: true
        });

        const pageEls = Array.from(root.querySelectorAll<HTMLElement>('.pdf-page'));
        // Render each sheet with html2canvas at 2x for crisp text.
        const captureScale = 2;
        for (let i = 0; i < pageEls.length; i++) {
            const el = pageEls[i];
            const canvas = await html2canvas(el, {
                scale: captureScale,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: el.offsetWidth,
                windowHeight: el.offsetHeight
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            if (i > 0) {
                pdf.addPage([pageWmm, pageHmm], orientation);
            }
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWmm, pageHmm, undefined, 'FAST');
        }

        pdf.save(`${safeFile(title)}.pdf`);
    } finally {
        if (root.parentNode) root.parentNode.removeChild(root);
        if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    }
}

/* ---------------- Export .docx ---------------- */
export async function exportDocx(editor: Editor, title: string) {
    const root = document.createElement('div');
    root.innerHTML = editor.getHTML();
    const children = await nodesToDocx(Array.from(root.childNodes));
    const doc = new Document({
        creator: 'WordEditor',
        title,
        sections: [{ properties: {}, children }]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${safeFile(title)}.docx`);
}

async function nodesToDocx(nodes: ChildNode[]): Promise<Paragraph[]> {
    const out: Paragraph[] = [];
    for (const n of nodes) {
        const p = await elementToParagraphs(n);
        out.push(...p);
    }
    return out;
}

async function elementToParagraphs(node: ChildNode): Promise<Paragraph[]> {
    if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || '';
        if (!t.trim()) return [];
        return [new Paragraph({ children: [new TextRun(t)] })];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Headings
    const headingMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        h1: HeadingLevel.HEADING_1,
        h2: HeadingLevel.HEADING_2,
        h3: HeadingLevel.HEADING_3,
        h4: HeadingLevel.HEADING_4,
        h5: HeadingLevel.HEADING_5,
        h6: HeadingLevel.HEADING_6
    };
    if (headingMap[tag]) {
        return [
            new Paragraph({
                heading: headingMap[tag],
                alignment: alignFromStyle(el),
                children: inlineRuns(el)
            })
        ];
    }

    if (tag === 'p') {
        return [
            new Paragraph({
                alignment: alignFromStyle(el),
                children: inlineRuns(el)
            })
        ];
    }
    if (tag === 'br') {
        return [new Paragraph({ children: [new TextRun({ text: '', break: 1 })] })];
    }
    if (tag === 'hr' || el.classList.contains('page-break')) {
        return [new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true })];
    }
    if (tag === 'blockquote') {
        return [new Paragraph({ children: inlineRuns(el), indent: { left: 720 } })];
    }
    if (tag === 'pre') {
        return [new Paragraph({ children: [new TextRun({ text: el.textContent || '', font: 'Consolas' })] })];
    }
    if (tag === 'ul' || tag === 'ol') {
        const items: Paragraph[] = [];
        for (const li of Array.from(el.children)) {
            items.push(
                new Paragraph({
                    children: inlineRuns(li as HTMLElement),
                    bullet: tag === 'ul' ? { level: 0 } : undefined,
                    numbering: tag === 'ol' ? { reference: 'num-default', level: 0 } : undefined
                })
            );
        }
        return items;
    }
    if (tag === 'table') {
        return [tableToDocx(el as HTMLTableElement) as unknown as Paragraph];
    }
    if (tag === 'img') {
        const para = await imgToParagraph(el as HTMLImageElement);
        return para ? [para] : [];
    }
    // Fallback: recurse children
    const acc: Paragraph[] = [];
    for (const c of Array.from(el.childNodes)) {
        acc.push(...(await elementToParagraphs(c)));
    }
    return acc;
}

function inlineRuns(el: HTMLElement, inherited: Record<string, unknown> = {}): TextRun[] {
    const runs: TextRun[] = [];
    const walk = (node: ChildNode, fmt: Record<string, unknown>) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (!text) return;
            runs.push(new TextRun({ text, ...fmt }));
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const e = node as HTMLElement;
        const next: Record<string, unknown> = { ...fmt };
        const t = e.tagName.toLowerCase();
        if (t === 'strong' || t === 'b') next.bold = true;
        if (t === 'em' || t === 'i') next.italics = true;
        if (t === 'u') next.underline = {};
        if (t === 's' || t === 'strike' || t === 'del') next.strike = true;
        if (t === 'sub') next.subScript = true;
        if (t === 'sup') next.superScript = true;
        const color = e.style.color;
        if (color) next.color = rgbToHex(color);
        const fs = e.style.fontSize;
        if (fs) {
            const num = parseFloat(fs);
            if (!isNaN(num)) next.size = Math.round(num * 2); // half-points
        }
        const ff = e.style.fontFamily;
        if (ff) next.font = ff.replace(/['"]/g, '').split(',')[0].trim();
        const hl = e.style.backgroundColor;
        if (hl) next.highlight = 'yellow';
        for (const child of Array.from(e.childNodes)) walk(child, next);
    };
    for (const c of Array.from(el.childNodes)) walk(c, inherited);
    return runs.length ? runs : [new TextRun('')];
}

function alignFromStyle(el: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    const a = el.style.textAlign;
    if (a === 'center') return AlignmentType.CENTER;
    if (a === 'right') return AlignmentType.RIGHT;
    if (a === 'justify') return AlignmentType.JUSTIFIED;
    if (a === 'left') return AlignmentType.LEFT;
    return undefined;
}

function tableToDocx(el: HTMLTableElement): DocxTable {
    const rows: DocxRow[] = [];
    for (const tr of Array.from(el.rows)) {
        const cells: DocxCell[] = [];
        for (const td of Array.from(tr.cells)) {
            cells.push(
                new DocxCell({
                    children: [new Paragraph({ children: inlineRuns(td) })],
                    width: { size: 100 / tr.cells.length, type: WidthType.PERCENTAGE }
                })
            );
        }
        rows.push(new DocxRow({ children: cells }));
    }
    return new DocxTable({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function imgToParagraph(img: HTMLImageElement): Promise<Paragraph | null> {
    try {
        const src = img.src;
        let buf: ArrayBuffer;
        if (src.startsWith('data:')) {
            const b64 = src.split(',')[1];
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            buf = arr.buffer;
        } else {
            const res = await fetch(src);
            buf = await res.arrayBuffer();
        }
        const w = img.naturalWidth || 400;
        const h = img.naturalHeight || 300;
        const maxW = 500;
        const scale = w > maxW ? maxW / w : 1;
        return new Paragraph({
            children: [
                new ImageRun({
                    data: buf,
                    transformation: { width: Math.round(w * scale), height: Math.round(h * scale) }
                } as ConstructorParameters<typeof ImageRun>[0])
            ]
        });
    } catch {
        return null;
    }
}

function rgbToHex(rgb: string): string {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return rgb.replace('#', '');
    return [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
}

/* ---------------- Import .docx / .html / .md / .txt  ---------------- */
export async function importFile(editor: Editor, file: File): Promise<string | null> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx')) {
        const buf = await file.arrayBuffer();
        const res = await mammoth.convertToHtml({ arrayBuffer: buf });
        editor.commands.setContent(res.value, true as any);
        return file.name.replace(/\.docx$/i, '');
    }
    if (name.endsWith('.html') || name.endsWith('.htm')) {
        const text = await file.text();
        editor.commands.setContent(text, true as any);
        return file.name.replace(/\.html?$/i, '');
    }
    if (name.endsWith('.md') || name.endsWith('.markdown')) {
        const text = await file.text();
        editor.commands.setContent(markdown.render(text), true as any);
        return file.name.replace(/\.m(?:arkdown|d)$/i, '');
    }
    if (name.endsWith('.txt')) {
        const text = await file.text();
        const html = text
            .split(/\n\n+/)
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
            .join('');
        editor.commands.setContent(html, true as any);
        return file.name.replace(/\.txt$/i, '');
    }
    alert('Unsupported file type. Use .docx, .html, .md, or .txt');
    return null;
}

/* ---------------- helpers ---------------- */
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function safeFile(s: string): string {
    return (s || 'document').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
}
