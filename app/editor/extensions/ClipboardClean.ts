// import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';

/**
* ClipboardClean
* --------------
* 对从 Microsoft Word、Excel 或 Google Docs 粘贴的 HTML 内容进行标准化处理：
* 在保留格式（如颜色、边框、字体、单元格背景、对齐方式）的同时，
* 剔除 ProseMirror 无法使用的 Office 特有冗余代码。 
* 对于 Excel，其样式通常通过 `<style>` 块配合类名（class names）来定义；
* 本工具会将这些样式规则直接内联（inline）应用到对应的元素上，
* 从而确保样式在经过 Schema 转换流程（即“往返”处理）后依然有效
* （因为 Tiptap 不会保留 `<style>` 块）。
 */

function isWordHTML(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes('mso-') ||
    h.includes('class="msonormal') ||
    h.includes('xmlns:w=') ||
    h.includes('urn:schemas-microsoft-com:office:word')
  );
}

function isExcelHTML(html: string): boolean {
  const h = html.toLowerCase();
  return (
    h.includes('xmlns:x=') ||
    h.includes('urn:schemas-microsoft-com:office:excel') ||
    /class="xl\d+/i.test(h)
  );
}

function isOfficeHTML(html: string): boolean {
  return isWordHTML(html) || isExcelHTML(html) || /<!--\s*StartFragment\s*-->/i.test(html);
}

function inlineStyleBlocks(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll('style'));
  for (const block of blocks) {
    const css = block.textContent || '';
    const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css))) {
      const selectorList = m[1].trim();
      const decls = m[2].trim();
      if (!selectorList || !decls) continue;
      if (selectorList.startsWith('@')) continue;
      const selectors = selectorList.split(',').map((s) => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        if (/::|:hover|:focus|:active/.test(sel)) continue;
        let matches: NodeListOf<Element>;
        try {
          matches = root.querySelectorAll(sel);
        } catch {
          continue;
        }
        matches.forEach((el) => {
          const prior = (el as HTMLElement).getAttribute('style') || '';
          const merged = prior ? `${prior}; ${decls}` : decls;
          (el as HTMLElement).setAttribute('style', merged);
        });
      }
    }
    block.parentNode?.removeChild(block);
  }
}

function cleanStyleString(style: string): string {
  return style
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((prop) => {
      const key = prop.split(':')[0].trim().toLowerCase();
      if (key.startsWith('mso-')) return false;
      if (key.startsWith('page-break-')) return false;
      if (key === 'break-before' || key === 'break-after' || key === 'break-inside') return false;
      return true;
    })
    .join('; ');
}

/** Strip absolute widths and nowrap rules from a single style string so a
 *  pasted table/cell respects the editor's page width instead of forcing
 *  horizontal overflow. */
function stripWidthAndNowrap(style: string): string {
  return style
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((prop) => {
      const key = prop.split(':')[0].trim().toLowerCase();
      if (key === 'width' || key === 'min-width' || key === 'max-width') return false;
      if (key === 'white-space') return false;
      return true;
    })
    .join('; ');
}

/** Word/Excel paste often supplies absolute widths via:
 *    - <table width="..."> / inline `width:` style
 *    - <colgroup><col width="..."> / span+width
 *    - cell <td width="..."> / inline width style / nowrap
 *  Any of these can push the table past the page edge. Drop them all so
 *  the table flows to the available page width with proportional columns. */
function fitTablesToPage(root: HTMLElement) {
  const tables = root.querySelectorAll<HTMLTableElement>('table');
  tables.forEach((tbl) => {
    tbl.removeAttribute('width');
    if (tbl.hasAttribute('style')) {
      const next = stripWidthAndNowrap(tbl.getAttribute('style') || '');
      if (next) tbl.setAttribute('style', next);
      else tbl.removeAttribute('style');
    }

    // Drop <colgroup>: ProseMirror manages column widths via TableMap, and a
    // pasted colgroup with absolute pixel widths is the #1 cause of pasted
    // tables blowing past the page edge.
    tbl.querySelectorAll('colgroup, col').forEach((c) => c.parentNode?.removeChild(c));

    tbl.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
      cell.removeAttribute('width');
      cell.removeAttribute('nowrap');
      if (cell.hasAttribute('style')) {
        const next = stripWidthAndNowrap(cell.getAttribute('style') || '');
        if (next) cell.setAttribute('style', next);
        else cell.removeAttribute('style');
      }
    });
  });
}

function cleanOfficeHTML(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  inlineStyleBlocks(temp);
  fitTablesToPage(temp);

  const all = temp.querySelectorAll<HTMLElement>('*');
  all.forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name;
      if (
        name.startsWith('w:') ||
        name.startsWith('o:') ||
        name.startsWith('v:') ||
        name.startsWith('x:') ||
        name.startsWith('xmlns:') ||
        name === 'lang' ||
        name === 'xml:lang'
      ) {
        el.removeAttribute(name);
      }
    });

    if (el.hasAttribute('style')) {
      const cleaned = cleanStyleString(el.getAttribute('style') || '');
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
    }

    if (el.hasAttribute('class')) {
      const kept = (el.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !/^Mso/i.test(c));
      if (kept.length) el.setAttribute('class', kept.join(' '));
      else el.removeAttribute('class');
    }

    const tag = el.tagName;
    if (
      tag === 'O:P' ||
      tag === 'W:PICT' ||
      tag === 'V:SHAPE' ||
      tag === 'V:VML' ||
      tag === 'X:NAME'
    ) {
      while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
      el.parentNode?.removeChild(el);
    }
  });

  return temp.innerHTML;
}

export const ClipboardClean = Extension.create({
  name: 'clipboardClean',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedHTML: (html: string) => {
            if (isOfficeHTML(html)) return cleanOfficeHTML(html);
            // Non-office paste: still strip absolute table widths so wide
            // pasted tables fit the page width.
            if (!/<table/i.test(html)) return html;
            const temp = document.createElement('div');
            temp.innerHTML = html;
            fitTablesToPage(temp);
            return temp.innerHTML;
          }
        }
      })
    ];
  }
});
