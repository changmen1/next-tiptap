import { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../store';

interface Props {
  editor: Editor | null;
}

interface PaginationStats {
  page: number;
  pages: number;
}

/**
 * 计算状态栏页码。
 *
 * 自动分页开启时，Pagination 插件会把完整页高和页间距写到 ProseMirror DOM 的 dataset，
 * 同时通过 spacer 把正文撑成连续的多页高度，因此可以用 scrollHeight / 页面步长得到真实视觉页数。
 * 自动分页关闭时没有这些指标，再回退到统计文档模型中的硬分页符。
 */
function getPaginationStats(editor: Editor): PaginationStats {
  const pm = editor.view.dom as HTMLElement;
  const pageHeight = Number.parseFloat(pm.dataset.pageHPx || '0');
  const pageGap = Number.parseFloat(pm.dataset.gapPx || '0');
  const pageStride = pageHeight + pageGap;

  if (pageHeight > 0 && pageStride > 0) {
    const pages = Math.max(1, Math.floor((pm.scrollHeight - 2) / pageStride) + 1);
    let page = 1;

    try {
      // coordsAtPos/getBoundingClientRect 返回的是经过 CSS zoom 后的显示坐标，
      // 而 pageStride 是未缩放逻辑像素，所以先除以实际缩放比例。
      const pmRect = pm.getBoundingClientRect();
      const scale = pmRect.height > 0 ? pmRect.height / (pm.offsetHeight || 1) : 1;
      const coords = editor.view.coordsAtPos(editor.state.selection.head);
      const logicalTop = (coords.top - pmRect.top) / (scale > 0.01 ? scale : 1);
      page = Math.max(1, Math.min(pages, Math.floor(Math.max(0, logicalTop) / pageStride) + 1));
    } catch {
      // DOM 还没完成布局时暂时显示第一页，后续 ResizeObserver 会再次计算。
    }

    return { page, pages };
  }

  // 非自动分页模式：按光标之前和整篇文档中的硬分页符分别计算当前页与总页数。
  let page = 1;
  let pages = 1;
  const selectionHead = editor.state.selection.head;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'pageBreak') return;
    pages += 1;
    if (pos < selectionHead) page += 1;
  });
  return { page, pages };
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
      const { page, pages } = getPaginationStats(editor);
      setStats({ words, chars, page, pages });
    };

    // Pagination 插件在 requestAnimationFrame 中更新 spacer；ResizeObserver 能在分页高度稳定后
    // 再次刷新页数，MutationObserver 则负责纸张大小/分页开关变化时立即重算。
    const pm = editor.view.dom as HTMLElement;
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(pm);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(pm, {
      attributes: true,
      attributeFilter: ['data-page-h-px', 'data-gap-px']
    });

    queueMicrotask(update);
    // 文档内容变化和选区变化都可能影响状态栏，例如字数或当前页提示。
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [editor]);

  return (
    <footer className="statusbar">
      <span>第 {stats.page} 页，共 {stats.pages} 页</span>
      <span className="sep">|</span>
      <span>{stats.words.toLocaleString('zh-CN')} 个词</span>
      <span className="sep">|</span>
      <span>{stats.chars.toLocaleString('zh-CN')} 个字符</span>
      <span className="spacer" />
      <button className="rb-btn sm" onClick={zoomOut} title="缩小" aria-label="缩小编辑器">−</button>
      <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
      <button className="rb-btn sm" onClick={zoomIn} title="放大" aria-label="放大编辑器">+</button>
    </footer>
  );
}
