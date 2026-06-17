import { Plugin, PluginKey } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { Extension } from "@tiptap/react";

/**
 * 表格全选按钮扩展。
 *
 * 鼠标悬停在表格上时，在表格左上角显示一个 Word 风格的全选按钮。
 * 点击按钮后创建 CellSelection，从第一个单元格选到最后一个单元格。
 *
 * 按钮是挂在编辑器容器上的共享 overlay，不直接插入 contentEditable 文档内部。
 * 这样不会污染 ProseMirror 文档模型，也不依赖表格 NodeView 的具体实现。
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
          // overlay 必须逃离 .ProseMirror 的 contentEditable 区域，
          // 否则点击可能被编辑器当成单元格点击处理。
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
            // 中心四向箭头，模拟 Word 表格左上角选择控件。
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
            // 位置使用 host 相对坐标，放在表格左上角外侧。
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
            // 鼠标移动到按钮本身时不要隐藏，否则用户无法点击按钮。
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
              // 先从 DOM 位置反查 ProseMirror 文档位置。
              const tablePos = view.posAtDOM(tbl, 0);
              if (tablePos < 0) return;
              const $start = view.state.doc.resolve(tablePos);
              // 向上找到 table 节点所在深度，拿到表格内部起始位置。
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

          // mousedown 发生在 click 前，先阻止默认行为可避免编辑器抢走焦点/改写选择区。
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
