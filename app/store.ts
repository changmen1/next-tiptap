import { create } from 'zustand';

// 页面尺寸枚举。这里使用 Word/论文场景常见纸张，单位换算集中在文件底部的 helper。
export type PageSize = 'a4' | 'letter' | 'legal' | 'a3' | 'a5';
// 纸张方向：portrait 为纵向，landscape 为横向。
export type Orientation = 'portrait' | 'landscape';
// 预设边距。自定义标尺边距通过 marginMm 单独覆盖，不直接修改这个枚举。
export type MarginPreset = 'normal' | 'narrow' | 'moderate' | 'wide';
// Ribbon 主标签页；表格上下文标签页在 Ribbon 组件内部另行维护。
export type RibbonTab =
  | 'home'
  | 'insert'
  | 'layout'
  | 'review'
  | 'view';

export interface DocMeta {
  // 本地文档唯一 ID。生产环境可替换成数据库主键或论文/稿件 ID。
  id: string;
  // 文档标题，也是导出文件名的默认来源。
  title: string;
  // 最近更新时间，用于文档管理器排序和展示。
  updatedAt: number;
  // 创建时间，用于保留副本/原稿时间信息。
  createdAt: number;
}

// 全局编辑器状态。这里放“跨组件共享的轻量 UI/文档配置”，
// 不放 ProseMirror 正文树，避免每次输入都触发 React/Zustand 级联更新。
interface EditorState {
  docId: string;
  title: string;
  pageSize: PageSize;
  orientation: Orientation;
  margins: MarginPreset;
  /** 自定义边距，单位 mm；有值时覆盖 `margins` 预设，主要给页面标尺拖拽使用。 */
  marginMm: number | null;
  zoom: number;
  previewZoom: number;
  showRuler: boolean;
  paginated: boolean;
  showFormattingMarks: boolean;
  theme: 'light' | 'dark';
  activeTab: RibbonTab;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  // 下面是集中暴露给组件的写操作。修改文档级设置时顺手把 saveStatus 标成 dirty，
  // 这样标题、纸张、方向、边距变化也会进入保存流程。
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

// 本地 demo 使用随机短 ID；迁移生产系统时建议由后端分配稳定 ID。
const genId = () => 'doc_' + Math.random().toString(36).slice(2, 10);
// Zustand store 模块会在 Next 预渲染阶段被服务端求值；
// 因此读取 localStorage 前必须确认当前在浏览器环境。
const getInitialTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem('we_theme') as 'light' | 'dark') || 'light';
};

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
  // 主题偏好保存在 localStorage，刷新后仍可恢复；服务端预渲染时回退为 light。
  theme: getInitialTheme(),
  activeTab: 'home',
  saveStatus: 'saved',
  setTitle: (title) => set({ title, saveStatus: 'dirty' }),
  setPageSize: (pageSize) => set({ pageSize, saveStatus: 'dirty' }),
  setOrientation: (orientation) => set({ orientation, saveStatus: 'dirty' }),
  setMargins: (margins) => set({ margins, marginMm: null, saveStatus: 'dirty' }),
  // 自定义边距限制在 5-80mm，防止拖拽标尺时得到不可编辑或完全挤没正文的页面。
  setMarginMm: (marginMm) =>
    set({
      marginMm: marginMm == null ? null : Math.max(5, Math.min(80, +marginMm.toFixed(2))),
      saveStatus: 'dirty'
    }),
  // 缩放只影响编辑/预览显示，不改变文档模型，因此不会标记 dirty。
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
  // 新建文档只重置元信息；调用方还需要清空 Tiptap 正文内容。
  newDoc: () => set({ docId: genId(), title: 'Untitled Document', saveStatus: 'saved' }),
  // 加载文档同样只同步元信息；正文由 editor.commands.setContent 负责。
  loadDoc: (docId, title) => set({ docId, title, saveStatus: 'saved' })
}));

// 纸张尺寸表，单位为毫米。getPageDims 会根据方向交换宽高。
const SIZES: Record<PageSize, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  a3: [297, 420],
  a5: [148, 210]
};
// Word 常见边距预设，单位为毫米：1 inch = 25.4mm。
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

/** 返回实际生效边距，单位 mm；如果标尺设置了自定义值，就优先使用自定义值。 */
export function getEffectiveMarginMm(preset: MarginPreset, override: number | null) {
  return override != null ? override : MARGIN_MM[preset];
}
