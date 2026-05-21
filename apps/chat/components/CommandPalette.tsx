/**
 * CommandPalette — Ctrl+K command palette for power users.
 *
 * Combines:
 * - Conversation search
 * - Quick commands (attention, weekly summary, draft reply, etc.)
 * - Navigation (settings, new chat, export)
 *
 * Fuzzy-searchable with keyboard navigation.
 */

'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { Conversation } from '@/lib/types';
import { QUICK_COMMANDS } from '@/lib/quick-commands';

interface Props {
  conversations: Conversation[];
  onCommand: (prompt: string) => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  type: 'command' | 'conversation' | 'action';
  label: string;
  description: string;
  icon: string;
  action: () => void;
}

export default function CommandPalette({
  conversations,
  onCommand,
  onSelectConversation,
  onNewChat,
  onOpenSettings,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build all items
  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // Actions
    items.push({
      id: 'new-chat',
      type: 'action',
      label: 'New conversation',
      description: 'Start a fresh chat',
      icon: '➕',
      action: onNewChat,
    });
    items.push({
      id: 'settings',
      type: 'action',
      label: 'Chat settings',
      description: 'Configure AI behavior, voice, privacy',
      icon: '⚙️',
      action: onOpenSettings,
    });

    // Quick commands
    for (const cmd of QUICK_COMMANDS) {
      items.push({
        id: `cmd-${cmd.id}`,
        type: 'command',
        label: cmd.label,
        description: cmd.description,
        icon: cmd.icon,
        action: () => onCommand(cmd.prompt),
      });
    }

    // Recent conversations
    for (const conv of conversations.slice(0, 10)) {
      items.push({
        id: `conv-${conv.id}`,
        type: 'conversation',
        label: conv.title,
        description: `${conv.messages.length} messages · ${new Date(conv.updatedAt).toLocaleDateString()}`,
        icon: '💬',
        action: () => onSelectConversation(conv.id),
      });
    }

    return items;
  }, [conversations, onCommand, onSelectConversation, onNewChat, onOpenSettings]);

  // Filter items by query
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 15);

    const q = query.toLowerCase();
    return allItems
      .filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [allItems, query]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            filtered[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selectedIndex, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-400">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, conversations..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Grouped results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">No results</div>
          )}

          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => { item.action(); onClose(); }}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-950'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="text-base w-6 text-center">{item.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{item.label}</div>
                <div className="text-[10px] text-gray-400 truncate">{item.description}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                item.type === 'command'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-500'
                  : item.type === 'conversation'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    : 'bg-amber-50 dark:bg-amber-950 text-amber-500'
              }`}>
                {item.type}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex justify-between text-[10px] text-gray-400">
          <span>↑↓ navigate · ↵ select · ESC close</span>
          <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
