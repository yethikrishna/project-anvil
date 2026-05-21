/**
 * ConversationActions — context menu for active conversation.
 * Export, search, rename, clear actions.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-1"
      >
        ⋮
      </button>

      {showMenu && (
        <div className="absolute right-0 top-6 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => { downloadConversation(conversation, 'md'); setShowMenu(false); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            📥 Export as Markdown
          </button>
          <button
            onClick={() => { downloadConversation(conversation, 'json'); setShowMenu(false); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            📥 Export as JSON
          </button>
          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
          <button
            onClick={() => {
              const title = prompt('Rename conversation:', conversation.title);
              if (title?.trim()) onRename(conversation.id, title.trim());
              setShowMenu(false);
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ✏️ Rename
          </button>
          <button
            onClick={() => { onClear(conversation.id); setShowMenu(false); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            🗑️ Clear messages
          </button>
        </div>
      )}
    </div>
  );
}
