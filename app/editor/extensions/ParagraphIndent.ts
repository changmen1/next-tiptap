
import { Extension } from "@tiptap/react";

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    paragraphIndent: {
      setFirstLineIndent: (value: string) => ReturnType;
      unsetFirstLineIndent: () => ReturnType;
    };
  }
}

export const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',

  addOptions() {
    return {
      types: ['paragraph'] as string[]
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          firstLineIndent: {
            default: null,
            parseHTML: (el) => el.style.textIndent || null,
            renderHTML: (attrs) => {
              if (!attrs.firstLineIndent) return {};
              return { style: `text-indent: ${attrs.firstLineIndent}` };
            }
          }
        }
      }
    ];
  },

  addCommands() {
    return {
      setFirstLineIndent:
        (value) =>
          ({ commands }) => {
            return this.options.types.every((t: string) =>
              commands.updateAttributes(t, { firstLineIndent: value })
            );
          },
      unsetFirstLineIndent:
        () =>
          ({ commands }) => {
            return this.options.types.every((t: string) =>
              commands.resetAttributes(t, 'firstLineIndent')
            );
          }
    };
  }
});
