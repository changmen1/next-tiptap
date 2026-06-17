"use client"

import { FC, useState } from "react";
import { useEditorStore } from '../store';
import FileMenu from "./FileMenu";

interface Props {
    // 顶栏只接收操作回调；保存、打印、打开文档等业务逻辑都在页面层实现。
    onSave: () => void;
    onPrint: () => void;
    onOpenDocs: () => void;
    outlineOpen: boolean
    onFileAction: (action: string) => void;
    onToggleOutline: () => void;
}

// 应用顶栏：左侧是文件菜单和保存状态，中间是快速操作，右侧是视图/主题按钮。
const TitleBar: FC<Props> = ({ onSave, onPrint, onOpenDocs, onFileAction, outlineOpen, onToggleOutline }) => {
    const { saveStatus, toggleTheme } = useEditorStore();
    const [fileOpen, setFileOpen] = useState(false);

    // saveStatus 来自全局 store，映射为用户可读的状态文案。
    const statusText: Record<typeof saveStatus, string> = {
        saved: 'All changes saved',
        saving: 'Saving…',
        dirty: 'Unsaved changes',
        error: 'Save failed'
    };

    return (
        <header className="titlebar">
            <div className="titlebar-left">
                <div className="file-host">
                    <button className="file-btn" onClick={() => setFileOpen((v) => !v)}>
                        文件
                    </button>
                    <FileMenu open={fileOpen} onClose={() => setFileOpen(false)} onAction={onFileAction} />
                </div>
                <span className={`save-status status-${saveStatus}`}>{statusText[saveStatus]}</span>
            </div>
            <div className="titlebar-center">
                <button className="qa-btn" onClick={onSave} title="Save (Ctrl+S)">💾</button>
                <button className="qa-btn" onClick={onPrint} title="Print / PDF (Ctrl+P)">🖨</button>
            </div>
            <div className="titlebar-right">
                <button
                    className={`icon-btn ${outlineOpen ? 'active' : ''}`}
                    onClick={onToggleOutline}
                    title="Document outline"
                    aria-pressed={outlineOpen}
                >
                    ☰
                </button>
                <button className="icon-btn" onClick={onOpenDocs} title="My Documents">📁</button>
                <button className="icon-btn" onClick={() => { }} title="PDF预览">📄</button>
                <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">🌓</button>
            </div>
        </header>
    )
}

export default TitleBar;
