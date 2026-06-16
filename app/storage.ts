import { DocMeta } from './store';

const KEY_INDEX = 'we_index_v1';
const KEY_DOC = (id: string) => `we_doc_v1_${id}`;

export interface StoredDoc extends DocMeta {
  content: string; // HTML
  pageSize: string;
  orientation: string;
  margins: string;
}

export function listDocs(): DocMeta[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_INDEX) || '[]');
  } catch {
    return [];
  }
}

export function saveDoc(d: StoredDoc): void {
  localStorage.setItem(KEY_DOC(d.id), JSON.stringify(d));
  const idx = listDocs().filter((x) => x.id !== d.id);
  idx.unshift({ id: d.id, title: d.title, updatedAt: d.updatedAt, createdAt: d.createdAt });
  localStorage.setItem(KEY_INDEX, JSON.stringify(idx));
}

export function loadDoc(id: string): StoredDoc | null {
  try {
    const raw = localStorage.getItem(KEY_DOC(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteDoc(id: string): void {
  localStorage.removeItem(KEY_DOC(id));
  const idx = listDocs().filter((x) => x.id !== id);
  localStorage.setItem(KEY_INDEX, JSON.stringify(idx));
}

export function getLastDocId(): string | null {
  return localStorage.getItem('we_last_doc');
}

export function setLastDocId(id: string): void {
  localStorage.setItem('we_last_doc', id);
}
