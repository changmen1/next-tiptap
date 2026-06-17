import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 主按钮内容，可以是图标、文字或组合。 */
  main: React.ReactNode;
  /** 主按钮 tooltip。 */
  title?: string;
  active?: boolean;
  disabled?: boolean;
  /** 点击主按钮半区时执行的默认动作。 */
  onClick: () => void;
  /** 点击箭头半区后渲染的弹层内容，参数 close 用于子项点击后关闭弹层。 */
  popover: (close: () => void) => React.ReactNode;
  /** 外层额外 class。 */
  className?: string;
  /** true 时箭头占据完整高度，形成 Word 风格的上下堆叠拆分按钮。 */
  stacked?: boolean;
  /** 堆叠模式下箭头上方的可选内容，例如颜色条。 */
  caretLabel?: React.ReactNode;
}

/**
 * Word 风格拆分按钮：
 * 主按钮执行默认命令，箭头按钮打开更多选项。
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
    // 弹层打开后，点击组件外部自动关闭。
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
