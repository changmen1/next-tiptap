import { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export default function Dialog({ open, title, onClose, children, wide }: Props) {
  if (!open) return null;
  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header>
          <strong>{title}</strong>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="body">{children}</div>
      </div>
    </>
  );
}
