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

/* ---------------- 导出 HTML ---------------- */
// 将当前 Tiptap 文档导出成一个可独立打开的 HTML 文件。
// 这里会内嵌一小段基础样式，让导出的文件离开应用后仍有接近编辑器的排版。
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

/* ---------------- 导出 TXT ---------------- */
// 纯文本导出只取 editor.getText()，不会保留标题层级、表格、图片等富文本结构。
export function exportTxt(editor: Editor, title: string) {
    saveAs(new Blob([editor.getText()], { type: 'text/plain;charset=utf-8' }), `${safeFile(title)}.txt`);
}

/* ---------------- 打印 / 浏览器 PDF ---------------- */
// 打开一个临时窗口写入 HTML，再调用 window.print()。
// 这种方式依赖浏览器打印对话框，适合“打印/另存为 PDF”，不适合无弹窗自动下载。
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
 * 下载分页预览为 PDF。
 *
 * 这个路径不走浏览器打印对话框，而是：
 * 1. 在当前页面创建一个屏幕外隐藏容器；
 * 2. 按页渲染带抬头、正文窗口、页脚和页码的“纸张”；
 * 3. 用 html2canvas 把每页截成图片；
 * 4. 用 jsPDF 组合成多页 PDF 并自动下载。
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
        /** 信头图片在页面逻辑宽度下的 CSS 像素高度，用来预留正文上方安全区。 */
        letterheadSafePx: number;
        /** 页脚图片在页面逻辑宽度下的 CSS 像素高度，用来预留正文底部安全区。 */
        footerSafePx?: number;
        /** 编辑器里页面卡片之间的视觉间距，PDF 切片时必须保持一致。 */
        pageGapPx?: number;
    }
) {
    // 连等两帧，确保 Pagination 插件刚插入的 spacer Decoration 已经进入 DOM。
    // 如果立即读 innerHTML，可能拿到分页还未稳定的旧结构。
    requestAnimationFrame(() => requestAnimationFrame(() => {
        void (editor.view?.dom as HTMLElement | undefined)?.offsetHeight;
        runPdfExport(editor, opts).catch((err) => {
            console.error('PDF export failed:', err);
        });
    }));
}

async function runPdfExport(
    editor: Editor,
    opts: Parameters<typeof downloadPdf>[1]
) {
    // 优先读取 live ProseMirror DOM，因为它包含分页插件注入的 spacer；
    // getHTML() 只包含文档模型本身，不包含这些仅用于显示/导出的分页辅助节点。
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

    // 用 live DOM 高度重新计算页数。调用方传来的 pageCount 可能来自上一轮 React state，
    // 在导出按钮点击瞬间还没更新到最新分页结果。
    const stridePx = PDF_MM_TO_PX(pageHmm) + pageGapPx;
    let pageCount = opts.pageCount;
    const liveDom = editor.view?.dom as HTMLElement | undefined;
    if (liveDom) {
        const h = liveDom.scrollHeight;
        const pages = Math.max(1, Math.floor((h - 2) / stridePx) + 1);
        pageCount = pages;
    }

    const safeRef = escapeHtml(referenceNo);
    const safeDate = escapeHtml(displayDate);

    const letterheadSafeMm = (letterheadSafePx * 25.4) / 96;
    // 黄色 SEPL 信息条位于信头下方 6mm，高 8mm；这些数值需要和编辑器 CSS 保持一致。
    const seplTopMm = letterheadSafeMm + 6;
    const SEPL_BAND_HEIGHT_MM = 8;
    const CONTENT_LEFT_MM = 20;
    const CONTENT_RIGHT_MM = 15;

    const sheetHtml = (i: number) => {
        const isFirst = i === 0;
        // .pdf-content-window 从信头安全区下方开始；
        // 第 i 页通过 top = -i * stridePx 把连续正文流向上平移，
        // 让第 i 段内容刚好落进当前页的可见正文窗口。
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

    // 在当前 document 中创建屏幕外容器。html2canvas 需要真实参与布局的 DOM，
    // 所以不能只用 detached element；放到 -10000px 处既能布局又不会被用户看到。
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

/* 每个 .pdf-page 都是真实 ${pageWmm}mm x ${pageHmm}mm 的页面盒子。 */
.pdf-export-root .pdf-page {
  width: ${pageWmm}mm;
  height: ${pageHmm}mm;
  position: relative;
  overflow: hidden;
  background: #fff;
}

/* 正文层裁剪到和编辑器一致的可写区域，避免亚像素误差让文字漏到页脚安全区。 */
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
  /* top 按页内联设置；负偏移负责从连续正文流中截取当前页。 */
  font-family: inherit;
  font-size: 11pt;
  line-height: 1.15;
  color: #222;
}
/* 第一页独有的 SEPL 信息条占位，和编辑器中的首个正文节点 padding 规则对应。 */
.pdf-export-root .pdf-content-flow > :first-child:not(.pm-page-spacer),
.pdf-export-root .pdf-content-flow > .pm-page-spacer:first-child + :not(.pm-page-spacer) {
  padding-top: 14mm;
}

/* 正文排版规则：尽量镜像 editor.css，确保 PDF 与编辑器视觉一致。 */
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

/* 页面装饰层：信头、SEPL 信息条、页脚、页码都盖在正文层上方。 */
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

/* 分页 spacer 必须保留在文档流中，否则 PDF 切片位置会和编辑器不一致。 */
.pdf-export-root .pm-page-spacer {
  pointer-events: none;
  user-select: none;
}

/* 如果编辑器里的页面装饰混进 innerHTML，导出层要隐藏它们，避免重复信头/页脚。 */
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

/* 表格分页时给单元格加的 padding 遮罩，和编辑器里的分页插件保持一致。 */
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
        // 等待屏幕外容器内所有图片加载完成，再截图；否则 PDF 可能出现空白信头/页脚。
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

        // jsPDF 使用毫米为单位，页面尺寸与屏幕外 sheet 保持完全一致。
        const orientation = pageWmm > pageHmm ? 'l' : 'p';
        const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: [pageWmm, pageHmm],
            compress: true
        });

        const pageEls = Array.from(root.querySelectorAll<HTMLElement>('.pdf-page'));
        // 以 2x 截图，能让 PDF 中的文字/边框更清晰，但文件体积也会更大。
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

