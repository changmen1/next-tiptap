import { Editor } from '@tiptap/react';
import Dialog from './Dialog';

interface Props {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

export default function WordCount({ editor, open, onClose }: Props) {
  if (!editor) return null;
  // 这里的统计基于 editor.getText()，会剥离所有 HTML 标记。
  // 如果后续论文系统需要“参考文献不计入字数”等规则，可以在这里扩展过滤逻辑。
  const text = editor.getText();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const paragraphs = (text.match(/\n+/g)?.length ?? 0) + (text.trim() ? 1 : 0);
  const sentences = (text.match(/[.!?]+\s|[.!?]+$/g) || []).length;
  // 与状态栏一致：这里只统计手动插入的硬分页符，不是视觉分页插件计算出的真实页数。
  let pages = 1;
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'pageBreak') pages++;
  });
  const rows: [string, string | number][] = [
    ['Pages', pages],
    ['Words', words.toLocaleString()],
    ['Characters (with spaces)', chars.toLocaleString()],
    ['Characters (no spaces)', charsNoSpace.toLocaleString()],
    ['Paragraphs', paragraphs],
    ['Sentences', sentences]
  ];
  return (
    <Dialog open={open} title="Word Count" onClose={onClose}>
      <table className="kv-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
