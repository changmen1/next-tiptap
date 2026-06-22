"use client"

import { useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DocsManager from './components/DocsManager';
import FindReplace from './components/FindReplace';
import OutlinePanel from './components/outline/OutlinePanel';
import Ribbon from './components/ribbon/Ribbon';
import StatusBar from './components/StatusBar';
import TitleBar from "./components/TitleBar";
import WordCount from './components/WordCount';
import EditorSurface from './editor/EditorSurface';
import { buildExtensions } from './editor/extensions';
import { exportDocx, exportHtml, exportTxt, importFile, printDoc } from './io';
import { useShortcuts } from './shortcuts';
import {
  deleteDoc,
  getLastDocId,
  listDocs,
  loadDoc,
  saveDoc,
  setLastDocId
} from './storage';
import { useEditorStore } from './store';

// 编辑器第一次打开、且没有从 localStorage 找到历史文档时使用的默认 HTML。
// Tiptap 的 `content` 可以直接吃 HTML 字符串；这里保留一份富文本示例，
// 方便开发/验收时快速检查标题、强调、列表等基础节点是否正常渲染。
const DEFAULT_CONTENT = `
<h1>欢迎使用 深墨创作平台</h1>
<p>这是一个使用 React 构建的、类似 Microsoft Word 的<strong>生产级</strong>编辑器</p>，
<em>TypeScript</em>, 和 <em>Tiptap</em> (ProseMirror).</p>
<p>使用上方的功能区来设置文本格式、插入图像、更改页面布局，并将文档导出为 <strong>.docx</strong>、<strong>HTML</strong>、<strong>TXT</strong> 或 <strong>PDF</strong> 格式（通过打印功能）。</p>
<ul>
<li>丰富的格式选项：加粗、斜体、下划线、颜色、高亮、字体及字号</li>
<li>列表、图像、链接、标题、代码、引用</li>
<li>页面设置、缩放、标尺、查找与替换、字数统计</li>
<li>自动保存至本地存储及文档管理器</li>
</ul>
<p>开始输入以替换此内容。</p>
`;

export default function Home() {
  // Zustand 全局状态保存的是“文档级 UI 状态”：标题、纸张、边距、主题等。
  // 真正的正文内容不放进 Zustand，而是由 Tiptap editor 内部状态管理，
  // 只有保存/导出/导入时才通过 editor.getHTML()/setContent() 和外部系统交换。
  const {
    docId,
    title,
    setTitle,
    setSaveStatus,
    pageSize,
    orientation,
    margins,
    setPageSize,
    setOrientation,
    setMargins,
    newDoc,
    loadDoc: loadDocAction,
    theme,
    showFormattingMarks
  } = useEditorStore();
  // 扩展列表只需要创建一次；如果每次渲染都重新创建 extension 实例，
  // Tiptap 可能重建插件状态，导致光标、分页 Decoration 或目录状态抖动。
  const extensions = useMemo(() => buildExtensions(), []);
  // dirtyRef 用 ref 而不是 state，是因为“是否有未保存修改”不需要触发 React 重渲染；
  // 它只服务于自动保存、离开页面提醒和显式保存按钮。
  const dirtyRef = useRef(false);
  const [findOpen, setFindOpen] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docs, setDocs] = useState(listDocs());
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [editorScrollParent, setEditorScrollParent] = useState<HTMLElement | null>(null);
  const getEditorScrollParent = useCallback(() => editorScrollParent, [editorScrollParent]);

  // 将主题写到 <html data-theme="...">，CSS 可以通过 `[data-theme="dark"]`
  // 切换变量，而不用让每个组件单独关心主题。
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 显示/隐藏格式标记（例如段落符号）也是全局 CSS 钩子；
  // 这里统一挂到 documentElement，避免给 ProseMirror 节点重复传 class。
  useEffect(() => {
    document.documentElement.classList.toggle('show-marks', showFormattingMarks);
  }, [showFormattingMarks]);

  // 创建 Tiptap editor 实例。onUpdate 只标记“变脏”，真正保存由 doSave/自动保存完成。
  const editor = useEditor({
    extensions,
    content: DEFAULT_CONTENT,
    // 刷新页面时不要自动把焦点放到文档末尾。
    // `autofocus: 'end'` 会让 ProseMirror 为了显示末尾光标而把编辑区滚动到底部。
    autofocus: false,
    onUpdate: () => {
      dirtyRef.current = true;
      setSaveStatus('dirty');
    }
  });

  // 首次拿到 editor 后，尝试恢复上次打开的文档。
  // 注意：这里依赖 localStorage，只能在 `"use client"` 页面中执行。
  useEffect(() => {
    if (!editor) return;
    const lastId = getLastDocId();
    if (lastId) {
      const d = loadDoc(lastId);
      if (d) {
        editor.commands.setContent(d.content || '', { emitUpdate: false });
        loadDocAction(d.id, d.title);
        if (d.pageSize) setPageSize(d.pageSize as never);
        if (d.orientation) setOrientation(d.orientation as never);
        if (d.margins) setMargins(d.margins as never);
        setSaveStatus('saved');
        dirtyRef.current = false;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // 将当前编辑器正文和页面设置持久化到 localStorage。
  // 迁移到生产系统时，这个函数通常会替换成后端 API 调用；
  // 保留同样的数据边界（id/title/content/pageSize/orientation/margins）会比较容易对接。
  const doSave = () => {
    if (!editor) return;
    const now = Date.now();
    saveDoc({
      id: docId,
      title,
      content: editor.getHTML(),
      pageSize,
      orientation,
      margins,
      createdAt: loadDoc(docId)?.createdAt || now,
      updatedAt: now
    });
    setLastDocId(docId);
    setSaveStatus('saved');
    dirtyRef.current = false;
    setDocs(listDocs());
  };

  // 简单的间隔式自动保存：每 3 秒检查一次 dirtyRef。
  // 它不是严格 debounce，但对本地存储足够；接后端时可以换成真正的 debounce/throttle。
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current) {
        doSave();
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docId, title, pageSize, orientation, margins]);

  // 浏览器关闭/刷新前，如果有未保存内容，就触发原生确认提示。
  // 现代浏览器不会展示自定义文案，设置 returnValue 只是为了启用提示。
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const handleAction = async (action: string) => {
    if (!editor) return;
    switch (action) {
      case 'new':
        // 新建文档会清空正文并生成新的 docId；如果当前内容未保存，先让用户确认。
        if (dirtyRef.current && !confirm('Discard unsaved changes?')) return;
        editor.commands.setContent('<p></p>', { emitUpdate: false });
        newDoc();
        dirtyRef.current = false;
        break;
      case 'open':
        // 打开文档管理弹窗，具体加载逻辑在 DocsManager 的 onLoad 回调中执行。
        setDocsOpen(true);
        break;
      case 'import': {
        // 用临时 input 触发系统文件选择器。导入逻辑集中在 io.ts，
        // 这里仅负责选择文件和把导入后的文件名同步为文档标题。
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx,.html,.htm,.md,.markdown,.txt';
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return;
          console.log("导入文件", f)
          const name = await importFile(editor, f);
          if (name) setTitle(name);
        };
        input.click();
        break;
      }
      case 'save':
      case 'saveAs':
        // saveAs 通过生成新 docId + 新标题来创建副本；保存动作仍复用 doSave。
        if (action === 'saveAs') {
          const t = prompt('Title for new copy', title + ' (copy)');
          if (!t) return;
          newDoc();
          setTitle(t);
          setTimeout(doSave, 0);
        } else doSave();
        break;
      case 'delete':
        // 删除当前本地文档后，同时把编辑器切回一个空白新文档。
        if (confirm(`Delete "${title}"? This cannot be undone.`)) {
          deleteDoc(docId);
          newDoc();
          editor.commands.setContent('<p></p>', { emitUpdate: false });
          setDocs(listDocs());
        }
        break;
      case 'exportDocx':
        // 导出 .docx 需要异步读取图片/生成 Word 文档，所以要 await。
        await exportDocx(editor, title);
        break;
      case 'exportHtml':
        exportHtml(editor, title);
        break;
      case 'exportTxt':
        exportTxt(editor, title);
        break;
      case 'print':
        printDoc(editor, title);
        break;
      case 'find':
        setFindOpen(true);
        break;
      case 'wordcount':
        setWcOpen(true);
        break;
    }
  };

  useShortcuts(editor, {
    onSave: doSave,
    onPrint: () => handleAction('print'),
    onFind: () => setFindOpen(true),
    onNew: () => handleAction('new'),
    onOpen: () => setDocsOpen(true)
  });

  return (
    <div className="app">
      <TitleBar
        onSave={doSave}
        onPrint={() => handleAction('print')}
        onOpenDocs={() => setDocsOpen(true)}
        onFileAction={handleAction}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((v) => !v)}
      />
      <Ribbon editor={editor} onAction={handleAction} />
      <div className="split-main">
        <div className="split-pane editor-pane">
          <div className="editor-workspace-shell">
            <div className="document-body__outline-rail">
              {outlineOpen && (
                <OutlinePanel
                  editor={editor}
                  scrollParent={getEditorScrollParent}
                  onClose={() => setOutlineOpen(false)}
                />
              )}
            </div>
            <EditorSurface editor={editor} onScrollParent={setEditorScrollParent} />
          </div>
        </div>
        {/* <div className="split-divider" aria-hidden="true" />
        <div className="split-pane preview-wrap">
          <PreviewPane editor={editor} />
        </div> */}
      </div>
      <StatusBar editor={editor} />

      <FindReplace editor={editor} open={findOpen} onClose={() => setFindOpen(false)} />
      <WordCount editor={editor} open={wcOpen} onClose={() => setWcOpen(false)} />
      <DocsManager
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        docs={docs}
        onNew={() => handleAction('new')}
        onLoad={(id) => {
          // 从文档管理器加载某个本地文档：正文交给 Tiptap，页面设置交给 Zustand。
          const d = loadDoc(id);
          if (!d || !editor) return;
          editor.commands.setContent(d.content || '', { emitUpdate: false });
          loadDocAction(d.id, d.title);
          setPageSize(d.pageSize as never);
          setOrientation(d.orientation as never);
          setMargins(d.margins as never);
          setLastDocId(d.id);
          setSaveStatus('saved');
          dirtyRef.current = false;
        }}
        onDelete={(id) => {
          // 弹窗中的删除只刷新列表；如果删除的是当前文档，当前编辑器内容不会自动清空。
          // 这样可以避免误删后立即丢失屏幕上的内容。
          deleteDoc(id);
          setDocs(listDocs());
        }}
      />
    </div>
  );
}
