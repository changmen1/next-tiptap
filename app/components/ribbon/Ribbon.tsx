import { Editor, useEditorState } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store';
import { RBtn, RGroup } from './Controls';
import InsertTab from './InsertTab';
import SplitButton from './SplitButton';
import { CapturedFormat, captureFormat, useFormatPainter } from './formatPainter';

interface Props {
  editor: Editor | null;
  onAction: (action: string, payload?: unknown) => void;
}

// const SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];
const SIZES: { label: string; value: string }[] = [
  // 中文字号
  { label: '初号', value: '56px' },
  { label: '小初', value: '48px' },

  { label: '一号', value: '34.67px' },
  { label: '小一', value: '32px' },

  { label: '二号', value: '29.33px' },
  { label: '小二', value: '24px' },

  { label: '三号', value: '21.33px' },
  { label: '小三', value: '20px' },

  { label: '四号', value: '18.67px' },
  { label: '小四', value: '16px' },

  { label: '五号', value: '14px' },
  { label: '小五', value: '12px' },

  { label: '六号', value: '10px' },
  { label: '小六', value: '8.67px' },

  { label: '七号', value: '7.33px' },
  { label: '八号', value: '6.67px' },

  // 数字字号
  { label: '5', value: '6.67px' },
  { label: '5.5', value: '7.33px' },
  { label: '6.5', value: '8.67px' },
  { label: '7.5', value: '10px' },
  { label: '8', value: '10.67px' },
  { label: '9', value: '12px' },
  { label: '10', value: '13.33px' },
  { label: '10.5', value: '14px' },
  { label: '11', value: '14.67px' },
  { label: '12', value: '16px' },
  { label: '14', value: '18.67px' },
  { label: '16', value: '21.33px' },
  { label: '18', value: '24px' },
  { label: '20', value: '26.67px' },
  { label: '22', value: '29.33px' },
  { label: '24', value: '32px' },
  { label: '26', value: '34.67px' },
  { label: '28', value: '37.33px' },
  { label: '36', value: '48px' },
  { label: '42', value: '56px' },
];
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3'];
const FIRST_LINE_INDENTS = [
  // 中文论文常见首行缩进为 2em，这里也保留 1/3 字符作为可选项。
  { label: '无', value: null },
  { label: '首行缩进 1 个字符', value: '1em' },
  { label: '首行缩进 2 个字符', value: '2em' },
  { label: '首行缩进 3 个字符', value: '3em' }
] as const;

const FONT_FAMILIES: { label: string; value: string }[] = [
  // 字体值按 CSS font-family 写法保存，导出 HTML 时直接复用。
  { label: "宋体", value: "SimSun, Songti SC, serif" },
  { label: "黑体", value: "SimHei, Heiti SC, sans-serif" },
  { label: "楷体", value: "KaiTi, Kaiti SC, serif" },
  { label: "仿宋", value: "FangSong, STFangsong, serif" },
  { label: "微软雅黑", value: "Microsoft YaHei, sans-serif" },
  { label: "等线", value: "DengXian, sans-serif" },
  { label: 'Aptos (Body)', value: 'Aptos, Calibri, Segoe UI, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, sans-serif' },
  { label: 'Consolas', value: 'Consolas, Menlo, monospace' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' }
];

/** 简化版 Word 主题色板；按钮直接把颜色写入 textStyle/highlight/cell style。 */
const COLOR_THEME = [
  '#000000', '#7F7F7F', '#A6A6A6', '#FFFFFF',
  '#C00000', '#FF0000', '#FFC000', '#FFFF00',
  '#92D050', '#00B050', '#00B0F0', '#0070C0',
  '#002060', '#7030A0', '#2E74B5', '#548235'
];

const HIGHLIGHT_COLORS = [
  '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF',
  '#0000FF', '#FF0000', '#000080', '#008080',
  '#008000', '#800080', '#800000', '#808000',
  '#808080', '#C0C0C0', 'transparent'
];

const STYLE_GALLERY: { id: string; label: string; preview: string; apply: (e: Editor) => void }[] = [
  // 样式库按钮本质上是一组 Tiptap command 组合，不是完整 Word 样式系统。
  {
    id: 'normal', label: '正文', preview: '正文',
    apply: (e) => e.chain().focus().setParagraph().unsetAllMarks().run()
  },
  {
    id: 'no-spacing', label: '无间距', preview: '无间距',
    apply: (e) => e.chain().focus().setParagraph().setLineHeight('1').unsetAllMarks().run()
  },
  {
    id: 'h1', label: '标题 1', preview: '标题 1',
    apply: (e) => e.chain().focus().setHeading({ level: 1 }).run()
  },
  {
    id: 'h2', label: '标题 2', preview: '标题 2',
    apply: (e) => e.chain().focus().setHeading({ level: 2 }).run()
  },
  {
    id: 'title', label: '标题', preview: '标题',
    apply: (e) => e.chain().focus().setHeading({ level: 1 }).setMark('textStyle', { fontSize: '28pt' }).run()
  },
  {
    id: 'subtitle', label: '副标题', preview: '副标题',
    apply: (e) => e.chain().focus().setHeading({ level: 2 }).setMark('textStyle', { fontSize: '14pt', color: '#7f7f7f' }).run()
  },
  {
    id: 'quote', label: '引用', preview: '引用',
    apply: (e) => e.chain().focus().setBlockquote().run()
  }
];

const CASE_ACTIONS: { id: string; label: string; transform: (s: string) => string }[] = [
  // 只对选中文本做纯字符串转换，不保留复杂大小写语言规则。
  { id: 'sentence', label: '句首大写', transform: (s) => s.replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase()).replace(/(\w)([A-Z])/g, (_, a, b) => a + b.toLowerCase()) },
  { id: 'lower', label: '小写', transform: (s) => s.toLowerCase() },
  { id: 'upper', label: '大写', transform: (s) => s.toUpperCase() },
  { id: 'capitalize', label: '首字母大写', transform: (s) => s.replace(/\b\w/g, (m) => m.toUpperCase()) },
  { id: 'toggle', label: '切换大小写', transform: (s) => s.split('').map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('') }
];

