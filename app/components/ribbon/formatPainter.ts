import { Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';

export interface CapturedFormat {
  marks: Record<string, Record<string, unknown>>;
  textAlign: string | null;
  blockType: 'paragraph' | 'heading' | 'blockquote';
  headingLevel?: number;
}

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

/** Capture marks + block info around the current selection. */
export function captureFormat(editor: Editor): CapturedFormat {
  const marks: Record<string, Record<string, unknown>> = {};
  for (const name of MARK_NAMES) {
    if (editor.isActive(name)) {
      marks[name] = editor.getAttributes(name);
    }
  }
  const align: string | null =
    (['left', 'center', 'right', 'justify'].find((a) => editor.isActive({ textAlign: a })) as string) || null;

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

/** Apply a captured format to the current selection. */
export function applyFormat(editor: Editor, fmt: CapturedFormat) {
  let chain = editor.chain().focus();

  // Drop existing marks first so we don't merge with the target.
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
 * Hook that listens for the next selection in the editor while format painter
 * is active and applies the captured format to it. Honours sticky mode.
 */
export function useFormatPainter({ editor, active, sticky, captured, deactivate }: UseFormatPainterArgs) {
  const guardRef = useRef(false);
  useEffect(() => {
    if (!editor || !active) return;
    const dom = editor.view.dom as HTMLElement;
    dom.classList.add('fp-cursor');

    const onMouseUp = () => {
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
