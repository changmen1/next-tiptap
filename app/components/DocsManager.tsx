import { DocMeta } from '../store';
import Dialog from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  docs: DocMeta[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export default function DocsManager({ open, onClose, docs, onLoad, onDelete, onNew }: Props) {
  return (
    <Dialog open={open} title="My Documents" onClose={onClose} wide>
      <div className="row">
        <button
          onClick={() => {
            onNew();
            onClose();
          }}
        >
          + New Document
        </button>
        <span className="muted">{docs.length} document(s) stored locally</span>
      </div>
      <ul className="docs-list">
        {docs.length === 0 && <li className="muted">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id}>
            <button
              className="docs-load"
              onClick={() => {
                onLoad(d.id);
                onClose();
              }}
            >
              <span className="docs-name">{d.title || 'Untitled'}</span>
              <span className="docs-date">{new Date(d.updatedAt).toLocaleString()}</span>
            </button>
            <button
              className="docs-del"
              onClick={() => {
                if (confirm(`Delete "${d.title}"?`)) onDelete(d.id);
              }}
              title="Delete"
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