const QUICK_STYLES: { id: string; label: string }[] = [
  // 表格上下文页签里的快速样式，id 对应 StyledTable 的 tableStyle 属性。
  { id: 'no-style', label: 'No style' },
  { id: 'plain', label: 'Plain' },
  { id: 'grid', label: 'Grid' },
  { id: 'grid-accent1', label: 'Accent 1' },
  { id: 'grid-accent2', label: 'Accent 2' },
  { id: 'grid-accent3', label: 'Accent 3' },
  { id: 'list-light', label: 'List Light' },
  { id: 'banded-rows', label: 'Banded Rows' },
  { id: 'banded-cols', label: 'Banded Cols' },
  { id: 'banded-accent', label: 'Banded Accent' },
  { id: 'total-row', label: 'Total Row' }
];

const CELL_ALIGNS: { id: string; label: string; v: 'top' | 'middle' | 'bottom'; h: 'left' | 'center' | 'right' }[] = [
  // 单元格九宫格对齐：vertical-align 写到单元格，水平对齐用 Tiptap textAlign。
  { id: 'tl', label: 'Top Left', v: 'top', h: 'left' },
  { id: 'tc', label: 'Top Center', v: 'top', h: 'center' },
  { id: 'tr', label: 'Top Right', v: 'top', h: 'right' },
  { id: 'ml', label: 'Middle Left', v: 'middle', h: 'left' },
  { id: 'mc', label: 'Middle Center', v: 'middle', h: 'center' },
  { id: 'mr', label: 'Middle Right', v: 'middle', h: 'right' },
  { id: 'bl', label: 'Bottom Left', v: 'bottom', h: 'left' },
  { id: 'bc', label: 'Bottom Center', v: 'bottom', h: 'center' },
  { id: 'br', label: 'Bottom Right', v: 'bottom', h: 'right' }
];

type TabId = 'home' | 'insert' | 'tdesign' | 'tlayout';

export default function Ribbon({ editor, onAction }: Props) {
  // editor 初始化前渲染空 nav，避免工具栏按钮在 editor 为 null 时误触发命令。
  if (!editor) return <nav className="ribbon" aria-label="Ribbon" />;
  return <RibbonInner editor={editor} onAction={onAction} />;
}