/* ---------------- 导出 .docx ---------------- */
// 把编辑器 HTML 临时挂到 div 中，再递归转换为 docx 库的 Paragraph/Table/ImageRun。
// 这是一个轻量转换器，能覆盖常见论文正文；复杂 Word 样式仍需要更完整的映射层。
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
    // 文本节点直接包装成 TextRun；空白文本忽略，减少 Word 中多余空段落。
    if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || '';
        if (!t.trim()) return [];
        return [new Paragraph({ children: [new TextRun(t)] })];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // 标题节点映射到 Word 的 HeadingLevel，这样导出的 docx 可生成目录/大纲。
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
        // docx.Table 不是 Paragraph，但上层返回类型是 Paragraph[]；
        // 这里用类型断言让它进入 children 列表，docx 库实际支持段落和表格混排。
        return [tableToDocx(el as HTMLTableElement) as unknown as Paragraph];
    }
    if (tag === 'img') {
        const para = await imgToParagraph(el as HTMLImageElement);
        return para ? [para] : [];
    }
    // 兜底策略：不认识的容器节点不直接丢弃，而是递归处理它的子节点。
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
        // next 会继承父级格式，并叠加当前标签/样式提供的格式。
        // 例如 <strong><em>text</em></strong> 会同时得到 bold + italics。
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
            // docx 字号单位是 half-points：11pt 需要写成 22。
            if (!isNaN(num)) next.size = Math.round(num * 2);
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
            // 本地上传图片通常是 data URL，需要手动 base64 解码成 ArrayBuffer。
            const b64 = src.split(',')[1];
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            buf = arr.buffer;
        } else {
            // 网络图片通过 fetch 拉取。生产环境如有鉴权图片，需要在这里处理凭据/CORS。
            const res = await fetch(src);
            buf = await res.arrayBuffer();
        }
        const w = img.naturalWidth || 400;
        const h = img.naturalHeight || 300;
        const maxW = 500;
        // 限制最大宽度，避免大图撑破 Word 页面。
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

// 将 CSS rgb(...) 转成 docx 需要的不带 # 的十六进制颜色。
function rgbToHex(rgb: string): string {
    const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return rgb.replace('#', '');
    return [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
}

/* ---------------- 导入 .docx / .html / .md / .txt  ---------------- */
// 根据文件后缀选择转换方式，并把结果写入当前 Tiptap editor。
// 返回值是建议标题；调用方会用它更新文档名。
export async function importFile(editor: Editor, file: File): Promise<string | null> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx')) {
        // mammoth 将 docx 转成较干净的 HTML，适合再交给 Tiptap schema 解析。
        const buf = await file.arrayBuffer();
        const res = await mammoth.convertToHtml({ arrayBuffer: buf });
        editor.commands.setContent(res.value, { emitUpdate: true });
        return file.name.replace(/\.docx$/i, '');
    }
    if (name.endsWith('.html') || name.endsWith('.htm')) {
        const text = await file.text();
        editor.commands.setContent(text, { emitUpdate: true });
        return file.name.replace(/\.html?$/i, '');
    }
    if (name.endsWith('.md') || name.endsWith('.markdown')) {
        // Markdown 先转 HTML，再由 Tiptap 导入。
        const text = await file.text();
        editor.commands.setContent(markdown.render(text), { emitUpdate: true });
        return file.name.replace(/\.m(?:arkdown|d)$/i, '');
    }
    if (name.endsWith('.txt')) {
        // 纯文本按空行切段，单行换行转换为 <br>，尽量保留原始段落感。
        const text = await file.text();
        const html = text
            .split(/\n\n+/)
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
            .join('');
        editor.commands.setContent(html, { emitUpdate: true });
        return file.name.replace(/\.txt$/i, '');
    }
    alert('Unsupported file type. Use .docx, .html, .md, or .txt');
    return null;
}

/* ---------------- 通用小工具 ---------------- */
// 防止导出的 HTML 标题、纯文本导入等场景发生标签注入。
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
// 文件名清洗：去掉 Windows/macOS 不允许出现在文件名中的字符。
function safeFile(s: string): string {
    return (s || 'document').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
}
