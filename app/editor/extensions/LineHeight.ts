import { Extension } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

export const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return {
      types: ['paragraph', 'heading'] as string[],
      defaults: ['1', '1.15', '1.5', '2', '2.5', '3']
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            }
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (value) =>
          ({ commands }) => {
            return this.options.types.every((t: string) =>
              commands.updateAttributes(t, { lineHeight: value })
            );
          },
      unsetLineHeight:
        () =>
          ({ commands }) => {
            return this.options.types.every((t: string) =>
              commands.resetAttributes(t, 'lineHeight')
            );
          }
    };
  }
});
