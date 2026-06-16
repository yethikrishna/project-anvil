/**
 * MemorySearchModal — search across all past conversations.
 *
 * Lets users find what was discussed, what decisions were made,
 * and what context from past sessions is relevant right now.
 *
 * Triggered by Cmd+Shift+M or from the sidebar.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@anvil/ui';
import { searchMemory, type MemorySearchResult } from '@/lib/memory-search';

interface Props {
  onClose: () => void;
  onLoadConversation?: (conversationId: string) => void;
  onInsertContext?: (text: string) => void;
}

export default function MemorySearchModal({ onClose, onLoadConversation, onInsertContext }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await searchMemory(q, 8);
      setResults(res);
      setSearched(true);
    } catch (err) {
      console.error('Memory search error:', err);
      setResults([]);
      setSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 350);
  }, [runSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && query.trim()) runSearch(query);
  }, [query, onClose, runSearch]);

  const handleInsert = useCallback((result: MemorySearchResult) => {
    const contextText = [
      `From conversation "${result.conversationTitle}" (${result.ago}):`,
      ...result.matchedMessages.slice(0, 2).map(m =>
        `${m.role === 'user' ? 'User' : 'AI'}: ${m.snippet}`
      ),
    ].join('\n');
    onInsertContext?.(contextText);
    onClose();
  }, [onInsertContext, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <div className="text-gray-400 text-lg">🧠</div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search your memory… (decisions, people, topics)"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
          />
          {isSearching && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            esc
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!searched && !query && (
            <div className="px-4 py-8 text-center">
              <div className="text-3xl mb-3">🧠</div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search your conversation memory
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <p>Find past decisions, discussions, and context</p>
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {['project deadline', 'email draft', 'meeting notes', 'budget discussion', 'team review'].map(eg => (
                    <button
                      key={eg}
                      onClick={() => { setQuery(eg); runSearch(eg); }}
                      className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {eg}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {searched && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              <div className="text-2xl mb-2">🔍</div>
              No matching conversations found for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {results.map((result) => (
                <div
                  key={result.conversationId}
                  className="px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {result.conversationTitle}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{result.ago}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onInsertContext && (
                        <button
                          onClick={() => handleInsert(result)}
                          className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                          title="Insert context into current chat"
                        >
                          Insert →
                        </button>
                      )}
                      {onLoadConversation && (
                        <button
                          onClick={() => { onLoadConversation(result.conversationId); onClose(); }}
                          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          title="Open this conversation"
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Matched message snippets */}
                  <div className="space-y-1.5">
                    {result.matchedMessages.slice(0, 2).map((msg, j) => (
                      <div key={j} className="flex gap-2 text-xs">
                        <span className={cn(
                          'shrink-0 font-medium',
                          msg.role === 'user'
                            ? 'text-blue-500'
                            : 'text-purple-500',
                        )}>
                          {msg.role === 'user' ? 'You' : 'AI'}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400 leading-relaxed">
                          {msg.snippet}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-[10px] text-gray-400">
            Searching across all saved conversations
          </div>
          <div className="text-[10px] text-gray-400">
            Enter to search · Esc to close
          </div>
        </div>
      </div>
    </div>
  );
}
