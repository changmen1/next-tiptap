import { ReactNode } from 'react';

interface Props {
  // 是否渲染弹窗；关闭时直接 return null，避免隐藏弹窗仍留在 DOM 里抢焦点。
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

// 通用模态框。它只负责遮罩、标题、关闭按钮和内容容器；
// 具体表单/列表由 children 传入，便于多个功能复用同一套样式。
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
