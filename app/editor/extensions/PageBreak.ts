import { Node, mergeAttributes } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

/**
 * A hard page break node. Rendered as a div with class "page-break"
 * and an HTML print-friendly CSS rule that forces a page break in print/PDF.
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  selectable: true,
  atom: true,
  parseHTML() {
    return [
      { tag: 'div.page-break' },
      { tag: 'hr.page-break' }
    ];
  },
  renderHTML({ HTMLAttributes }) {
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
            chain()
              .insertContent({ type: this.name })
              .insertContent({ type: 'paragraph' })
              .run()
    };
  }
});
