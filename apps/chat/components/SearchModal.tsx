/**
 * SearchModal — search across all conversation history.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
import type { Conversation } from '@/lib/types';
import { searchConversations, type SearchResult } from '@/lib/search';

interface Props {
  conversations: Conversation[];
  onSelect: (conversationId: string) => void;
  onClose: () => void;
}

export default function SearchModal({ conversations, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setResults(searchConversations(conversations, query));
  }, [query, conversations]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.conversationId}-${result.messageId}`}
              onClick={() => { onSelect(result.conversationId); onClose(); }}
              className={cn(
                'w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0',
                'transition-colors',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-gray-400">
                  {result.role === 'user' ? '👤' : '🤖'}
                </span>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">
                  {result.conversationTitle}
                </span>
                <span className="text-[10px] text-gray-400 ml-auto">
                  {new Date(result.timestamp).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {result.snippet}
              </p>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="text-[10px] text-gray-400">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-1 text-[10px] text-gray-400">
            <kbd className="border border-gray-200 dark:border-gray-700 rounded px-1">↑↓</kbd>
            <span>navigate</span>
            <kbd className="border border-gray-200 dark:border-gray-700 rounded px-1 ml-2">↵</kbd>
            <span>open</span>
          </div>
        </div>
      </div>
    </div>
  );
}
