import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Main button content (icon / label). */
  main: React.ReactNode;
  /** Tooltip on the main button. */
  title?: string;
  active?: boolean;
  disabled?: boolean;
  /** Action when clicking the main half. */
  onClick: () => void;
  /** Popover content rendered when caret is opened. */
  popover: (close: () => void) => React.ReactNode;
  /** Additional class on the main button. */
  className?: string;
  /** If true the caret takes full height (Word-style stacked split). */
  stacked?: boolean;
  /** Optional content shown above the caret on a stacked split. */
  caretLabel?: React.ReactNode;
}

/**
 * Word-style split-button: clicking the main half runs `onClick`,
 * clicking the caret opens a popover.
 */
export default function SplitButton({
  main,
  title,
  active,
  disabled,
  onClick,
  popover,
  className = '',
  stacked,
  caretLabel
}: Props) {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={hostRef} className={`split-host ${stacked ? 'stacked' : ''} ${className}`.trim()}>
      <button
        type="button"
        className={`rb-btn split-main ${active ? 'active' : ''}`}
        title={title}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {main}
      </button>
      <button
        type="button"
        className="rb-btn split-caret"
        title={title}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        {caretLabel}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="popover split-popover">
          {popover(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
