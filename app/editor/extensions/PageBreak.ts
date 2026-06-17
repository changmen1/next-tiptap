import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    pageBreak: {
      // 扩展 Tiptap command 类型，让 editor.chain().insertPageBreak() 有类型提示。
      insertPageBreak: () => ReturnType;
    };
  }
}

/**
 * 硬分页节点。
 *
 * 它是一个 atom block：用户可以像选中图片一样选中/删除它，但不能在内部编辑。
 * 渲染为 div.page-break，打印/PDF 样式可以通过这个 class 强制换页。
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  // block 表示它和段落、标题一样占据块级位置。
  group: 'block',
  selectable: true,
  atom: true,
  parseHTML() {
    // 兼容从旧版本或外部 HTML 导入的 div/hr 两种分页写法。
    return [
      { tag: 'div.page-break' },
      { tag: 'hr.page-break' }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    // contenteditable=false 防止用户把光标放进标签文本里。
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'page-break',
        'data-page-break': 'true',
        contenteditable: 'false'
      }),
      ['span', { class: 'pb-label' }, 'Page Break']
    ];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
          ({ chain }) =>
            // 插入分页符后再补一个空段落，让光标可以继续在分页后输入。
            chain()
              .insertContent({ type: this.name })
              .insertContent({ type: 'paragraph' })
              .run()
    };
  }
});
