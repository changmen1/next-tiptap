import { Editor } from '@tiptap/react';
import { useEffect } from 'react';

interface Handlers {
  // 这些回调由页面层传入，快捷键层只负责识别组合键，不直接操作弹窗/存储。
  onSave: () => void;
  onPrint: () => void;
  onFind: () => void;
  onNew: () => void;
  onOpen: () => void;
}

// 注册全局快捷键。Windows/Linux 使用 Ctrl，macOS 使用 Meta(Command)；
// 因此用 `e.ctrlKey || e.metaKey` 做统一判断。
export function useShortcuts(editor: Editor | null, h: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      // stop 同时阻止浏览器默认行为和事件继续冒泡。
      // 例如 Ctrl+S 默认会打开“保存网页”，这里必须拦截成保存文档。
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
          // Ctrl+Enter 插入硬分页符，和 Word 的常见快捷键保持一致。
          if (editor && e.shiftKey === false && e.ctrlKey === true) {
            stop();
            editor.chain().focus().insertPageBreak().run();
          }
          break;
        case 'backspace':
          // Ctrl/Cmd + Shift + Backspace 删除当前表格，作为表格编辑的快速入口。
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
