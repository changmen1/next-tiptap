import { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../store';

interface Props {
  editor: Editor | null;
}

export default function StatusBar({ editor }: Props) {
  const { zoom, zoomIn, zoomOut } = useEditorStore();
  const [stats, setStats] = useState({ words: 0, chars: 0, page: 1, pages: 1 });

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      // Page count estimate: count page-break nodes + 1
      let pages = 1;
      editor.state.doc.descendants((n) => {
        if (n.type.name === 'pageBreak') pages++;
      });
      setStats({ words, chars, page: 1, pages });
    };
    update();
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
