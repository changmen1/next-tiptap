import { Editor } from '@tiptap/react';
import { useRef } from 'react';
import { RBtn, RGroup } from './Controls';
import SplitButton from './SplitButton';
import TablePopover from './TablePopover';

interface Props {
  editor: Editor;
  inTable: boolean;
}

const SHAPES: { id: string; label: string; svg: string }[] = [
  // 每个形状先保存为 SVG 片段，插入时再包成完整 SVG 并转成 data URI 图片。
  { id: 'rect', label: 'Rectangle', svg: '<rect x="5" y="15" width="110" height="50" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'rounded', label: 'Rounded Rectangle', svg: '<rect x="5" y="15" width="110" height="50" rx="10" ry="10" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'oval', label: 'Oval', svg: '<ellipse cx="60" cy="40" rx="55" ry="25" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'tri', label: 'Triangle', svg: '<polygon points="60,10 110,70 10,70" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'diamond', label: 'Diamond', svg: '<polygon points="60,8 115,40 60,72 5,40" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'arrow-r', label: 'Right Arrow', svg: '<polygon points="5,30 70,30 70,15 115,40 70,65 70,50 5,50" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'arrow-l', label: 'Left Arrow', svg: '<polygon points="115,30 50,30 50,15 5,40 50,65 50,50 115,50" fill="#dbe6f3" stroke="#2e74b5" stroke-width="2"/>' },
  { id: 'star', label: 'Star', svg: '<polygon points="60,8 72,32 100,34 78,52 86,80 60,64 34,80 42,52 20,34 48,32" fill="#fff2a8" stroke="#c69d00" stroke-width="2"/>' },
  { id: 'heart', label: 'Heart', svg: '<path d="M60 70 C 20 45 20 18 40 18 C 50 18 60 28 60 36 C 60 28 70 18 80 18 C 100 18 100 45 60 70 Z" fill="#ffd1d1" stroke="#c00000" stroke-width="2"/>' },
  { id: 'line', label: 'Line', svg: '<line x1="5" y1="40" x2="115" y2="40" stroke="#2e74b5" stroke-width="3"/>' },
  { id: 'arrow-line', label: 'Arrow', svg: '<line x1="5" y1="40" x2="105" y2="40" stroke="#2e74b5" stroke-width="3"/><polygon points="115,40 100,32 100,48" fill="#2e74b5"/>' },
  { id: 'check', label: 'Checkmark', svg: '<polyline points="15,40 50,65 110,15" fill="none" stroke="#2e8a2e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' }
];

const ICONS = [
  // 简单符号/emoji 图标直接作为文本插入，适合轻量装饰，不生成复杂节点。
  '★','☆','♥','♦','♣','♠','✓','✗','✦','✧',
  '☀','☁','☂','☃','❄','✿','✾','❀','☘','☮',
  '☎','✉','✎','✏','✂','⚙','⚡','⌚','⌛','⏰',
  '➤','➔','➜','➢','➣','➡','⬅','⬆','⬇','⇄',
  '🏠','🏢','🏫','🏥','🏦','🛒','🛍','📁','📂','📅'
];

const SYMBOLS = [
  // 常用版权、数学、希腊字母、货币符号。
  '©','®','™','§','¶','†','‡','•','◦','‣',
  '°','′','″','‴','⌀','∅','∞','≈','≠','≤',
  '≥','±','×','÷','√','∑','∏','∫','∂','∇',
  '∈','∉','∋','∪','∩','⊂','⊃','⊆','⊇','⊕',
  'α','β','γ','δ','ε','ζ','η','θ','λ','μ',
  'π','σ','φ','ψ','ω','Δ','Σ','Π','Φ','Ω',
  '€','£','¥','¢','₹','₽','₩','₪','₫','¤'
];

