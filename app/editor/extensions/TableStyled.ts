import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    tableStyled: {
      /** 给当前表格应用一个类似 Word 的预设样式。 */
      setTableStyle: (name: string | null) => ReturnType;
      /** 把单个 CSS 声明合并到当前单元格或选中单元格的 style 属性中。 */
      setCellStyleProp: (prop: string, value: string | null) => ReturnType;
      /** 给当前表格应用边框预设：全边框、外边框、内边框、横线、无边框。 */
      setTableBorderPreset: (preset: 'all' | 'outer' | 'inner' | 'horizontal' | 'none') => ReturnType;
    };
  }
}

/** 在 inline style 字符串中合并/替换单个 CSS 声明。value 为 null 时删除该声明。 */
function mergeStyle(existing: string | null | undefined, prop: string, value: string | null): string | null {
  const map = new Map<string, string>();
  if (existing) {
    for (const part of existing.split(';')) {
      const idx = part.indexOf(':');
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim().toLowerCase();
      const v = part.slice(idx + 1).trim();
      if (k) map.set(k, v);
    }
  }
  if (value == null || value === '') {
    map.delete(prop.toLowerCase());
  } else {
    map.set(prop.toLowerCase(), value);
  }
  if (map.size === 0) return null;
  return Array.from(map.entries()).map(([k, v]) => `${k}: ${v}`).join('; ');
}

// 透传 style/class：用于保留 Word/Excel 粘贴来的单元格样式。
const passthroughStyle = {
  style: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('style'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.style ? { style: attrs.style as string } : {}
  }
};

const passthroughClass = {
  class: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('class'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.class ? { class: attrs.class as string } : {}
  }
};

/** 生成一个“读取并原样写回 HTML 属性”的 Tiptap 属性配置。 */
function makeAttrPassthrough(name: string) {
  return {
    [name]: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => el.getAttribute(name),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[name] != null && attrs[name] !== '' ? { [name]: String(attrs[name]) } : {}
    }
  };
}

const cellLegacyAttrs = {
  // Office/旧 HTML 表格常见单元格属性，保留它们有助于粘贴后维持视觉样式。
  ...makeAttrPassthrough('bgcolor'),
  ...makeAttrPassthrough('align'),
  ...makeAttrPassthrough('valign'),
  ...makeAttrPassthrough('width'),
  ...makeAttrPassthrough('height'),
  ...makeAttrPassthrough('nowrap')
};

const tableLegacyAttrs = {
  // 表格级旧属性同样保留，但 ClipboardClean 会提前去掉容易撑破页面的绝对宽度。
  ...makeAttrPassthrough('width'),
  ...makeAttrPassthrough('border'),
  ...makeAttrPassthrough('cellpadding'),
  ...makeAttrPassthrough('cellspacing'),
  ...makeAttrPassthrough('bgcolor'),
  ...makeAttrPassthrough('align')
};

/**
 * 根据文档里的 table 节点生成 DecorationSet，
 * 把模型属性 tableStyle/tableBorder 贴到真实 DOM <table> 上。
 *
 * 原因：Tiptap 内置 TableView 会自己创建 <table> 元素，
 * addAttributes 中的自定义属性不一定会出现在 live DOM 上；
 * Decoration.node 可以绕过这个限制，保证 CSS 选择器能匹配到 data-table-style。
 */
