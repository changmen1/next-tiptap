"use client"

import { FC, useState } from "react";
import { useEditorStore } from '../store';
import FileMenu from "./FileMenu";

interface Props {
    onSave: () => void;
    onPrint: () => void;
    onOpenDocs: () => void;
    outlineOpen: boolean
    onFileAction: (action: string) => void;
    onToggleOutline: () => void;
}

const TitleBar: FC<Props> = ({ onSave, onPrint, onOpenDocs, onFileAction, outlineOpen, onToggleOutline }) => {
    const { saveStatus, toggleTheme } = useEditorStore();
    const [fileOpen, setFileOpen] = useState(false);

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