import { Editor } from '@tiptap/react';

interface CmdProps {
  // editor 用来统一禁用按钮：编辑器还没初始化时不允许触发命令。
  editor: Editor;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

// Ribbon 普通按钮。onMouseDown 阻止默认行为，避免点击工具栏时编辑器失焦、
// 选区丢失，从而导致格式命令作用不到原来的文本上。
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

// Ribbon 大按钮，适合“粘贴、封面、图片”等高频/大入口操作。
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

// Ribbon 分组容器：上方放按钮，下方显示组名，模拟 Word 工具栏布局。
export function RGroup({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`group ${className}`.trim()}>
      <div className="grp-body">{children}</div>
      <div className="grp-label">{label}</div>
    </div>
  );
}
