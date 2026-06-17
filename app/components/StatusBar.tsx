import { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../store';

interface Props {
  editor: Editor | null;
}

export default function StatusBar({ editor }: Props) {
  // 状态栏只展示轻量统计和编辑器缩放，不直接修改文档内容。
  const { zoom, zoomIn, zoomOut } = useEditorStore();
  const [stats, setStats] = useState({ words: 0, chars: 0, page: 1, pages: 1 });

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const text = editor.getText();
      // 简单英文词数统计：按空白分词。中文论文如果需要精确字/词统计，
      // 可在这里替换成中文分词或按 CJK 字符计数策略。
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      // 页数这里只按硬分页符估算；真实分页页数由 EditorSurface/Pagination 负责。
      let pages = 1;
      editor.state.doc.descendants((n) => {
        if (n.type.name === 'pageBreak') pages++;
      });
      setStats({ words, chars, page: 1, pages });
    };
    update();
    // 文档内容变化和选区变化都可能影响状态栏，例如字数或当前页提示。
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  return (
    <footer className="statusbar">
      <span>Page {stats.page} of {stats.pages}</span>
      <span className="sep">|</span>
      <span>{stats.words.toLocaleString()} words</span>
      <span className="sep">|</span>
      <span>{stats.chars.toLocaleString()} characters</span>
      <span className="spacer" />
      <button className="rb-btn sm" onClick={zoomOut} title="Zoom out">−</button>
      <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
      <button className="rb-btn sm" onClick={zoomIn} title="Zoom in">+</button>
    </footer>
  );
}