function buildTableDecorations(doc: import('@tiptap/pm/model').Node): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return;
    const attrs: Record<string, string> = {};
    const style = node.attrs.tableStyle as string | null;
    const border = node.attrs.tableBorder as string | null;
    if (style) attrs['data-table-style'] = style;
    if (border) attrs['data-table-border'] = border;
    if (Object.keys(attrs).length > 0) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const StyledTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...passthroughStyle,
      ...tableLegacyAttrs,
      class: {
        default: 'we-table',
        parseHTML: (el: HTMLElement) => el.getAttribute('class') || 'we-table',
        renderHTML: (attrs: Record<string, unknown>) => ({
          class: (attrs.class as string) || 'we-table'
        })
      },
      tableStyle: {
        // 表格样式只保存为语义化 id，真正的视觉规则由 editor.css/ribbon.css 根据 data-table-style 控制。
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-table-style'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.tableStyle ? { 'data-table-style': attrs.tableStyle as string } : {}
      },
      tableBorder: {
        // 边框预设同样保存为 id，避免把大量 border CSS 写入每个单元格。
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-table-border'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.tableBorder ? { 'data-table-border': attrs.tableBorder as string } : {}
      }
    };
  },
  /**
   * 每次事务后如果文档变化，就重建表格 Decoration。
   * 这一步只影响 live DOM 属性，不改变文档内容本身。
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('styled-table-decorations'),
        state: {
          init: (_, { doc }) => buildTableDecorations(doc),
          apply: (tr, old) =>
            tr.docChanged ? buildTableDecorations(tr.doc) : old
        },
        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty;
          }
        }
      })
    ];
  },
  addCommands() {
    const parent = this.parent?.() ?? {};

    /**
     * 从当前选区向上查找所在 table 节点。
     *
     * 这里不用 commands.updateAttributes('table', ...)，是因为从 ribbon chip 这类会抢焦点的
     * UI 事件触发时，高阶命令偶尔会静默失败；直接 tr.setNodeMarkup 更稳定。
     */
    const findTablePos = (state: import('@tiptap/pm/state').EditorState) => {
      const { $from } = state.selection;
      for (let d = $from.depth; d >= 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'table') {
          return { pos: d === 0 ? 0 : $from.before(d), node };
        }
      }
      return null;
    };

    return {
      ...parent,
      setTableStyle:
        (name: string | null) =>
          ({ state, dispatch, tr }) => {
            const found = findTablePos(state);
            if (!found) return false;
            if (dispatch) {
              tr.setNodeMarkup(found.pos, undefined, {
                ...found.node.attrs,
                tableStyle: name && name !== '' ? name : null
              });
              dispatch(tr);
            }
            return true;
          },
      setTableBorderPreset:
        (preset: 'all' | 'outer' | 'inner' | 'horizontal' | 'none') =>
          ({ state, dispatch, tr }) => {
            const found = findTablePos(state);
            if (!found) return false;
            if (dispatch) {
              tr.setNodeMarkup(found.pos, undefined, {
                ...found.node.attrs,
                tableBorder: preset
              });
              dispatch(tr);
            }
            return true;
          },
      setCellStyleProp:
        (prop: string, value: string | null) =>
          ({ state, dispatch, tr }) => {
            const cellPositions: number[] = [];

            // 1. 多单元格选区：遍历所有被选中的 cell。
            if (state.selection instanceof CellSelection) {
              state.selection.forEachCell((_node, pos) => {
                cellPositions.push(pos);
              });
            }

            // 2. 普通光标：向上找到当前所在单元格。
            if (cellPositions.length === 0) {
              const { $from } = state.selection;
              for (let d = $from.depth; d > 0; d--) {
                const node = $from.node(d);
                if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                  cellPositions.push($from.before(d));
                  break;
                }
              }
            }

            if (cellPositions.length === 0) return false;

            if (dispatch) {
              // 对每个目标单元格合并 style，而不是覆盖整个 style，避免丢失粘贴来的背景/对齐等样式。
              for (const pos of cellPositions) {
                const node = tr.doc.nodeAt(pos);
                if (!node) continue;
                const next = mergeStyle(node.attrs.style as string | null, prop, value);
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: next });
              }
              dispatch(tr);
            }
            return true;
          }
    };
  }
});

export const StyledTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...passthroughStyle,
      ...passthroughClass,
      ...cellLegacyAttrs
    };
  }
});

export const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...passthroughStyle,
      ...passthroughClass,
      ...cellLegacyAttrs
    };
  }
});
