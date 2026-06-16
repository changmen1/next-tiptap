"use client"

import { FC, useEffect, useRef } from "react";

interface Props {
    open: boolean;
    onClose: () => void;
    onAction: (action: string) => void;
}

const ITEMS: { id: string; label: string; icon: string; group?: 'top' | 'bottom' }[] = [
    { id: 'new', label: 'New', icon: '📄' },
    { id: 'open', label: 'Open…', icon: '📂' },
    { id: 'import', label: 'Import…', icon: '📥' },
    { id: 'save', label: 'Save', icon: '💾' },
    { id: 'saveAs', label: 'Save As…', icon: '📌' },
    { id: 'exportDocx', label: 'Export .docx', icon: '📘' },
    { id: 'exportHtml', label: 'Export HTML', icon: '🌐' },
    { id: 'exportTxt', label: 'Export TXT', icon: '📃' },
    { id: 'print', label: 'Print / PDF', icon: '🖨' },
    { id: 'delete', label: 'Delete document', icon: '🗑' }
];

const FileMenu: FC<Props> = ({ open, onClose, onAction }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="file-menu" ref={ref} role="menu">
            {ITEMS.map((it) => (
                <button
                    key={it.id}
                    className={`fm-item ${it.id === 'delete' ? 'danger' : ''}`}
                    role="menuitem"
                    onClick={() => {
                        onAction(it.id);
                        onClose();
                    }}
                >
                    <span className="fm-ico">{it.icon}</span>
                    <span>{it.label}</span>
                </button>
            ))}
        </div>
    )
}

export default FileMenu;