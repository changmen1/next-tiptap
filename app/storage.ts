import { DocMeta } from './store';

// localStorage 中保存“文档索引”的 key。索引只放轻量元数据，便于快速列出文档。
const KEY_INDEX = 'we_index_v1';
// 每篇文档正文单独存一条记录，避免列表读取时反复解析大段 HTML。
const KEY_DOC = (id: string) => `we_doc_v1_${id}`;

export interface StoredDoc extends DocMeta {
  // Tiptap 导出的 HTML 字符串；生产环境通常会把它作为富文本正文持久化。
  content: string;
  // 页面设置目前用 string 存储，方便兼容旧数据；加载后由调用方按枚举类型写回 store。
  pageSize: string;
  orientation: string;
  margins: string;
}

// 读取文档列表。任何 JSON 解析失败都返回空数组，避免损坏的本地数据阻塞应用启动。
export function listDocs(): DocMeta[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_INDEX) || '[]');
  } catch {
    return [];
  }
}

// 保存文档正文，并把它的元数据移动到索引最前面，形成“最近编辑优先”的列表。
export function saveDoc(d: StoredDoc): void {
  localStorage.setItem(KEY_DOC(d.id), JSON.stringify(d));
  const idx = listDocs().filter((x) => x.id !== d.id);
  idx.unshift({ id: d.id, title: d.title, updatedAt: d.updatedAt, createdAt: d.createdAt });
  localStorage.setItem(KEY_INDEX, JSON.stringify(idx));
}

// 按 ID 读取完整文档。读取失败返回 null，调用方负责决定是否回退到空文档。
export function loadDoc(id: string): StoredDoc | null {
  try {
    const raw = localStorage.getItem(KEY_DOC(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 删除完整文档，同时从索引里移除对应元数据。
export function deleteDoc(id: string): void {
  localStorage.removeItem(KEY_DOC(id));
  const idx = listDocs().filter((x) => x.id !== id);
  localStorage.setItem(KEY_INDEX, JSON.stringify(idx));
}

// 记录最后打开的文档 ID，用于下次打开页面时恢复现场。
export function getLastDocId(): string | null {
  return localStorage.getItem('we_last_doc');
}

export function setLastDocId(id: string): void {
  localStorage.setItem('we_last_doc', id);
}