const PAGE_NUM_FORMATS: { id: string; label: string; render: (n: number, total: number) => string }[] = [
  // 当前只是插入静态占位文本；如果需要真实页码域，可在导出/PDF 阶段再替换。
  { id: 'plain', label: 'Plain Number', render: (n) => String(n) },
  { id: 'page-n', label: 'Page N', render: (n) => `Page ${n}` },
  { id: 'n-of-m', label: 'Page N of M', render: (n, t) => `Page ${n} of ${t}` },
  { id: 'dash', label: '— N —', render: (n) => `— ${n} —` }
];

export default function InsertTab({ editor, inTable }: Props) {
  // 隐藏 input 只用于“本机图片”选择；按钮点击时通过 ref 触发系统文件选择器。
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 简化命令链写法，并保证执行命令前恢复编辑器焦点。
  const focus = () => editor.chain().focus();

  // ===== 页面相关插入 =====
  const insertCoverPage = (variant: 'simple' | 'banded' | 'minimal') => {
    // 封面页使用 HTML 片段插入，紧跟一个硬分页符和空段落，方便用户继续写正文。
    let html = '';
    if (variant === 'simple') {
      html = `
        <div class="cover-page" data-variant="simple">
          <h1 style="font-size:42pt;text-align:center;margin-top:120pt;">Document Title</h1>
          <h2 style="font-size:18pt;text-align:center;color:#7f7f7f;margin-top:24pt;">Document subtitle</h2>
          <p style="text-align:center;margin-top:80pt;font-size:12pt;">Author Name</p>
          <p style="text-align:center;font-size:12pt;color:#7f7f7f;">${new Date().toLocaleDateString()}</p>
        </div>
        <div class="page-break" data-page-break="true" contenteditable="false"><span class="pb-label">Page Break</span></div>
        <p></p>
      `;
    } else if (variant === 'banded') {
      html = `
        <div class="cover-page" data-variant="banded" style="border-top:8pt solid #2e74b5;border-bottom:8pt solid #2e74b5;padding:80pt 0;">
          <h1 style="font-size:36pt;text-align:center;color:#2e74b5;">Document Title</h1>
          <h2 style="font-size:16pt;text-align:center;color:#444;margin-top:18pt;">Subtitle here</h2>
          <p style="text-align:center;margin-top:60pt;">Author · ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="page-break" data-page-break="true" contenteditable="false"><span class="pb-label">Page Break</span></div>
        <p></p>
      `;
    } else {
      html = `
        <div class="cover-page" data-variant="minimal">
          <h1 style="font-size:30pt;margin-top:200pt;">Document Title</h1>
          <p style="font-size:13pt;color:#7f7f7f;margin-top:8pt;">Subtitle</p>
          <p style="margin-top:60pt;font-size:11pt;">${new Date().toLocaleDateString()}</p>
        </div>
        <div class="page-break" data-page-break="true" contenteditable="false"><span class="pb-label">Page Break</span></div>
        <p></p>
      `;
    }
    editor.chain().focus().insertContent(html).run();
  };

  const insertBlankPage = () => {
    // 空白页本质上是“前后两个分页符 + 中间空段落”。
    editor
      .chain()
      .focus()
      .insertPageBreak()
      .insertContent({ type: 'paragraph' })
      .insertPageBreak()
      .run();
  };

  // ===== 图片 =====
  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // 读成本地 data URL 后插入图片，文档 HTML 可以自包含这张图。
      const src = String(reader.result);
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const insertOnlinePicture = () => {
    // 在线图片只保存 URL；导出 docx/pdf 时可能受 CORS 或网络可用性影响。
    const url = window.prompt('Image URL:');
    if (!url) return;
    editor.chain().focus().setImage({ src: url, alt: '' }).run();
  };

  // ===== 形状 =====
  const insertShape = (svg: string) => {
    // 形状作为图片插入，而不是作为可编辑 SVG 节点；这样与 Tiptap Image 扩展兼容。
    const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">${svg}</svg>`;
    const dataUri = `data:image/svg+xml;base64,${btoa(full)}`;
    editor.chain().focus().setImage({ src: dataUri, alt: 'shape' }).run();
  };

  // ===== 链接/书签 =====
  const insertLink = () => {
    // 如果当前选区已经在链接内，默认值带出原 href，方便修改。
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL:', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      // 没有选中文本时，询问显示文本并插入完整 <a>。
      const text = window.prompt('Display text:', url) || url;
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}" target="_blank" rel="noopener">${text}</a>`)
        .run();
    } else {
      // 有选区时，只给现有文本加 link mark。
      editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).setTextSelection({ from, to }).run();
    }
  };
  const insertBookmark = () => {
    // 书签用空 a[id] 标记位置，后续可配合目录/引用功能扩展。
    const name = window.prompt('Bookmark name (no spaces):');
    if (!name) return;
    const safe = name.replace(/\s+/g, '_');
    editor.chain().focus().insertContent(`<a id="${safe}" class="bookmark" title="Bookmark: ${safe}"></a>`).run();
  };

  // ===== 页眉/页脚占位文本 =====
  const insertHeader = () => {
    // 这里插入的是正文中的模拟页眉文本，不是 Word/PDF 的真实页眉区域。
    const text = window.prompt('Header text:', 'Document Header') || '';
    editor.chain().focus().setTextSelection(0).insertContent(`<p style="text-align:center;font-size:10pt;color:#7f7f7f;">${text}</p>`).run();
  };
  const insertFooter = () => {
    // 插入到文档末尾，作为轻量占位；真正页脚由 EditorSurface/PDF 导出层绘制。
    const text = window.prompt('Footer text:', 'Document Footer') || '';
    const end = editor.state.doc.content.size;
    editor.chain().focus().setTextSelection(end).insertContent(`<p style="text-align:center;font-size:10pt;color:#7f7f7f;">${text}</p>`).run();
  };
  const insertPageNumber = (id: string) => {
    // 插入页码占位 span，后续可在导出阶段按 data-format 替换真实页码。
    const f = PAGE_NUM_FORMATS.find((x) => x.id === id) || PAGE_NUM_FORMATS[0];
    editor.chain().focus().insertContent(`<span class="page-number-field" data-format="${id}">${f.render(1, 1)}</span>`).run();
  };

  // ===== 文本组件 =====
  const insertTextBox = () => {
    // 用 blockquote 模拟文本框，方便沿用现有块级节点和 CSS。
    editor
      .chain()
      .focus()
      .insertContent(
        `<blockquote class="text-box" style="border:1pt solid #2e74b5;padding:10pt;border-radius:4pt;background:#f3f7fc;"><p>Type your text here…</p></blockquote>`
      )
      .run();
  };
  const insertDropCap = () => {
    // 找到当前段落/标题的首字符，将其替换成带 float 的大号 span。
    const { $from } = editor.state.selection;
    let pos: number | null = null;
    let firstChar = '';
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        pos = $from.before(d);
        firstChar = node.textContent.charAt(0);
        break;
      }
    }
    if (pos == null || !firstChar) return;
    const text = firstChar;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: pos + 1, to: pos + 1 + text.length })
      .insertContent(`<span class="drop-cap" style="float:left;font-size:48pt;line-height:1;padding:4pt 6pt 0 0;font-weight:700;">${text}</span>`)
      .run();
  };
  const insertDateTime = (mode: 'date' | 'time' | 'datetime' | 'long') => {
    const now = new Date();
    let s = '';
    if (mode === 'date') s = now.toLocaleDateString();
    else if (mode === 'time') s = now.toLocaleTimeString();
    else if (mode === 'datetime') s = now.toLocaleString();
    else
      s = now.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    editor.chain().focus().insertContent(s).run();
  };

  // ===== 符号 / 公式占位 =====
  const insertSymbol = (sym: string) => editor.chain().focus().insertContent(sym).run();
  const insertEquation = () => {
    // 当前公式只是文本占位 + data-tex；如需真正公式渲染，可接 KaTeX/MathJax。
    const tex = window.prompt('Enter equation (LaTeX-style):', 'a^2 + b^2 = c^2');
    if (!tex) return;
    editor.chain().focus().insertContent(`<span class="equation" data-tex="${tex.replace(/"/g, '&quot;')}">${tex}</span>`).run();
  };

  return (
    <section className="ribbon-panel insert-panel" role="tabpanel">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {/* === Pages === */}
      <RGroup label="Pages">
        <div className="big-row">
          <SplitButton
            stacked
            main={
              <span className="rb-big">
                <span className="ico ico-cover" aria-hidden>📄</span>
                <span className="rb-big-label">Cover<br />Page</span>
              </span>
            }
            title="Cover Page"
            onClick={() => insertCoverPage('simple')}
            popover={(close) => (
              <div className="cover-gallery">
                {(['simple', 'banded', 'minimal'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="cover-card"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { insertCoverPage(v); close(); }}
                  >
                    <span className={`cover-preview cover-${v}`}>
                      <span className="cv-title">Title</span>
                      <span className="cv-sub">Subtitle</span>
                    </span>
                    <span className="cover-name">{v.charAt(0).toUpperCase() + v.slice(1)}</span>
                  </button>
                ))}
              </div>
            )}
          />
          <button
            type="button"
            className="rb-big"
            title="Blank Page"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertBlankPage}
          >
            <span className="ico" aria-hidden>📄</span>
            <span className="rb-big-label">Blank<br />Page</span>
          </button>
          <button
            type="button"
            className="rb-big"
            title="Page Break (Ctrl+Enter)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => focus().insertPageBreak().run()}
          >
            <span className="ico" aria-hidden>⤓</span>
            <span className="rb-big-label">Page<br />Break</span>
          </button>
        </div>
      </RGroup>

      {/* === Tables === */}
      <RGroup label="Tables">
        <div className="big-row">
          <TablePopover editor={editor} inTable={inTable} />
          {inTable && (
            <button
              type="button"
              className="rb-btn rb-big stacked danger"
              title="Delete the table containing the cursor (Ctrl+Shift+Backspace)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => focus().deleteTable().run()}
            >
              <span className="ico" aria-hidden>🗑</span>
              <span className="rb-big-label">Delete<br />Table</span>
            </button>
          )}
        </div>
      </RGroup>

      {/* === Illustrations === */}
      <RGroup label="Illustrations">
        <div className="big-row">
          <SplitButton
            stacked
            main={
              <span className="rb-big">
                <span className="ico" aria-hidden>🖼</span>
                <span className="rb-big-label">Pictures</span>
              </span>
            }
            title="Insert Picture"
            onClick={onPickFile}
            popover={(close) => (
              <div className="popover-list">
                <button type="button" className="pop-item" onClick={() => { onPickFile(); close(); }}>
                  <span aria-hidden>💻</span> This Device…
                </button>
                <button type="button" className="pop-item" onClick={() => { insertOnlinePicture(); close(); }}>
                  <span aria-hidden>🌐</span> Online Pictures…
                </button>
              </div>
            )}
          />
          <SplitButton
            stacked
            main={
              <span className="rb-big">
                <span className="ico" aria-hidden>⬢</span>
                <span className="rb-big-label">Shapes</span>
              </span>
            }
            title="Shapes"
            onClick={() => insertShape(SHAPES[0].svg)}
            popover={(close) => (
              <div className="shapes-grid">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="shape-cell"
                    title={s.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { insertShape(s.svg); close(); }}
                    dangerouslySetInnerHTML={{
                      __html: `<svg viewBox="0 0 120 80" width="40" height="28">${s.svg}</svg>`
                    }}
                  />
                ))}
              </div>
            )}
          />
          <SplitButton
            stacked
            main={
              <span className="rb-big">
                <span className="ico" aria-hidden>★</span>
                <span className="rb-big-label">Icons</span>
              </span>
            }
            title="Icons"
            onClick={() => insertSymbol('★')}
            popover={(close) => (
              <div className="symbol-grid">
                {ICONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="sym-cell"
                    title={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { insertSymbol(c); close(); }}
                  >{c}</button>
                ))}
              </div>
            )}
          />
        </div>
      </RGroup>

      {/* === Links === */}
      <RGroup label="Links">
        <div className="big-row">
          <button
            type="button"
            className="rb-big"
            title="Link (Ctrl+K)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertLink}
          >
            <span className="ico" aria-hidden>🔗</span>
            <span className="rb-big-label">Link</span>
          </button>
          <button
            type="button"
            className="rb-big"
            title="Bookmark"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertBookmark}
          >
            <span className="ico" aria-hidden>🔖</span>
            <span className="rb-big-label">Bookmark</span>
          </button>
        </div>
      </RGroup>

      {/* === Header & Footer === */}
      <RGroup label="Header & Footer">
        <div className="big-row">
          <button type="button" className="rb-big" title="Header" onMouseDown={(e) => e.preventDefault()} onClick={insertHeader}>
            <span className="ico" aria-hidden>▦</span>
            <span className="rb-big-label">Header</span>
          </button>
          <button type="button" className="rb-big" title="Footer" onMouseDown={(e) => e.preventDefault()} onClick={insertFooter}>
            <span className="ico" aria-hidden>▤</span>
            <span className="rb-big-label">Footer</span>
          </button>
          <SplitButton
            stacked
            main={
              <span className="rb-big">
                <span className="ico" aria-hidden>#</span>
                <span className="rb-big-label">Page<br />Number</span>
              </span>
            }
            title="Page Number"
            onClick={() => insertPageNumber('plain')}
            popover={(close) => (
              <div className="popover-list">
                {PAGE_NUM_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="pop-item"
                    onClick={() => { insertPageNumber(f.id); close(); }}
                  >{f.label}</button>
                ))}
              </div>
            )}
          />
        </div>
      </RGroup>

      {/* === Text === */}
      <RGroup label="Text">
        <div className="row stacked-list">
          <RBtn editor={editor} title="Text Box" onClick={insertTextBox}>
            <span aria-hidden>▢</span> Text Box
          </RBtn>
          <RBtn editor={editor} title="Drop Cap" onClick={insertDropCap}>
            <span aria-hidden>𝐀</span> Drop Cap
          </RBtn>
          <SplitButton
            main={<><span aria-hidden>📅</span>&nbsp;Date</>}
            title="Date & Time"
            onClick={() => insertDateTime('date')}
            popover={(close) => (
              <div className="popover-list">
                <button type="button" className="pop-item" onClick={() => { insertDateTime('date'); close(); }}>{new Date().toLocaleDateString()}</button>
                <button type="button" className="pop-item" onClick={() => { insertDateTime('long'); close(); }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</button>
                <button type="button" className="pop-item" onClick={() => { insertDateTime('time'); close(); }}>{new Date().toLocaleTimeString()}</button>
                <button type="button" className="pop-item" onClick={() => { insertDateTime('datetime'); close(); }}>{new Date().toLocaleString()}</button>
              </div>
            )}
          />
        </div>
      </RGroup>

      {/* === Symbols === */}
      <RGroup label="Symbols">
        <div className="big-row">
          <SplitButton
            stacked
            main={
              <span className="rb-big">
                <span className="ico" aria-hidden>Ω</span>
                <span className="rb-big-label">Symbol</span>
              </span>
            }
            title="Insert Symbol"
            onClick={() => insertSymbol('§')}
            popover={(close) => (
              <div className="symbol-grid wide">
                {SYMBOLS.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    className="sym-cell"
                    title={s}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { insertSymbol(s); close(); }}
                  >{s}</button>
                ))}
              </div>
            )}
          />
          <button
            type="button"
            className="rb-big"
            title="Equation"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertEquation}
          >
            <span className="ico" aria-hidden>√</span>
            <span className="rb-big-label">Equation</span>
          </button>
        </div>
      </RGroup>
    </section>
  );
}
