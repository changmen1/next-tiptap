import { create } from 'zustand';

export type PageSize = 'a4' | 'letter' | 'legal' | 'a3' | 'a5';
export type Orientation = 'portrait' | 'landscape';
export type MarginPreset = 'normal' | 'narrow' | 'moderate' | 'wide';
export type RibbonTab =
  | 'home'
  | 'insert'
  | 'layout'
  | 'review'
  | 'view';

export interface DocMeta {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
}

interface EditorState {
  docId: string;
  title: string;
  pageSize: PageSize;
  orientation: Orientation;
  margins: MarginPreset;
  /** Custom margin in mm — overrides `margins` preset when set (used by the ruler). */
  marginMm: number | null;
  zoom: number;
  previewZoom: number;
  showRuler: boolean;
  paginated: boolean;
  showFormattingMarks: boolean;
  theme: 'light' | 'dark';
  activeTab: RibbonTab;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  // setters
  setTitle: (t: string) => void;
  setPageSize: (s: PageSize) => void;
  setOrientation: (o: Orientation) => void;
  setMargins: (m: MarginPreset) => void;
  setMarginMm: (mm: number | null) => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setPreviewZoom: (z: number) => void;
  previewZoomIn: () => void;
  previewZoomOut: () => void;
  previewZoomReset: () => void;
  toggleRuler: () => void;
  togglePagination: () => void;
  toggleFormattingMarks: () => void;
  toggleTheme: () => void;
  setActiveTab: (t: RibbonTab) => void;
  setSaveStatus: (s: EditorState['saveStatus']) => void;
  newDoc: () => void;
  loadDoc: (id: string, title: string) => void;
}

const genId = () => 'doc_' + Math.random().toString(36).slice(2, 10);

export const useEditorStore = create<EditorState>((set, get) => ({
  docId: genId(),
  title: 'Untitled Document',
  pageSize: 'letter',
  orientation: 'portrait',
  margins: 'normal',
  marginMm: null,
  zoom: 1,
  previewZoom: 1,
  showRuler: true,
  paginated: true,
  showFormattingMarks: false,
  theme: (localStorage.getItem('we_theme') as 'light' | 'dark') || 'light',
  activeTab: 'home',
  saveStatus: 'saved',
  setTitle: (title) => set({ title, saveStatus: 'dirty' }),
  setPageSize: (pageSize) => set({ pageSize, saveStatus: 'dirty' }),
  setOrientation: (orientation) => set({ orientation, saveStatus: 'dirty' }),
  setMargins: (margins) => set({ margins, marginMm: null, saveStatus: 'dirty' }),
  setMarginMm: (marginMm) =>
    set({
      marginMm: marginMm == null ? null : Math.max(5, Math.min(80, +marginMm.toFixed(2))),
      saveStatus: 'dirty'
    }),
  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.25, zoom)) }),
  zoomIn: () => set({ zoom: Math.min(3, +(get().zoom + 0.1).toFixed(2)) }),
  zoomOut: () => set({ zoom: Math.max(0.25, +(get().zoom - 0.1).toFixed(2)) }),
  zoomReset: () => set({ zoom: 1 }),
  setPreviewZoom: (previewZoom) => set({ previewZoom: Math.min(3, Math.max(0.25, previewZoom)) }),
  previewZoomIn: () => set({ previewZoom: Math.min(3, +(get().previewZoom + 0.1).toFixed(2)) }),
  previewZoomOut: () => set({ previewZoom: Math.max(0.25, +(get().previewZoom - 0.1).toFixed(2)) }),
  previewZoomReset: () => set({ previewZoom: 1 }),
  toggleRuler: () => set({ showRuler: !get().showRuler }),
  togglePagination: () => set({ paginated: !get().paginated }),
  toggleFormattingMarks: () => set({ showFormattingMarks: !get().showFormattingMarks }),
  toggleTheme: () => {
    const theme = get().theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('we_theme', theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  newDoc: () => set({ docId: genId(), title: 'Untitled Document', saveStatus: 'saved' }),
  loadDoc: (docId, title) => set({ docId, title, saveStatus: 'saved' })
}));

// Page dimension helpers (in millimetres)
const SIZES: Record<PageSize, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  a3: [297, 420],
  a5: [148, 210]
};
const MARGIN_MM: Record<MarginPreset, number> = {
  normal: 25.4,
  narrow: 12.7,
  moderate: 19.05,
  wide: 31.75
};

export function getPageDims(size: PageSize, orient: Orientation) {
  const [w, h] = SIZES[size];
  return orient === 'portrait' ? { w, h } : { w: h, h: w };
}
export function getMarginMm(preset: MarginPreset) {
  return MARGIN_MM[preset];
}

/** Effective margin in mm — honours the ruler's custom override when set. */
export function getEffectiveMarginMm(preset: MarginPreset, override: number | null) {
  return override != null ? override : MARGIN_MM[preset];
}
