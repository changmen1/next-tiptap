import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    tableStyled: {
      /** Apply a Word-like preset style to the enclosing table. */
      setTableStyle: (name: string | null) => ReturnType;
      /** Merge a CSS declaration into the current cell's `style` attribute. */
      setCellStyleProp: (prop: string, value: string | null) => ReturnType;
      /** Apply a border preset to the enclosing table (all / outer / none / horizontal). */
      setTableBorderPreset: (preset: 'all' | 'outer' | 'inner' | 'horizontal' | 'none') => ReturnType;
    };
  }
}

/** Merge / replace a single CSS declaration inside an inline-style string. */
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

/** HTML attributes Excel / Word frequently emit on cells and tables. */
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
  ...makeAttrPassthrough('bgcolor'),
  ...makeAttrPassthrough('align'),
  ...makeAttrPassthrough('valign'),
  ...makeAttrPassthrough('width'),
  ...makeAttrPassthrough('height'),
  ...makeAttrPassthrough('nowrap')
};

const tableLegacyAttrs = {
  ...makeAttrPassthrough('width'),
  ...makeAttrPassthrough('border'),
  ...makeAttrPassthrough('cellpadding'),
  ...makeAttrPassthrough('cellspacing'),
  ...makeAttrPassthrough('bgcolor'),
  ...makeAttrPassthrough('align')
};

/** Produce a DecorationSet that pins each table node's tableStyle /
 * tableBorder model attributes onto the rendered `<table>` element as
 * `data-table-style` / `data-table-border` DOM attributes. Used by the
 * StyledTable plugin below to work around tiptap's TableView NodeView
 * stripping custom attributes. */
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
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-table-style'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.tableStyle ? { 'data-table-style': attrs.tableStyle as string } : {}
      },
      tableBorder: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-table-border'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.tableBorder ? { 'data-table-border': attrs.tableBorder as string } : {}
      }
    };
  },
  /**
   * Tiptap's built-in TableView (NodeView) creates a fresh `<table>`
   * element and does NOT apply custom attributes from `addAttributes`
   * to the rendered DOM. That means `data-table-style` lives in the
   * model but never reaches the live `<table>` element, so the CSS
   * presets (`.ProseMirror table[data-table-style="..."]`) can't match.
   *
   * This plugin walks the document on every transaction and emits a
   * `Decoration.node` for each table node, applying the current values
   * as DOM attributes — which Tiptap *will* attach to the rendered
   * `<table>` element regardless of the NodeView. */
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

    /** Walk up from the current selection to find the enclosing <table> node.
     * Returns its document position, or null if the cursor is not inside a
     * table. We use a manual walk + tr.setNodeMarkup instead of the
     * higher-level commands.updateAttributes('table', ...) because the
     * latter has been observed to silently no-op when the chain is invoked
     * from a focus-stealing UI event (ribbon chip click). The direct
     * transaction always succeeds. */
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

            // 1. CellSelection (multi-cell drag): iterate every selected cell.
            if (state.selection instanceof CellSelection) {
              state.selection.forEachCell((_node, pos) => {
                cellPositions.push(pos);
              });
            }

            // 2. Otherwise walk up from the cursor to the enclosing cell.
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
