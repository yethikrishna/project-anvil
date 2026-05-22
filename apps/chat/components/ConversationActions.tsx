/**
 * ConversationActions — context menu for active conversation.
 * Rename, export, clear, share, and search within conversation.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import type { Conversation } from '@/lib/types';
import { downloadConversation } from '@/lib/export';

interface Props {
  conversation: Conversation;
  onRename: (id: string, title: string) => void;
  onClear: (id: string) => void;
  onClose: () => void;
}

export default function ConversationActions({ conversation, onRename, onClear, onClose }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(conversation.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setIsRenaming(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus rename input
  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    if (renameTitle.trim() && renameTitle !== conversation.title) {
      onRename(conversation.id, renameTitle.trim());
    }
    setIsRenaming(false);
    setShowMenu(false);
  };

  const handleExportMarkdown = () => {
    downloadConversation(conversation, 'md');
    setShowMenu(false);
  };

  const handleExportJSON = () => {
    downloadConversation(conversation, 'json');
    setShowMenu(false);
  };

  const handleClear = () => {
    if (confirm('Clear all messages in this conversation? This cannot be undone.')) {
      onClear(conversation.id);
    }
    setShowMenu(false);
  };

  const msgCount = conversation.messages.length;
  const userMsgs = conversation.messages.filter(m => m.role === 'user').length;
  const toolCalls = conversation.messages.reduce(
    (acc, m) => acc + (m.toolCalls?.length ?? 0), 0
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Conversation actions"
      >
        ⋮
      </button>

      {showMenu && (
        <div className="absolute right-0 top-6 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          {/* Stats */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] text-gray-400">
              {msgCount} message{msgCount !== 1 ? 's' : ''} · {userMsgs} from you · {toolCalls} tool calls
            </p>
          </div>

          {/* Actions */}
          <button
            onClick={() => { setIsRenaming(true); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <span className="text-gray-400">✏️</span> Rename
          </button>
          <button
            onClick={handleExportMarkdown}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <span className="text-gray-400">📥</span> Export as Markdown
          </button>
          <button
            onClick={handleExportJSON}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <span className="text-gray-400">📥</span> Export as JSON
          </button>

          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

          <button
            onClick={handleClear}
            className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 flex items-center gap-2 transition-colors"
          >
            <span>🗑️</span> Clear messages
          </button>
        </div>
      )}

      {/* Rename modal */}
      {isRenaming && (
        <div className="absolute right-0 top-6 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3">
          <p className="text-xs font-medium mb-2">Rename conversation</p>
          <input
            ref={renameRef}
            type="text"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setIsRenaming(false); setShowMenu(false); }
            }}
            className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => { setIsRenaming(false); setShowMenu(false); }}
              className="text-[10px] px-2 py-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleRenameSubmit}
              className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