function RibbonInner({ editor }: { editor: Editor; onAction: Props['onAction'] }) {
  // useEditorState 只订阅工具栏真正需要的派生状态；
  // 比在每次 React 渲染里直接读 editor.isActive 更稳定，也能减少无关重渲染。
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        subscript: e.isActive('subscript'),
        superscript: e.isActive('superscript'),
        ul: e.isActive('bulletList'),
        ol: e.isActive('orderedList'),
        alignLeft: e.isActive({ textAlign: 'left' }),
        alignCenter: e.isActive({ textAlign: 'center' }),
        alignRight: e.isActive({ textAlign: 'right' }),
        alignJustify: e.isActive({ textAlign: 'justify' }),
        fontFamily: (e.getAttributes('textStyle').fontFamily as string) || '',
        fontSize: ((e.getAttributes('textStyle').fontSize as string) || '').replace('pt', ''),
        block: e.isActive('heading', { level: 1 }) ? 'h1'
          : e.isActive('heading', { level: 2 }) ? 'h2'
            : e.isActive('heading', { level: 3 }) ? 'h3'
              : e.isActive('heading', { level: 4 }) ? 'h4'
                : e.isActive('blockquote') ? 'blockquote'
                  : 'p',
        lineHeight: (e.getAttributes('paragraph').lineHeight as string) || '1.15',
        firstLineIndent: (e.getAttributes('paragraph').firstLineIndent as string) || '',
        color: (e.getAttributes('textStyle').color as string) || '#222222',
        highlight: (e.getAttributes('highlight').color as string) || '#ffff00',
        inTable: e.isActive('table'),
        tableStyle: (e.getAttributes('table').tableStyle as string) || ''
      };
    }
  });

  // home/insert 是普通页签；tdesign/tlayout 是光标进入表格后才出现的上下文页签。
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const wasInTableRef = useRef(false);
  const lastNonTableTabRef = useRef<TabId>('home');

  // 模拟 Word：光标进入表格时自动切到 Table Design；
  // 离开表格后恢复进入表格前的普通页签。
  useEffect(() => {
    if (state.inTable && !wasInTableRef.current) {
      if (activeTab !== 'tdesign' && activeTab !== 'tlayout') {
        lastNonTableTabRef.current = activeTab;
      }
      setActiveTab('tdesign');
    } else if (!state.inTable && wasInTableRef.current) {
      setActiveTab(lastNonTableTabRef.current);
    }
    wasInTableRef.current = state.inTable;
  }, [state.inTable]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = () => editor.chain().focus();
  // 首行缩进通过 ParagraphIndent 扩展写到 paragraph.firstLineIndent。
  const setFirstLineIndent = (value: string) =>
    focus().updateAttributes('paragraph', { firstLineIndent: value }).run();
  const unsetFirstLineIndent = () =>
    focus().resetAttributes('paragraph', 'firstLineIndent').run();

  // ====== 删除当前块 ======
  // 删除光标所在的结构：表格则删整表；否则向上找最近的非段落块
  // （封面、分页符、文本框、引用、代码块、图片等）。普通段落则删除该段落。
  const deleteBlock = () => {
    if (!editor) return;
    if (editor.can().deleteTable()) {
      editor.chain().focus().deleteTable().run();
      return;
    }
    const { state } = editor;
    const { $from, from, to } = state.selection;
    // 如果当前是 NodeSelection（例如选中图片），直接删除选区。
    if (from !== to && (state.selection as { node?: unknown }).node) {
      editor.chain().focus().deleteSelection().run();
      return;
    }
    // 向上寻找最近的非段落块，并用 tr.delete 删除它的完整范围。
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (!node || node.type.name === 'doc') break;
      if (node.type.name === 'paragraph' || node.type.name === 'text') continue;
      const start = $from.before(d);
      const end = $from.after(d);
      editor
        .chain()
        .focus()
        .command(({ tr, dispatch }) => {
          if (dispatch) tr.delete(start, end);
          return true;
        })
        .run();
      return;
    }
    // 兜底：选中父节点并删除，覆盖普通段落场景。
    editor.chain().focus().selectParentNode().deleteSelection().run();
  };

  // 监听 Ctrl/Cmd+Shift+Delete 删除当前块。这个快捷键放在 Ribbon 内，
  // 因为它依赖 deleteBlock 这组工具栏逻辑。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        deleteBlock();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ====== 格式刷 ======
  const captured = useRef<CapturedFormat | null>(null);
  const [painterActive, setPainterActive] = useState(false);
  const [painterSticky, setPainterSticky] = useState(false);
  const deactivatePainter = () => {
    setPainterActive(false);
    setPainterSticky(false);
    captured.current = null;
  };
  useFormatPainter({
    editor,
    active: painterActive,
    sticky: painterSticky,
    captured,
    deactivate: deactivatePainter
  });
  const startPainter = (sticky: boolean) => {
    // 单击格式刷应用一次；双击进入 sticky 模式，可以连续刷多段。
    captured.current = captureFormat(editor);
    setPainterSticky(sticky);
    setPainterActive(true);
  };

  // ====== 剪贴板 ======
  const doCopy = async () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    // serializeForClipboard 能同时给出 HTML DOM 和纯文本，保留富文本复制体验。
    const slice = editor.state.doc.slice(from, to);
    const serialized = editor.view.serializeForClipboard(slice);
    const html = serialized.dom.outerHTML || serialized.dom.innerHTML;
    const text = serialized.text;
    try {
      // 优先写入 text/html + text/plain；浏览器权限不允许时再退回纯文本。
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
    } catch {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
  };
  const doCut = async () => {
    await doCopy();
    editor.chain().focus().deleteSelection().run();
  };
  const doPaste = async () => {
    try {
      // 程序化读取剪贴板可能被浏览器权限阻止；失败时用户仍可 Ctrl+V。
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          const html = await blob.text();
          editor.chain().focus().insertContent(html).run();
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text) editor.chain().focus().insertContent(text).run();
    } catch {
      // Ignore - browser may block programmatic paste; user can use Ctrl+V.
    }
  };
  const doPasteText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) editor.chain().focus().insertContent(text).run();
    } catch { /* ignore */ }
  };

  // ====== 字号增减 ======
  const adjustFontSize = (delta: number) => {
    // 限制字号范围，避免误操作写入过小/过大的不可读字号。
    const cur = parseInt(state.fontSize || '11', 10) || 11;
    const next = Math.max(6, Math.min(96, cur + delta));
    focus().setFontSize(`${next}pt`).run();
  };

  // ====== 更改大小写 ======
  const applyCase = (transform: (s: string) => string) => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, '\n');
    const out = transform(text);
    editor.chain().focus().insertContentAt({ from, to }, out).setTextSelection({ from, to: from + out.length }).run();
  };

  // ====== 选中段落按字母排序 ======
  const sortParagraphs = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, '\n', '\n');
    const lines = text.split('\n');
    if (lines.length < 2) return;
    const sorted = [...lines].sort((a, b) => a.localeCompare(b)).join('\n');
    editor.chain().focus().insertContentAt({ from, to }, sorted).run();
  };

  // ====== 清除格式：清 mark，同时把块级格式恢复到普通段落/左对齐/默认行高 ======
  const clearAll = () =>
    focus()
      .unsetAllMarks()
      .setParagraph()
      .setTextAlign('left')
      .setLineHeight('1.15')
      .resetAttributes('paragraph', 'firstLineIndent')
      .run();

  // ====== 显示/隐藏格式标记 ======
  const { showFormattingMarks, toggleFormattingMarks } = useEditorStore();

  const tabs: { id: TabId; label: string; contextual?: boolean }[] = [
    { id: 'home', label: '开始' },
    { id: 'insert', label: '插入' },
    ...(state.inTable
      ? ([
        { id: 'tdesign', label: '表格设计', contextual: true },
        { id: 'tlayout', label: '表格布局', contextual: true }
      ] as { id: TabId; label: string; contextual?: boolean }[])
      : [])
  ];

  return (
    <nav className="ribbon ribbon-tabbed" aria-label="Ribbon">
      <div className="ribbon-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`ribbon-tab ${activeTab === t.id ? 'active' : ''} ${t.contextual ? 'contextual' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'home' && (
        <section className="ribbon-panel home-panel" role="tabpanel">
          {/* === 剪贴板 === */}
          <RGroup label="剪贴板">
            <div className="clipboard-group">
              <SplitButton
                stacked
                main={
                  <span className="rb-big">
                    <span className="ico ico-paste" aria-hidden>📋</span>
                    <span className="rb-big-label">粘贴</span>
                  </span>
                }
                title="粘贴 (Ctrl+V)"
                onClick={doPaste}
                popover={(close) => (
                  <div className="popover-list">
                    <button type="button" className="pop-item" onClick={() => { doPaste(); close(); }}>
                      <span className="ico" aria-hidden>📋</span>
                      <span>保留源格式</span>
                    </button>
                    <button type="button" className="pop-item" onClick={() => { doPasteText(); close(); }}>
                      <span className="ico" aria-hidden>🅣</span>
                      <span>仅保留文本</span>
                    </button>
                  </div>
                )}
              />
              <div className="clip-stack">
                <RBtn editor={editor} title="剪切 (Ctrl+X)" onClick={doCut}>
                  <span aria-hidden>✂</span> 剪切
                </RBtn>
                <RBtn editor={editor} title="复制 (Ctrl+C)" onClick={doCopy}>
                  <span aria-hidden>🗐</span> 复制
                </RBtn>
                <RBtn
                  editor={editor}
                  active={painterActive}
                  title="格式刷（双击可锁定）)"
                  onClick={() => (painterActive ? deactivatePainter() : startPainter(false))}
                >
                  <span
                    onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); startPainter(true); }}
                    aria-hidden
                  >🖌</span> 格式刷
                </RBtn>
                <button
                  type="button"
                  className="rb-btn danger"
                  title="删除当前块 (Ctrl+Shift+Delete) — 移除光标所在的表格、分页符、封面页、图像等。"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={deleteBlock}
                >
                  <span aria-hidden>🗑</span> 删除区块
                </button>
              </div>
            </div>
          </RGroup>

          {/* === 字体 ===  https://tiptap.dev/docs/editor/extensions/functionality/fontfamily*/}
          <RGroup label="字体">
            <div className="row">
              <select
                className="rb-select font-family"
                value={state.fontFamily || FONT_FAMILIES[0].value}
                onChange={(e) => focus().setFontFamily(e.target.value).run()}
                title="设置不同的字体"
                style={{ fontFamily: state.fontFamily || undefined }}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                ))}
              </select>
              <select
                className="rb-select font-size"
                value={state.fontSize || SIZES[0].value}
                onChange={(e) => focus().setFontSize(`${e.target.value}pt`).run()}
                title="设置字号的大小"
              >
                {SIZES.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
              </select>
              <RBtn editor={editor} title="增大字号 (Ctrl+Shift+>)" onClick={() => adjustFontSize(2)}>A⁺</RBtn>
              <RBtn editor={editor} title="缩小字号 (Ctrl+Shift+<)" onClick={() => adjustFontSize(-2)}>A⁻</RBtn>
              <SplitButton
                main={<span title="更改大小写">Aa</span>}
                title="更改大小写"
                onClick={() => applyCase(CASE_ACTIONS[0].transform)}
                popover={(close) => (
                  <div className="popover-list">
                    {CASE_ACTIONS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="pop-item"
                        onClick={() => { applyCase(a.transform); close(); }}
                      >{a.label}</button>
                    ))}
                  </div>
                )}
              />
              <RBtn editor={editor} title="清除所有格式" onClick={clearAll}>
                <span aria-hidden>⌫A</span>
              </RBtn>
            </div>
            <div className="row">
              <RBtn editor={editor} active={state.bold} title="加粗 (Ctrl+B)" onClick={() => focus().toggleBold().run()}><b>B</b></RBtn>
              <RBtn editor={editor} active={state.italic} title="倾斜 (Ctrl+I)" onClick={() => focus().toggleItalic().run()}><i>I</i></RBtn>
              <SplitButton
                main={<u>U</u>}
                title="下划线 (Ctrl+U)"
                active={state.underline}
                onClick={() => focus().toggleUnderline().run()}
                popover={(close) => (
                  <div className="popover-list">
                    <button type="button" className="pop-item" onClick={() => { focus().toggleUnderline().run(); close(); }}>
                      <u>强调</u>
                    </button>
                    <button type="button" className="pop-item" onClick={() => { focus().unsetUnderline?.().run(); close(); }}>
                      无下划线
                    </button>
                  </div>
                )}
              />
              <RBtn editor={editor} active={state.strike} title="删除线" onClick={() => focus().toggleStrike().run()}><s>ab</s></RBtn>
              <RBtn editor={editor} active={state.subscript} title="下标 (Ctrl+=)" onClick={() => focus().toggleSubscript().run()}>X<sub>2</sub></RBtn>
              <RBtn editor={editor} active={state.superscript} title="上标 (Ctrl+Shift+=)" onClick={() => focus().toggleSuperscript().run()}>X<sup>2</sup></RBtn>
              <SplitButton
                stacked
                caretLabel={<span className="bar" style={{ background: state.highlight }} />}
                main={<span className="hl-glyph" style={{ background: state.highlight }}>ab</span>}
                title="突出显示"
                onClick={() => focus().toggleHighlight({ color: state.highlight }).run()}
                popover={(close) => (
                  <div className="popover-palette">
                    <div className="palette-title">强调</div>
                    <div className="palette">
                      {HIGHLIGHT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="sw"
                          style={{ background: c === 'transparent' ? 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 8px 8px' : c }}
                          title={c}
                          onClick={() => {
                            if (c === 'transparent') focus().unsetHighlight().run();
                            else focus().toggleHighlight({ color: c }).run();
                            close();
                          }}
                        />
                      ))}
                    </div>
                    <hr className="pop-sep" />
                    <button type="button" className="pop-item" onClick={() => { focus().unsetHighlight().run(); close(); }}>无</button>
                  </div>
                )}
              />
              <SplitButton
                stacked
                caretLabel={<span className="bar" style={{ background: state.color }} />}
                main={<span className="font-color-glyph" style={{ borderBottomColor: state.color }}>A</span>}
                title="文本颜色"
                onClick={() => focus().setColor(state.color).run()}
                popover={(close) => (
                  <div className="popover-palette">
                    <div className="palette-title">主题颜色</div>
                    <div className="palette">
                      {COLOR_THEME.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="sw"
                          style={{ background: c }}
                          title={c}
                          onClick={() => { focus().setColor(c).run(); close(); }}
                        />
                      ))}
                    </div>
                    <hr className="pop-sep" />
                    <button type="button" className="pop-item" onClick={() => { focus().unsetColor().run(); close(); }}>自动的</button>
                    <label className="pop-item" style={{ cursor: 'pointer' }}>
                      <span>更多颜色…</span>
                      <input
                        type="color"
                        style={{ marginLeft: 'auto' }}
                        value={state.color}
                        onChange={(e) => { focus().setColor(e.target.value).run(); close(); }}
                      />
                    </label>
                  </div>
                )}
              />
            </div>
          </RGroup>

          {/* === 段落 === */}
          <RGroup label="段落">
            <div className="row">
              <SplitButton
                main={<span aria-hidden>•≡</span>}
                title="项目符号"
                active={state.ul}
                onClick={() => focus().toggleBulletList().run()}
                popover={(close) => (
                  <div className="popover-list">
                    {[
                      { sym: '•', label: 'Disc' },
                      { sym: '◦', label: 'Circle' },
                      { sym: '▪', label: 'Square' },
                      { sym: '–', label: 'Dash' }
                    ].map((b) => (
                      <button
                        key={b.sym}
                        type="button"
                        className="pop-item"
                        onClick={() => { focus().toggleBulletList().run(); close(); }}
                      >
                        <span style={{ width: 18, textAlign: 'center' }}>{b.sym}</span>
                        <span>{b.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              />
              <SplitButton
                main={<span aria-hidden>1.≡</span>}
                title="编号"
                active={state.ol}
                onClick={() => focus().toggleOrderedList().run()}
                popover={(close) => (
                  <div className="popover-list">
                    {[
                      { label: '1. 2. 3.' },
                      { label: 'A. B. C.' },
                      { label: 'a. b. c.' },
                      { label: 'I. II. III.' }
                    ].map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        className="pop-item"
                        onClick={() => { focus().toggleOrderedList().run(); close(); }}
                      >{b.label}</button>
                    ))}
                  </div>
                )}
              />
              <RBtn editor={editor} title="多级列表" onClick={() => focus().toggleBulletList().run()}>
                <span aria-hidden>≣</span>
              </RBtn>
              <RBtn editor={editor} title="减少缩进" onClick={() => focus().liftListItem('listItem').run()}>⇤</RBtn>
              <RBtn editor={editor} title="增加缩进" onClick={() => focus().sinkListItem('listItem').run()}>⇥</RBtn>
              <SplitButton
                main={<span aria-hidden>¶→</span>}
                title="首行缩进"
                active={state.firstLineIndent === '2em'}
                onClick={() => setFirstLineIndent('2em')}
                popover={(close) => (
                  <div className="popover-list">
                    {FIRST_LINE_INDENTS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={`pop-item ${state.firstLineIndent === (item.value ?? '') ? 'active' : ''}`}
                        onClick={() => {
                          if (item.value) {
                            setFirstLineIndent(item.value);
                          } else {
                            unsetFirstLineIndent();
                          }
                          close();
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              />
              <RBtn editor={editor} title="种类 A→Z" onClick={sortParagraphs}>A<sub>Z</sub>↧</RBtn>
              <RBtn editor={editor} active={showFormattingMarks} title="显示/隐藏格式标记 (Ctrl+*)" onClick={toggleFormattingMarks}>¶</RBtn>
            </div>
            <div className="row">
              <RBtn editor={editor} active={state.alignLeft} title="左对齐 (Ctrl+L)" onClick={() => focus().setTextAlign('left').run()}>≡⯇</RBtn>
              <RBtn editor={editor} active={state.alignCenter} title="居中对齐 (Ctrl+E)" onClick={() => focus().setTextAlign('center').run()}>≡</RBtn>
              <RBtn editor={editor} active={state.alignRight} title="右对齐 (Ctrl+R)" onClick={() => focus().setTextAlign('right').run()}>⯈≡</RBtn>
              <RBtn editor={editor} active={state.alignJustify} title="两端对齐 (Ctrl+J)" onClick={() => focus().setTextAlign('justify').run()}>▤</RBtn>
              <SplitButton
                main={<span aria-hidden>↕</span>}
                title="行距与段落间距"
                onClick={() => focus().setLineHeight('1.15').run()}
                popover={(close) => (
                  <div className="popover-list">
                    {LINE_HEIGHTS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`pop-item ${state.lineHeight === v ? 'active' : ''}`}
                        onClick={() => { focus().setLineHeight(v).run(); close(); }}
                      >{v}</button>
                    ))}
                  </div>
                )}
              />
              <SplitButton
                main={<span className="hl-glyph" style={{ background: '#ffeaa7' }} aria-hidden>▣</span>}
                title="阴影"
                onClick={() => state.inTable && focus().setCellStyleProp('background-color', '#ffeaa7').run()}
                disabled={!state.inTable}
                popover={(close) => (
                  <div className="popover-palette">
                    <div className="palette-title">Cell Shading</div>
                    <div className="palette">
                      {COLOR_THEME.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="sw"
                          style={{ background: c }}
                          title={c}
                          onClick={() => { focus().setCellStyleProp('background-color', c).run(); close(); }}
                        />
                      ))}
                    </div>
                    <hr className="pop-sep" />
                    <button type="button" className="pop-item" onClick={() => { focus().setCellStyleProp('background-color', null).run(); close(); }}>无</button>
                  </div>
                )}
              />
              <SplitButton
                main={<span aria-hidden>▦</span>}
                title="边界"
                onClick={() => focus().setTableBorderPreset('all').run()}
                disabled={!state.inTable}
                popover={(close) => (
                  <div className="popover-list">
                    <button type="button" className="pop-item" onClick={() => { focus().setTableBorderPreset('all').run(); close(); }}>所有边框</button>
                    <button type="button" className="pop-item" onClick={() => { focus().setTableBorderPreset('outer').run(); close(); }}>外侧边框</button>
                    <button type="button" className="pop-item" onClick={() => { focus().setTableBorderPreset('inner').run(); close(); }}>内侧边框</button>
                    <button type="button" className="pop-item" onClick={() => { focus().setTableBorderPreset('horizontal').run(); close(); }}>水平边框</button>
                    <button type="button" className="pop-item" onClick={() => { focus().setTableBorderPreset('none').run(); close(); }}>无边框</button>
                  </div>
                )}
              />
            </div>
          </RGroup>

          {/* === 样式 gallery === */}
          <RGroup label="样式" className="styles-group">
            <div className="styles-gallery">
              {STYLE_GALLERY.map((s) => {
                const active =
                  (s.id === 'normal' && state.block === 'p') ||
                  (s.id === 'h1' && state.block === 'h1') ||
                  (s.id === 'h2' && state.block === 'h2');
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`style-card ${active ? 'active' : ''}`}
                    title={s.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => s.apply(editor)}
                  >
                    <span className={`style-preview style-${s.id}`}>{s.preview}</span>
                  </button>
                );
              })}
            </div>
          </RGroup>
        </section>
      )}

      {activeTab === 'insert' && (
        <InsertTab editor={editor} inTable={state.inTable} />
      )}

      {activeTab === 'tdesign' && state.inTable && (
        <section className="ribbon-panel" role="tabpanel">
          <RGroup label="Table Styles" className="contextual">
            <div className="row tdesign-styles">
              {QUICK_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`td-style-chip ${state.tableStyle === s.id ? 'active' : ''}`}
                  title={s.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => focus().setTableStyle(s.id || null).run()}
                >
                  <span className="tp-style-preview" data-table-style={s.id || 'plain'}>
                    <span className="r r0"><span /><span /><span /></span>
                    <span className="r r1"><span /><span /><span /></span>
                    <span className="r r2"><span /><span /><span /></span>
                    <span className="r r3"><span /><span /><span /></span>
                  </span>
                </button>
              ))}
            </div>
          </RGroup>

          <RGroup label="Shading" className="contextual">
            <div className="row">
              <label className="rb-color" title="Cell shading">
                <span>▦</span>
                <input
                  type="color"
                  onChange={(e) => focus().setCellStyleProp('background-color', e.target.value).run()}
                />
              </label>
              <RBtn editor={editor} title="Clear shading" onClick={() => focus().setCellStyleProp('background-color', null).run()}>⌫▦</RBtn>
            </div>
          </RGroup>

          <RGroup label="Borders" className="contextual">
            <div className="row">
              <RBtn editor={editor} title="All borders" onClick={() => focus().setTableBorderPreset('all').run()}>⊞</RBtn>
              <RBtn editor={editor} title="Outer borders" onClick={() => focus().setTableBorderPreset('outer').run()}>▢</RBtn>
              <RBtn editor={editor} title="Horizontal borders" onClick={() => focus().setTableBorderPreset('horizontal').run()}>≡</RBtn>
              <RBtn editor={editor} title="Inner borders" onClick={() => focus().setTableBorderPreset('inner').run()}>┼</RBtn>
              <RBtn editor={editor} title="No borders" onClick={() => focus().setTableBorderPreset('none').run()}>▭</RBtn>
            </div>
          </RGroup>

          <RGroup label="Table" className="contextual">
            <div className="row">
              <button
                type="button"
                className="rb-btn danger"
                title="Delete the entire table (Ctrl+Shift+Backspace)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => focus().deleteTable().run()}
              >
                🗑 Delete Table
              </button>
            </div>
          </RGroup>
        </section>
      )}

      {activeTab === 'tlayout' && state.inTable && (
        <section className="ribbon-panel" role="tabpanel">
          <RGroup label="Rows & Columns" className="contextual">
            <div className="row">
              <RBtn editor={editor} title="Insert row above" onClick={() => focus().addRowBefore().run()}>+R↑</RBtn>
              <RBtn editor={editor} title="Insert row below" onClick={() => focus().addRowAfter().run()}>+R↓</RBtn>
              <RBtn editor={editor} title="Insert column left" onClick={() => focus().addColumnBefore().run()}>+C←</RBtn>
              <RBtn editor={editor} title="Insert column right" onClick={() => focus().addColumnAfter().run()}>+C→</RBtn>
            </div>
            <div className="row">
              <RBtn editor={editor} title="Delete row" onClick={() => focus().deleteRow().run()}>−R</RBtn>
              <RBtn editor={editor} title="Delete column" onClick={() => focus().deleteColumn().run()}>−C</RBtn>
              <RBtn editor={editor} title="Delete table" onClick={() => focus().deleteTable().run()}>🗑</RBtn>
            </div>
          </RGroup>

          <RGroup label="Merge" className="contextual">
            <div className="row">
              <RBtn editor={editor} title="Merge cells" onClick={() => focus().mergeCells().run()}>⊞→⬚</RBtn>
              <RBtn editor={editor} title="Split cell" onClick={() => focus().splitCell().run()}>⬚→⊞</RBtn>
              <RBtn editor={editor} title="Toggle header row" onClick={() => focus().toggleHeaderRow().run()}>H↑</RBtn>
              <RBtn editor={editor} title="Toggle header column" onClick={() => focus().toggleHeaderColumn().run()}>H←</RBtn>
            </div>
          </RGroup>

          <RGroup label="Alignment" className="contextual">
            <div className="row">
              <div className="cell-align" title="Cell alignment">
                {CELL_ALIGNS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="ca-cell"
                    title={a.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      focus()
                        .setCellStyleProp('vertical-align', a.v)
                        .setTextAlign(a.h)
                        .run();
                    }}
                  >
                    <span className={`ca-dot v-${a.v} h-${a.h}`} />
                  </button>
                ))}
              </div>
            </div>
          </RGroup>
        </section>
      )}
    </nav>
  );
}
