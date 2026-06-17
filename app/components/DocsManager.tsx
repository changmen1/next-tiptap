import { DocMeta } from '../store';
import Dialog from './Dialog';

interface Props {
  // open/onClose 由页面层控制，DocsManager 不自己管理弹窗状态。
  open: boolean;
  onClose: () => void;
  docs: DocMeta[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

// 本地文档管理器：展示 localStorage 索引，允许新建、加载、删除。
// 它只处理列表 UI，真正的读写逻辑由 page.tsx 传入的回调完成。
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
        {/* 列表按 storage.saveDoc 的 unshift 顺序展示，最新编辑的文档在最前。 */}
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
