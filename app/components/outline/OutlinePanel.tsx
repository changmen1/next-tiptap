// 大纲面板
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
  id: string;
  textContent: string;
  level: number;
  originalLevel: number;
  itemIndex: number;
  isActive: boolean;
  pos: number;
  dom?: HTMLElement;
  node?: ProseMirrorNode;
}

interface TableOfContentsStorage {
  tableOfContents?: {
    content?: OutlineItem[];
  };
}

function clampHeadingLevel(level: number): number {
  return Math.min(6, Math.max(1, Math.round(level) || 1));
}

function headingLevelClass(originalLevel: number): string {
  return `outline-panel__item--h${clampHeadingLevel(originalLevel)}`;
}

function resolveHeadingIdAtSelection(editor: Editor): string | null {
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

    const storage = editor.storage as TableOfContentsStorage;
    let nextItems = (storage.tableOfContents?.content ?? []).map((item) => ({
      ...item,
      originalLevel: clampHeadingLevel(item.originalLevel ?? item.level)
    }));

    const parent = scrollParent();
    if (parent) {
      const scrollActiveId = resolveActiveIdByScroll(parent, nextItems);
      if (scrollActiveId) {
        nextItems = applyActiveState(nextItems, scrollActiveId);
      }
    }

    const selectionActiveId = resolveHeadingIdAtSelection(editor);
    if (selectionActiveId) {
      nextItems = applyActiveState(nextItems, selectionActiveId);
    }

    setItems(nextItems);
  }, [editor, scrollParent]);

  const debouncedSyncItems = useMemo(() => debounce(syncItems, 50), [syncItems]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    editor.on('transaction', syncItems);
    editor.on('update', syncItems);
    editor.on('selectionUpdate', syncItems);
    syncItems();

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

    parent.addEventListener('scroll', debouncedSyncItems, { passive: true });
    syncItems();

    return () => {
      parent.removeEventListener('scroll', debouncedSyncItems);
    };
  }, [debouncedSyncItems, scrollParent, syncItems]);

  useEffect(() => {
    if (!activeItemId || !listRef.current) return;

    const activeButton = listRef.current.querySelector<HTMLElement>(`[data-outline-id="${activeItemId}"]`);
    activeButton?.scrollIntoView({ block: 'nearest' });
  }, [activeItemId]);

  const scrollToHeading = (item: OutlineItem) => {
    if (!editor || editor.isDestroyed) return;

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
        <span className="outline-panel__title">Outline</span>
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
