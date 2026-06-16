// 滚动容器绑定扩展
// 让 TableOfContents 知道编辑器真正的滚动容器是谁。
// 当前滚动容器是 /src/editor/EditorSurface.tsx) 里的 .workspace
import { Extension } from "@tiptap/react";

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
            bindOutlineScrollParent: (element: HTMLElement) => () => {
                setBoundOutlineScrollParent(element);
                return true;
            },
        };
    },
});

