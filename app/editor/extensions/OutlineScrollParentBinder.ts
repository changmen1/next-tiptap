// 滚动容器绑定扩展。
// TableOfContents 默认倾向于使用 window 作为滚动上下文，但本编辑器真正滚动的是
// EditorSurface.tsx 里的 .workspace。这个模块用一个轻量全局变量保存当前滚动容器。
import { Extension } from "@tiptap/react";

// 同一页面只会有一个编辑器实例，因此这里用模块级变量足够简单。
// 如果未来支持多编辑器并存，需要改为按 editor 实例隔离。
let boundScrollParent: HTMLElement | null = null;

export function getBoundOutlineScrollParent(): HTMLElement | null {
    return boundScrollParent;
}

export function setBoundOutlineScrollParent(el: HTMLElement | null): void {
    boundScrollParent = el;
}

declare module "@tiptap/react" {
    interface Commands<ReturnType> {
        bindOutlineScrollParent: {
            bindOutlineScrollParent: (element: HTMLElement) => ReturnType;
        };
    }
}

export const OutlineScrollParentBinder = Extension.create({
    name: "outlineScrollParentBinder",

    addCommands() {
        return {
            // 命令返回 true 表示事务可执行；这里只做运行时绑定，不修改文档内容。
            bindOutlineScrollParent: (element: HTMLElement) => () => {
                setBoundOutlineScrollParent(element);
                return true;
            },
        };
    },
});

