import { Extension } from "@tiptap/react";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (value: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

// 行高扩展：把 line-height 作为段落/标题节点属性存入 ProseMirror 文档模型。
// 这样导出 HTML 时样式会跟随节点输出，而不是只存在于临时 DOM 上。
export const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    // 默认只作用于 paragraph 和 heading，避免影响表格、图片等非文本块。
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
            // 从导入 HTML 的 style.lineHeight 恢复模型属性。
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight) return {};
              // 写回 HTML inline style，方便导出和粘贴保留行高。
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
            // 对配置的每类节点都执行 updateAttributes，全部成功才返回 true。
            return this.options.types.every((t: string) =>
              commands.updateAttributes(t, { lineHeight: value })
            );
          },
      unsetLineHeight:
        () =>
          ({ commands }) => {
            // resetAttributes 会从当前节点移除 lineHeight，让它回到 CSS 默认值。
            return this.options.types.every((t: string) =>
              commands.resetAttributes(t, 'lineHeight')
            );
          }
    };
  }
});
