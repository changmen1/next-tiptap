"use client"

import { useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OutlinePanel from './components/outline/OutlinePanel';
import Ribbon from './components/ribbon/Ribbon';
import TitleBar from "./components/TitleBar";
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

const DEFAULT_CONTENT = `
<h1>Welcome to WordEditor</h1>
<p>This is a <strong>production-grade</strong>, Microsoft Word-like editor built with <em>React</em>,
<em>TypeScript</em>, and <em>Tiptap</em> (ProseMirror).</p>
<p>Use the ribbon above to format text, insert images, change page layout, and export your document
as <strong>.docx</strong>, <strong>HTML</strong>, <strong>TXT</strong>, or <strong>PDF</strong> (via print).</p>
<ul>
  <li>Rich formatting: bold, italic, underline, color, highlight, font &amp; size</li>
  <li>Lists, images, links, headings, code, quotes</li>
  <li>Page setup, zoom, ruler, find &amp; replace, word count</li>
  <li>Autosave to local storage and a documents manager</li>
</ul>
<p>Start typing to replace this content.</p>
`;

export default function Home() {
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
  const extensions = useMemo(() => buildExtensions(), []);
  const dirtyRef = useRef(false);
  const [findOpen, setFindOpen] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docs, setDocs] = useState(listDocs());
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [editorScrollParent, setEditorScrollParent] = useState<HTMLElement | null>(null);
  const getEditorScrollParent = useCallback(() => editorScrollParent, [editorScrollParent]);

  const editor = useEditor({
    extensions,
    content: DEFAULT_CONTENT,
    autofocus: 'end',
    onUpdate: () => {
      dirtyRef.current = true;
      setSaveStatus('dirty');
    }
  });

  // Load last doc on mount
  useEffect(() => {
    if (!editor) return;
    const lastId = getLastDocId();
    if (lastId) {
      const d = loadDoc(lastId);
      if (d) {
        editor.commands.setContent(d.content || '', false as any);
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

  const handleAction = async (action: string) => {
    if (!editor) return;
    switch (action) {
      case 'new':
        if (dirtyRef.current && !confirm('Discard unsaved changes?')) return;
        editor.commands.setContent('<p></p>', false as any);
        newDoc();
        dirtyRef.current = false;
        break;
      case 'open':
        setDocsOpen(true);
        break;
      case 'import': {
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
        if (action === 'saveAs') {
          const t = prompt('Title for new copy', title + ' (copy)');
          if (!t) return;
          newDoc();
          setTitle(t);
          setTimeout(doSave, 0);
        } else doSave();
        break;
      case 'delete':
        if (confirm(`Delete "${title}"? This cannot be undone.`)) {
          deleteDoc(docId);
          newDoc();
          editor.commands.setContent('<p></p>', false as any);
          setDocs(listDocs());
        }
        break;
      case 'exportDocx':
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
    </div>
  );
}
