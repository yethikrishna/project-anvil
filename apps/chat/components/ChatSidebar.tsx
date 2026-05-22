/**
 * ChatSidebar — conversation history with search, grouping, and app context.
 *
 * Features:
 * - Grouped conversations (Today, Yesterday, This Week, Earlier)
 * - Inline search across conversations
 * - Message count and last message preview
 * - App connection status indicators
 * - Rename and delete with confirmation
 */

'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@anvil/ui';
import type { Conversation } from '@/lib/types';
import { relativeTime } from '@/lib/rich-renderer';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed,
  onToggle,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [keyboardIdx, setKeyboardIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter conversations by search
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  // Group conversations by date
  const groups = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const thisWeek = today - 7 * 86400000;

    const g: Record<string, Conversation[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Earlier': [],
    };

    for (const conv of filtered) {
      if (conv.updatedAt >= today) g['Today'].push(conv);
      else if (conv.updatedAt >= yesterday) g['Yesterday'].push(conv);
      else if (conv.updatedAt >= thisWeek) g['This Week'].push(conv);
      else g['Earlier'].push(conv);
    }

    return g;
  }, [filtered]);

  // Flat sorted list for keyboard nav
  const flatList = useMemo(() => [
    ...filtered.slice().sort((a, b) => b.updatedAt - a.updatedAt),
  ], [filtered]);

  // Keyboard navigation within sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardIdx(prev => {
          const cur = prev ?? flatList.findIndex(c => c.id === activeId);
          return Math.max(0, (cur ?? 0) - 1);
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setKeyboardIdx(prev => {
          const cur = prev ?? flatList.findIndex(c => c.id === activeId);
          return Math.min(flatList.length - 1, (cur ?? -1) + 1);
        });
      } else if (e.key === 'Enter' && keyboardIdx !== null) {
        const conv = flatList[keyboardIdx];
        if (conv) onSelect(conv.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flatList, activeId, keyboardIdx, onSelect]);

  useEffect(() => { setKeyboardIdx(null); }, [activeId]);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (deleteConfirmId) {
      deleteTimerRef.current = setTimeout(() => setDeleteConfirmId(null), 3000);
      return () => {
        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      };
    }
  }, [deleteConfirmId]);

  const handleDelete = (id: string) => {
    if (deleteConfirmId === id) {
      onDelete(id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
    }
  };

  // ── Collapsed state ──
  if (collapsed) {
    return (
      <div className="w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-3 gap-2">
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 transition-colors"
          title="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={onNew}
          className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-lg hover:bg-blue-700 transition-colors shadow-sm"
          title="New chat"
        >
          +
        </button>

        {/* Active conversation indicator dots */}
        <div className="flex flex-col gap-1.5 mt-2">
          {conversations.slice(0, 8).map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'w-6 h-6 rounded-md transition-colors',
                activeId === conv.id
                  ? 'bg-blue-200 dark:bg-blue-800'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600',
              )}
              title={conv.title}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Expanded state ──
  const totalConvs = conversations.length;

  return (
    <div className="w-72 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
              A
            </div>
            <h2 className="font-semibold text-sm">Anvil AI</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm hover:bg-blue-700 transition-colors shadow-sm"
              title="New chat"
            >
              +
            </button>
            <button
              onClick={onToggle}
              className="w-7 h-7 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 text-xs transition-colors"
              title="Collapse sidebar"
            >
              ◀
            </button>
          </div>
        </div>

        {/* Search */}
        {totalConvs > 3 && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto chat-scroll">
        {Object.entries(groups).map(([label, convs]) => {
          if (convs.length === 0) return null;
          return (
            <div key={label}>
              <div className="px-3 py-2 text-[10px] font-semibold uppercase text-gray-400 tracking-wider sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                {label}
              </div>
              {convs.map(conv => {
                const lastMsg = conv.messages[conv.messages.length - 1];
                const isActive = activeId === conv.id;
                const isHovered = hoveredId === conv.id;
                const isDeleting = deleteConfirmId === conv.id;
                const kbIdx = flatList.findIndex(c => c.id === conv.id);
                const isKeyboardFocused = keyboardIdx !== null && keyboardIdx === kbIdx;

                return (
                  <div
                    key={conv.id}
                    onMouseEnter={() => setHoveredId(conv.id)}
                    onMouseLeave={() => { setHoveredId(null); if (deleteConfirmId === conv.id) setDeleteConfirmId(null); }}
                    className={cn(
                      'group relative transition-colors',
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50'
                        : isKeyboardFocused
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800/50',
                    )}
                  >
                    <button
                      onClick={() => onSelect(conv.id)}
                      className="w-full text-left px-3 py-2.5 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-sm truncate flex-1',
                          isActive ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-800 dark:text-gray-200',
                        )}>
                          {conv.title}
                        </span>
                        {conv.messages.length > 0 && (
                          <span className="text-[9px] text-gray-400 shrink-0">
                            {conv.messages.length}
                          </span>
                        )}
                      </div>
                      {lastMsg && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                          {lastMsg.role === 'user' ? 'You: ' : ''}
                          {lastMsg.content.slice(0, 60)}
                        </p>
                      )}
                    </button>

                    {/* Hover actions */}
                    {(isHovered || isDeleting) && (
                      <div className="absolute right-2 top-2 flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
                          className={cn(
                            'w-5 h-5 rounded flex items-center justify-center text-[10px] transition-colors',
                            isDeleting
                              ? 'bg-red-500 text-white'
                              : 'text-gray-400 hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-500',
                          )}
                          title={isDeleting ? 'Click again to delete' : 'Delete'}
                        >
                          {isDeleting ? '✓' : '✕'}
                        </button>
                      </div>
                    )}

                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-500 rounded-r" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {filtered.length === 0 && searchQuery && (
          <div className="p-4 text-center text-gray-400 text-sm">
            No conversations match &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {conversations.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">
            <p>No conversations yet.</p>
            <p className="text-xs mt-1">Start one with the + button!</p>
          </div>
        )}
      </div>

      {/* Footer with app status */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Mail
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Drive
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Calendar
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Docs
          </span>
        </div>
        <div className="text-[9px] text-gray-400 mt-1">
          {totalConvs} conversation{totalConvs !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
