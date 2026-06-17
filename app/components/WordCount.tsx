import { Editor } from '@tiptap/react';
import Dialog from './Dialog';

interface Props {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}

export default function WordCount({ editor, open, onClose }: Props) {
  if (!editor) return null;
  const text = editor.getText();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const charsNoSpace = text.replace(/\s/g, '').length;
  const paragraphs = (text.match(/\n+/g)?.length ?? 0) + (text.trim() ? 1 : 0);
  const sentences = (text.match(/[.!?]+\s|[.!?]+$/g) || []).length;
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
