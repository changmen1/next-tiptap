// 大纲面板：读取 Tiptap TableOfContents 扩展生成的 heading 列表，
// 并负责点击跳转、滚动同步当前标题、高亮活动项。
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOutlineScrollOffset, scrollToOutlineHeading } from './scrollToOutlineHeading';

interface Props {
  editor: Editor | null;
  onClose: () => void;
  scrollParent: () => HTMLElement | null;
}

export interface OutlineItem {
  // TableOfContents/UniqueID 生成的标题 ID。
  id: string;
  textContent: string;
  level: number;
  originalLevel: number;
  itemIndex: number;
  isActive: boolean;
  pos: number;
  dom?: HTMLElement;
  // 原始 ProseMirror heading 节点，当前 UI 主要不用，但保留方便后续扩展。
  node?: ProseMirrorNode;
}

interface TableOfContentsStorage {
  tableOfContents?: {
    content?: OutlineItem[];
  };
}

function clampHeadingLevel(level: number): number {
  // 防御异常数据：标题层级始终限制在 h1-h6。
  return Math.min(6, Math.max(1, Math.round(level) || 1));
}

function headingLevelClass(originalLevel: number): string {
  return `outline-panel__item--h${clampHeadingLevel(originalLevel)}`;
}

function resolveHeadingIdAtSelection(editor: Editor): string | null {
  // 从当前选区向上找最近的 heading，优先使用 data-toc-id，兜底使用 id。
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'heading') continue;

    const tocId = node.attrs['data-toc-id'];
    if (typeof tocId === 'string' && tocId.length > 0) return tocId;

    const id = node.attrs.id;
    if (typeof id === 'string' && id.length > 0) return id;
  }

  return null;
}

function resolveActiveIdByScroll(scrollParent: HTMLElement, source: OutlineItem[]): string | null {
  // 根据滚动位置推断当前“已经越过顶部偏移线”的最后一个标题。
  const containerRect = scrollParent.getBoundingClientRect();
  const offset = getOutlineScrollOffset(scrollParent);
  let activeId: string | null = null;

  for (const item of source) {
    const el = item.dom;
    if (!el || !(el instanceof HTMLElement)) continue;

    const relativeTop = el.getBoundingClientRect().top - containerRect.top;
    if (relativeTop <= offset) {
      activeId = item.id;
    }
  }

  return activeId;
}

function applyActiveState(source: OutlineItem[], activeId: string | null): OutlineItem[] {
  if (!activeId) return source;
  return source.map((item) => ({
    ...item,
    isActive: item.id === activeId
  }));
}

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T {
  // 滚动事件非常频繁，轻量 debounce 可以减少目录列表 setState 次数。
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  }) as T;
}

export default function OutlinePanel({ editor, onClose, scrollParent }: Props) {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const listRef = useRef<HTMLElement>(null);
  const activeItemId = items.find((item) => item.isActive)?.id ?? null;

  const syncItems = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setItems([]);
      return;
    }

    // TableOfContents 扩展把目录项放在 editor.storage.tableOfContents.content。
    const storage = editor.storage as TableOfContentsStorage;
    let nextItems = (storage.tableOfContents?.content ?? []).map((item) => ({
      ...item,
      originalLevel: clampHeadingLevel(item.originalLevel ?? item.level)
    }));

    const parent = scrollParent();
    if (parent) {
      // 滚动位置和光标位置都可能影响活动标题；先根据滚动推断。
      const scrollActiveId = resolveActiveIdByScroll(parent, nextItems);
      if (scrollActiveId) {
        nextItems = applyActiveState(nextItems, scrollActiveId);
      }
    }

    const selectionActiveId = resolveHeadingIdAtSelection(editor);
    if (selectionActiveId) {
      // 如果光标正处在某个标题内，光标优先级高于滚动推断。
      nextItems = applyActiveState(nextItems, selectionActiveId);
    }

    setItems(nextItems);
  }, [editor, scrollParent]);

  const debouncedSyncItems = useMemo(() => debounce(syncItems, 50), [syncItems]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // 监听事务/更新/选区变化，覆盖标题文本变化、标题增删、光标移动等场景。
    editor.on('transaction', syncItems);
    editor.on('update', syncItems);
    editor.on('selectionUpdate', syncItems);
    queueMicrotask(syncItems);

    return () => {
      if (editor.isDestroyed) return;
      editor.off('transaction', syncItems);
      editor.off('update', syncItems);
      editor.off('selectionUpdate', syncItems);
    };
  }, [editor, syncItems]);

  useEffect(() => {
    const parent = scrollParent();
    if (!parent) return;

    // 滚动正文时同步目录高亮。
    parent.addEventListener('scroll', debouncedSyncItems, { passive: true });
    queueMicrotask(syncItems);

    return () => {
      parent.removeEventListener('scroll', debouncedSyncItems);
    };
  }, [debouncedSyncItems, scrollParent, syncItems]);

  useEffect(() => {
    if (!activeItemId || !listRef.current) return;

    // 活动项变化时，让目录面板自身滚动到该项附近。
    const activeButton = listRef.current.querySelector<HTMLElement>(`[data-outline-id="${activeItemId}"]`);
    activeButton?.scrollIntoView({ block: 'nearest' });
  }, [activeItemId]);

  const scrollToHeading = (item: OutlineItem) => {
    if (!editor || editor.isDestroyed) return;

    // 先把编辑器选区移动到标题位置，再执行 DOM 滚动。
    editor
      .chain()
      .focus()
      .setTextSelection(item.pos + 1)
      .run();

    const parent = scrollParent();
    if (!scrollToOutlineHeading(parent, item.dom)) {
      editor.commands.scrollIntoView();
    }
  };

  return (
    <aside className="outline-panel outline-panel--top-left" aria-label="Document outline">
      <header className="outline-panel__header">
        <span className="outline-panel__title">大纲</span>
        <button
          type="button"
          className="outline-panel__close"
          title="Close outline"
          aria-label="Close outline"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {items.length === 0 ? (
        <div className="outline-panel__empty">No headings yet. Add H1-H6 headings to build an outline.</div>
      ) : (
        <nav ref={listRef} className="outline-panel__list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`outline-panel__item ${headingLevelClass(item.originalLevel)} ${item.isActive ? 'is-active' : ''
                }`}
              style={{ paddingLeft: `${16 + (item.level - 1) * 16}px` }}
              data-outline-id={item.id}
              aria-current={item.isActive ? 'location' : undefined}
              onClick={() => scrollToHeading(item)}
            >
              <span className="outline-panel__text">{item.textContent}</span>
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
