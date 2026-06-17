import { Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';

export interface CapturedFormat {
  // marks 保存当前选区上的文字标记及其属性，例如颜色、字号、高亮。
  marks: Record<string, Record<string, unknown>>;
  textAlign: string | null;
  blockType: 'paragraph' | 'heading' | 'blockquote';
  headingLevel?: number;
}

// 格式刷只捕获这些常见 mark；如果后续扩展了评论、批注、公式等 mark，
// 可以把对应 mark name 加到这里。
const MARK_NAMES = [
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
  'highlight',
  'textStyle',
  'code'
] as const;

/** 捕获当前选区附近的文字标记和块级格式。 */
export function captureFormat(editor: Editor): CapturedFormat {
  const marks: Record<string, Record<string, unknown>> = {};
  for (const name of MARK_NAMES) {
    if (editor.isActive(name)) {
      marks[name] = editor.getAttributes(name);
    }
  }
  const align: string | null =
    (['left', 'center', 'right', 'justify'].find((a) => editor.isActive({ textAlign: a })) as string) || null;

  // 块级格式只记录段落/标题/引用三类，避免格式刷误复制列表结构或表格结构。
  let blockType: CapturedFormat['blockType'] = 'paragraph';
  let headingLevel: number | undefined;
  if (editor.isActive('blockquote')) blockType = 'blockquote';
  else if (editor.isActive('heading')) {
    blockType = 'heading';
    for (const lvl of [1, 2, 3, 4, 5, 6]) {
      if (editor.isActive('heading', { level: lvl })) {
        headingLevel = lvl;
        break;
      }
    }
  }

  return { marks, textAlign: align, blockType, headingLevel };
}

/** 将捕获到的格式应用到当前选区。 */
export function applyFormat(editor: Editor, fmt: CapturedFormat) {
  let chain = editor.chain().focus();

  // 先清空现有 mark，确保目标文本完全变成格式刷捕获的样式，而不是两边样式叠加。
  chain = chain.unsetAllMarks();

  for (const [name, attrs] of Object.entries(fmt.marks)) {
    chain = chain.setMark(name, attrs);
  }

  if (fmt.textAlign) {
    chain = chain.setTextAlign(fmt.textAlign);
  }

  if (fmt.blockType === 'heading' && fmt.headingLevel) {
    chain = chain.setHeading({ level: fmt.headingLevel as 1 | 2 | 3 | 4 | 5 | 6 });
  } else if (fmt.blockType === 'blockquote') {
    chain = chain.setBlockquote();
  } else {
    chain = chain.setParagraph();
  }

  chain.run();
}

interface UseFormatPainterArgs {
  editor: Editor | null;
  active: boolean;
  sticky: boolean;
  captured: React.MutableRefObject<CapturedFormat | null>;
  deactivate: () => void;
}

/**
 * 格式刷 Hook。
 *
 * active 时监听编辑器中的下一次 mouseup，如果用户选中了一段文本，
 * 就把 captured 中保存的格式应用上去。sticky 模式下应用后不自动关闭。
 */
export function useFormatPainter({ editor, active, sticky, captured, deactivate }: UseFormatPainterArgs) {
  const guardRef = useRef(false);
  useEffect(() => {
    if (!editor || !active) return;
    const dom = editor.view.dom as HTMLElement;
    dom.classList.add('fp-cursor');

    const onMouseUp = () => {
      // guardRef 防止 applyFormat 触发的选区/事务变化再次进入当前处理流程。
      if (guardRef.current) return;
      const fmt = captured.current;
      if (!fmt) return;
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) return;
      guardRef.current = true;
      try {
        applyFormat(editor, fmt);
      } finally {
        guardRef.current = false;
      }
      if (!sticky) deactivate();
    };

    dom.addEventListener('mouseup', onMouseUp);
    return () => {
      dom.classList.remove('fp-cursor');
      dom.removeEventListener('mouseup', onMouseUp);
    };
  }, [editor, active, sticky, captured, deactivate]);
}
