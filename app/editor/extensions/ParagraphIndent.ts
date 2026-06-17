
import { Extension } from "@tiptap/react";

// 首行缩进扩展。论文/中文文档常用 2 字符首行缩进，
// 这里将 text-indent 作为 paragraph 节点属性保存，便于导入导出。
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
      // 只作用于普通段落；标题首行缩进通常不符合排版预期。
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
            // 从 HTML style 读取 text-indent，例如 2em、24pt。
            parseHTML: (el) => el.style.textIndent || null,
            renderHTML: (attrs) => {
              if (!attrs.firstLineIndent) return {};
              // 写回 inline style，保证导出的 HTML 和重新导入时都能保留。
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
