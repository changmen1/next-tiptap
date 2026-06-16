import { Editor } from '@tiptap/react';

interface CmdProps {
  editor: Editor;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

export function RBtn({ editor, active, disabled, title, onClick, children, className = '' }: CmdProps) {
  return (
    <button
      type="button"
      className={`rb-btn ${active ? 'active' : ''} ${className}`}
      title={title}
      disabled={disabled || !editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function RBig({
  onClick,
  icon,
  label,
  title
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="rb-big"
      title={title || label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className="ico">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function RGroup({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`group ${className}`.trim()}>
      <div className="grp-body">{children}</div>
      <div className="grp-label">{label}</div>
    </div>
  );
}
