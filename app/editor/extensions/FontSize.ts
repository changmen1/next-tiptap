import '@tiptap/extension-text-style';
import { Extension } from '@tiptap/react';

// 字号不是独立节点，而是挂在 textStyle mark 上的属性。
// 先导入 @tiptap/extension-text-style，是为了让 removeEmptyTextStyle 等命令类型可用。
declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

// 字号扩展：为 textStyle mark 增加 fontSize 属性。
// Ribbon 中的字号下拉会调用 setFontSize('12pt')，最终写成 inline style。
export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            // 去掉引号是为了兼容某些粘贴来源生成的 font-size: "12pt"。
            parseHTML: (el) => el.style.fontSize?.replace(/['"]+/g, '') || null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            }
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
          ({ chain }) =>
            chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize:
        () =>
          ({ chain }) =>
            // 清除字号后移除空 textStyle，避免文档里留下没有属性的 span。
            chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    };
  }
});
