'use client';

/**
 * Drive — Context menu component
 * Right-click actions: rename, delete, share, download
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  fileId: string;
  fileName: string;
  isDirectory: boolean;
  onClose: () => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
  onDownload?: (id: string) => void;
}

interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  fileId,
  fileName,
  isDirectory,
  onClose,
  onRename,
  onDelete,
  onShare,
  onDownload,
}: ContextMenuProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(fileName);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleRenameSubmit = () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== fileName) {
      onRename(fileId, trimmed);
    }
    setIsRenaming(false);
    onClose();
  };

  const items: MenuItem[] = [
    {
      label: 'Rename',
      icon: '✏️',
      action: () => setIsRenaming(true),
    },
    ...(!isDirectory && onDownload ? [{
      label: 'Download',
      icon: '⬇️',
      action: () => { onDownload(fileId); onClose(); },
    }] : []),
    {
      label: 'Share',
      icon: '🔗',
      action: () => { onShare(fileId); onClose(); },
    },
    {
      label: 'Delete',
      icon: '🗑️',
      action: () => { onDelete(fileId); onClose(); },
      danger: true,
    },
  ];

  // Adjust position to keep menu in viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 1000,
  };

  return (
    <div ref={menuRef} style={menuStyle} className="bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[180px] overflow-hidden">
      {isRenaming ? (
        <div className="p-2">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setIsRenaming(false); onClose(); }
            }}
            onBlur={handleRenameSubmit}
            className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ) : (
        <>
          {/* File name header */}
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 truncate">{fileName}</p>
          </div>

          {/* Menu items */}
          {items.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                transition-colors
                ${item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              <span className="w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Hook to manage context menu state
 */
export function useContextMenu() {
  const [state, setState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    fileId: string;
    fileName: string;
    isDirectory: boolean;
  } | null>(null);

  const show = useCallback(
    (e: React.MouseEvent, fileId: string, fileName: string, isDirectory: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      setState({ visible: true, x: e.clientX, y: e.clientY, fileId, fileName, isDirectory });
    },
    []
  );

  const hide = useCallback(() => setState(null), []);

  return { contextMenu: state, showContextMenu: show, hideContextMenu: hide };
}
