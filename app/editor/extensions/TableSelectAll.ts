import { Plugin, PluginKey } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { Extension } from "@tiptap/react";

/**
 * TableSelectAll
 * ---------------
 * Attaches a hover-only "select-all" button to the top-right corner of
 * every <table> inside the editor. Clicking the button selects the whole
 * table by issuing a CellSelection that spans from the first header/cell
 * to the last cell of the last row.
 *
 * The button is a single shared overlay element appended to the editor
 * container; it is repositioned over the currently-hovered table and
 * hidden otherwise. This avoids mutating the editable DOM (no node
 * decorations) and keeps the implementation independent of the table
 * node-view.
 */
const key = new PluginKey('tableSelectAll');

export const TableSelectAll = Extension.create({
  name: 'tableSelectAll',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        view(view) {
          const root = view.dom as HTMLElement;
          // The overlay must escape the .ProseMirror's contentEditable so
          // clicks land on us, not on a cell. Append to the editor wrapper.
          const host =
            (root.closest('.paper-content-wrap') as HTMLElement | null) ||
            (root.parentElement as HTMLElement | null) ||
            document.body;

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'we-table-select-all';
          btn.setAttribute('aria-label', 'Select entire table');
          btn.setAttribute('title', 'Select entire table');
          btn.contentEditable = 'false';
          btn.tabIndex = -1;
          btn.innerHTML =
            '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
            // four-headed move arrow centered in the box
            '<path d="M8 1.5 L8 14.5 M1.5 8 L14.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
            '<path d="M8 1.5 L6 3.5 M8 1.5 L10 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
            '<path d="M8 14.5 L6 12.5 M8 14.5 L10 12.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
            '<path d="M1.5 8 L3.5 6 M1.5 8 L3.5 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
            '<path d="M14.5 8 L12.5 6 M14.5 8 L12.5 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
            '</svg>';
          btn.style.display = 'none';
          host.appendChild(btn);

          let currentTable: HTMLTableElement | null = null;

          const reposition = () => {
            if (!currentTable) return;
            const tRect = currentTable.getBoundingClientRect();
            const hRect = host.getBoundingClientRect();
            // Position the grip handle just outside the top-LEFT corner
            // of the table (Word-style), expressed relative to the host.
            btn.style.top = `${tRect.top - hRect.top - 14}px`;
            btn.style.left = `${tRect.left - hRect.left - 14}px`;
          };

          const show = (tbl: HTMLTableElement) => {
            currentTable = tbl;
            btn.style.display = 'flex';
            reposition();
          };
          const hide = () => {
            currentTable = null;
            btn.style.display = 'none';
          };

          const onMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            // Don't hide while the cursor is over the button itself.
            if (target === btn || btn.contains(target)) return;
            const tbl = target.closest('table') as HTMLTableElement | null;
            if (tbl && root.contains(tbl)) {
              if (tbl !== currentTable) show(tbl);
              else reposition();
            } else {
              hide();
            }
          };

          const onMouseLeave = () => hide();

          const selectWholeTable = (tbl: HTMLTableElement) => {
            try {
              // Find the table node in the doc.
              const tablePos = view.posAtDOM(tbl, 0);
              if (tablePos < 0) return;
              const $start = view.state.doc.resolve(tablePos);
              // Walk up to the table node depth.
              let depth = $start.depth;
              while (depth > 0 && $start.node(depth).type.name !== 'table') depth--;
              if (depth <= 0) return;
              const tableNode = $start.node(depth);
              const tableStart = $start.before(depth) + 1; // inside table
              const map = TableMap.get(tableNode);
              if (!map.map.length) return;
              const firstCellPos = tableStart + map.map[0];
              const lastCellPos = tableStart + map.map[map.map.length - 1];
              const $a = view.state.doc.resolve(firstCellPos);
              const $b = view.state.doc.resolve(lastCellPos);
              const sel = CellSelection.create(view.state.doc, $a.pos, $b.pos);
              const tr = view.state.tr.setSelection(sel).scrollIntoView();
              view.dispatch(tr);
              view.focus();
            } catch {
              /* no-op */
            }
          };

          const onClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentTable) selectWholeTable(currentTable);
          };

          // mousedown happens before the editor steals focus; preventing
          // default keeps the editor selection intact for the click.
          const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
          };

          root.addEventListener('mouseover', onMouseOver);
          root.addEventListener('mouseleave', onMouseLeave);
          btn.addEventListener('mousedown', onMouseDown);
          btn.addEventListener('click', onClick);
          window.addEventListener('scroll', reposition, true);
          window.addEventListener('resize', reposition);

          return {
            update() {
              if (currentTable && document.contains(currentTable)) reposition();
              else hide();
            },
            destroy() {
              root.removeEventListener('mouseover', onMouseOver);
              root.removeEventListener('mouseleave', onMouseLeave);
              btn.removeEventListener('mousedown', onMouseDown);
              btn.removeEventListener('click', onClick);
              window.removeEventListener('scroll', reposition, true);
              window.removeEventListener('resize', reposition);
              btn.remove();
            }
          };
        }
      })
    ];
  }
});
