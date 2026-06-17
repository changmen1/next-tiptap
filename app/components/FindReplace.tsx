import { Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Dialog from './Dialog';

interface Props {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

interface Match {
  // ProseMirror 文档中的绝对位置范围，[from, to)。
  from: number;
  to: number;
}

// 在当前文档的文本节点中查找匹配项。
// 注意：它不会跨多个文本节点匹配，因此跨格式边界的词可能不会被命中。
function findMatches(editor: Editor, query: string, caseSensitive: boolean, wholeWord: boolean): Match[] {
  if (!query) return [];
  const results: Match[] = [];
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const re = new RegExp(pattern, flags);
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let m: RegExpExecArray | null;
    while ((m = re.exec(node.text)) !== null) {
      // pos 是当前文本节点在文档中的起点，m.index 是该文本节点内偏移。
      const from = pos + m.index;
      results.push({ from, to: from + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  });
  return results;
}

export default function FindReplace({ editor, open, onClose }: Props) {
  // q = 查找词，r = 替换文本，cs = 大小写敏感，ww = 整词匹配。
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [cs, setCs] = useState(false);
  const [ww, setWw] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 弹窗打开后稍等一帧再 focus，确保 input 已经挂载。
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const matches = useMemo(() => (editor ? findMatches(editor, q, cs, ww) : []), [editor, q, cs, ww]);

  useEffect(() => {
    if (!editor || matches.length === 0) return;
    // 当前匹配项同步成编辑器选区，并滚动到可见区域。
    const m = matches[Math.min(idx, matches.length - 1)];
    editor.commands.setTextSelection({ from: m.from, to: m.to });
    editor.commands.scrollIntoView();
  }, [editor, matches, idx]);

  const next = () => setIdx((i) => (matches.length ? (i + 1) % matches.length : 0));
  const prev = () => setIdx((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));

  const replaceOne = () => {
    if (!editor || matches.length === 0) return;
    const m = matches[Math.min(idx, matches.length - 1)];
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).insertContent(r).run();
  };

  const replaceAll = () => {
    if (!editor || matches.length === 0) return;
    // 从后往前替换，避免前面的替换改变后续匹配项的位置。
    const chain = editor.chain().focus();
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      chain.setTextSelection({ from: m.from, to: m.to }).insertContent(r);
    }
    chain.run();
  };

  return (
    <Dialog open={open} title="Find & Replace" onClose={onClose}>
      <label className="field">
        <span>Find</span>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <label className="field">
        <span>Replace</span>
        <input value={r} onChange={(e) => setR(e.target.value)} />
      </label>
      <div className="row">
        <label className="chk">
          <input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Match case
        </label>
        <label className="chk">
          <input type="checkbox" checked={ww} onChange={(e) => setWw(e.target.checked)} /> Whole word
        </label>
      </div>
      <div className="row">
        <button onClick={prev} disabled={!matches.length}>◀ Prev</button>
        <button onClick={next} disabled={!matches.length}>Next ▶</button>
        <button onClick={replaceOne} disabled={!matches.length}>Replace</button>
        <button onClick={replaceAll} disabled={!matches.length}>Replace All</button>
        <span className="muted">
          {matches.length ? `${Math.min(idx + 1, matches.length)} / ${matches.length}` : 'No matches'}
        </span>
      </div>
    </Dialog>
  );
}
