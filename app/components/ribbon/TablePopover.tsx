import { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  editor: Editor;
  inTable: boolean;
}

const STYLES: { id: string; label: string }[] = [
  // 这些 id 对应 editor.css 中 table[data-table-style="..."] 的样式规则。
  { id: 'plain', label: 'Plain Table' },
  { id: 'grid', label: 'Grid Table' },
  { id: 'grid-accent1', label: 'Grid · Accent 1' },
  { id: 'grid-accent2', label: 'Grid · Accent 2' },
  { id: 'grid-accent3', label: 'Grid · Accent 3' },
  { id: 'list-light', label: 'List Light' },
  { id: 'banded-rows', label: 'Banded Rows' },
  { id: 'banded-cols', label: 'Banded Columns' },
  { id: 'banded-accent', label: 'Banded · Accent' },
  { id: 'total-row', label: 'Total Row' }
];

const MAX_ROWS = 8;
const MAX_COLS = 10;

// 表格插入/样式弹层。它既能通过网格插入新表格，也能给当前表格套用预设样式。
export default function TablePopover({ editor, inTable }: Props) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // 点击弹层外部关闭，避免用户需要再次点按钮才能收起。
    const onDoc = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const insert = (r: number, c: number) => {
    // 插入表格后立即套用 grid 样式，让新表格默认有清晰边框。
    editor
      .chain()
      .focus()
      .insertTable({ rows: r, cols: c, withHeaderRow: true })
      .setTableStyle('grid')
      .run();
    setOpen(false);
  };

  const applyStyle = (id: string) => {
    // setTableStyle 是 StyledTable 扩展提供的自定义 command。
    editor.chain().focus().setTableStyle(id).run();
  };

  return (
    <div ref={hostRef} className="dropdown-host">
      <button
        type="button"
        className="rb-btn"
        title="Insert table"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        ▦ Table ▾
      </button>
      {open && (
        <div className="popover popover-table">
          <div className="tp-title">
            Insert table — {hover.r || 0} × {hover.c || 0}
          </div>
          <div
            className="tp-grid"
            onMouseLeave={() => setHover({ r: 0, c: 0 })}
          >
            {Array.from({ length: MAX_ROWS }).map((_, ri) =>
              Array.from({ length: MAX_COLS }).map((_, ci) => {
                const active = ri < hover.r && ci < hover.c;
                return (
                  <span
                    key={`${ri}-${ci}`}
                    className={`tp-cell ${active ? 'on' : ''}`}
                    onMouseEnter={() => setHover({ r: ri + 1, c: ci + 1 })}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(ri + 1, ci + 1)}
                  />
                );
              })
            )}
          </div>

          <div className="tp-section">Table Styles</div>
          <div className="tp-styles">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="tp-style"
                title={s.label}
                disabled={!inTable}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle(s.id)}
              >
                <span className="tp-style-preview" data-table-style={s.id}>
                  <span className="r r0">
                    <span /><span /><span />
                  </span>
                  <span className="r r1">
                    <span /><span /><span />
                  </span>
                  <span className="r r2">
                    <span /><span /><span />
                  </span>
                  <span className="r r3">
                    <span /><span /><span />
                  </span>
                </span>
                <span className="tp-style-label">{s.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="tp-style tp-style-clear"
              disabled={!inTable}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyStyle('')}
              title="Clear style"
            >
              <span className="tp-style-label">⌫ Clear</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
