import { Editor } from '@tiptap/react';
import { useEffect } from 'react';

interface Handlers {
  onSave: () => void;
  onPrint: () => void;
  onFind: () => void;
  onNew: () => void;
  onOpen: () => void;
}

export function useShortcuts(editor: Editor | null, h: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      switch (k) {
        case 's':
          stop();
          h.onSave();
          break;
        case 'p':
          stop();
          h.onPrint();
          break;
        case 'f':
          stop();
          h.onFind();
          break;
        case 'n':
          if (e.shiftKey) {
            stop();
            h.onNew();
          }
          break;
        case 'o':
          stop();
          h.onOpen();
          break;
        case 'enter':
          if (editor && e.shiftKey === false && e.ctrlKey === true) {
            stop();
            editor.chain().focus().insertPageBreak().run();
          }
          break;
        case 'backspace':
          if (editor && e.shiftKey && (e.ctrlKey || e.metaKey)) {
            stop();
            editor.chain().focus().deleteTable().run();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editor, h]);
}
