// 这个扩展只处理粘贴进入编辑器的 HTML，不改变用户手动输入的内容。
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
  // Word 粘贴通常带有 mso-* 样式、MsoNormal class 或 Office 命名空间。
  const h = html.toLowerCase();
  return (
    h.includes('mso-') ||
    h.includes('class="msonormal') ||
    h.includes('xmlns:w=') ||
    h.includes('urn:schemas-microsoft-com:office:word')
  );
}

function isExcelHTML(html: string): boolean {
  // Excel 粘贴常见特征是 xmlns:x、office:excel 命名空间或 xl123 这类 class。
  const h = html.toLowerCase();
  return (
    h.includes('xmlns:x=') ||
    h.includes('urn:schemas-microsoft-com:office:excel') ||
    /class="xl\d+/i.test(h)
  );
}

function isOfficeHTML(html: string): boolean {
  // StartFragment 注释是 Office/Google Docs 粘贴片段常见标记。
  return isWordHTML(html) || isExcelHTML(html) || /<!--\s*StartFragment\s*-->/i.test(html);
}

function inlineStyleBlocks(root: HTMLElement) {
  // Excel 经常把单元格样式放在 <style> 里，再通过 class 引用。
  // Tiptap/ProseMirror 不会保留 <style> 节点，所以先把能匹配到的规则内联到元素 style。
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
        // 伪类/伪元素无法可靠内联到元素上，直接跳过。
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
  // 删除 Office 私有样式和分页相关样式，避免污染编辑器布局。
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

/** 从单个 style 字符串中剔除绝对宽度和 nowrap，让粘贴表格跟随编辑器页面宽度自适应。 */
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

/**
 * Word/Excel 粘贴表格常通过多种方式写死宽度：
 * - <table width="..."> 或 table style="width: ..."
 * - <colgroup><col width="...">
 * - <td width="...">、单元格 style width、nowrap
 *
 * 这些都会让表格超出论文页面宽度，所以统一移除，让表格按可用宽度重新流式布局。
 */
function fitTablesToPage(root: HTMLElement) {
  const tables = root.querySelectorAll<HTMLTableElement>('table');
  tables.forEach((tbl) => {
    tbl.removeAttribute('width');
    if (tbl.hasAttribute('style')) {
      const next = stripWidthAndNowrap(tbl.getAttribute('style') || '');
      if (next) tbl.setAttribute('style', next);
      else tbl.removeAttribute('style');
    }

    // 删除 <colgroup>/<col>：ProseMirror 表格通过 TableMap 管列结构，
    // 粘贴来的绝对像素列宽是表格超出页面的主要来源。
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
  // 用临时容器解析 HTML，方便使用 DOM API 删除/重写属性。
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
        // 删除 Office XML 命名空间和语言属性，它们对编辑器无用，还可能导致导出冗余。
        el.removeAttribute(name);
      }
    });

    if (el.hasAttribute('style')) {
      const cleaned = cleanStyleString(el.getAttribute('style') || '');
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
    }

    if (el.hasAttribute('class')) {
      // Mso* class 只对 Word 内部样式有意义，保留会污染编辑器 CSS 匹配。
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
      // Office 专有标签本身不保留，但把其子节点提升出来，避免误删有用文本。
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
            // 非 Office 来源只要包含表格，也移除绝对宽度，避免网页表格撑破页面。
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
