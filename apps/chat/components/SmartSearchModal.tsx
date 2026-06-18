/**
 * SmartSearchModal — Command-palette style cross-app search.
 *
 * Activated with ⌘K / Ctrl+K from anywhere. Searches Mail + Drive + Calendar
 * in real time and presents ranked results. Clicking a result injects an
 * action prompt directly into the chat.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SmartSearchResult } from '@/app/api/smart-search/route';

interface SmartSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelectResult: (prompt: string) => void;
}

const SOURCE_ICONS: Record<string, string> = {
  mail: '✉️',
  drive: '📄',
  calendar: '📅',
};

const SOURCE_LABELS: Record<string, string> = {
  mail: 'Mail',
  drive: 'Drive',
  calendar: 'Calendar',
};

type TimeRange = 'all' | 'today' | 'this_week' | 'this_month';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
];

export function SmartSearchModal({ open, onClose, onSelectResult }: SmartSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SmartSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<Set<string>>(new Set(['mail', 'drive', 'calendar']));
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
      setError('');
    }
  }, [open]);

  // Debounced search
  const runSearch = useCallback(async (q: string, srcs: string[], range: TimeRange) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/smart-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q.trim(),
          sources: srcs,
          limit: 6,
          time_range: range === 'all' ? undefined : range,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json() as { results: SmartSearchResult[]; total: number };
      setResults(data.results ?? []);
      setSelectedIdx(0);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('Search failed — check your connection');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query, Array.from(sources), timeRange);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sources, timeRange, runSearch]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIdx]) {
        e.preventDefault();
        handleSelect(results[selectedIdx]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results, selectedIdx, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const selected = container.querySelector(`[data-idx="${selectedIdx}"]`);
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  function toggleSource(src: string) {
    setSources(prev => {
      const next = new Set(prev);
      if (next.has(src) && next.size > 1) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  function handleSelect(result: SmartSearchResult) {
    onSelectResult(result.actionPrompt);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Smart Search"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <span className="text-white/40 text-lg flex-shrink-0">
            {loading ? (
              <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across Mail, Drive & Calendar…"
            className="flex-1 bg-transparent text-white placeholder-white/30 text-base outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-xs text-white/30 border border-white/10 rounded-md">
            ESC
          </kbd>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/8 flex-wrap">
          {/* Source toggles */}
          <div className="flex gap-1.5">
            {Object.entries(SOURCE_ICONS).map(([src, icon]) => (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  sources.has(src)
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-white/5 text-white/30 border border-white/8 hover:bg-white/10'
                }`}
              >
                <span>{icon}</span>
                <span>{SOURCE_LABELS[src]}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* Time range */}
          <div className="flex gap-1">
            {TIME_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTimeRange(opt.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  timeRange === opt.value
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-white/5 text-white/30 border border-white/8 hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="overflow-y-auto flex-1 py-1">
          {error && (
            <div className="px-4 py-3 text-sm text-red-400 flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-white/30">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {!query.trim() && (
            <div className="px-4 py-6 text-center text-sm text-white/25">
              Type to search across Mail, Drive &amp; Calendar
            </div>
          )}

          {results.map((result, idx) => (
            <ResultRow
              key={result.id}
              result={result}
              idx={idx}
              selected={idx === selectedIdx}
              onSelect={handleSelect}
              onHover={() => setSelectedIdx(idx)}
            />
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-white/8 flex items-center justify-between text-xs text-white/25">
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            <span className="flex gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Open in chat</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({
  result,
  idx,
  selected,
  onSelect,
  onHover,
}: {
  result: SmartSearchResult;
  idx: number;
  selected: boolean;
  onSelect: (r: SmartSearchResult) => void;
  onHover: () => void;
}) {
  const icon = SOURCE_ICONS[result.source] ?? '🔍';

  return (
    <div
      data-idx={idx}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors group ${
        selected ? 'bg-white/8' : 'hover:bg-white/5'
      }`}
      onClick={() => onSelect(result)}
      onMouseEnter={onHover}
      role="option"
      aria-selected={selected}
    >
      {/* Source icon */}
      <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-white/90 truncate">{result.title}</span>
          <span className={`text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full ${
            result.source === 'mail' ? 'bg-blue-500/15 text-blue-400' :
            result.source === 'drive' ? 'bg-green-500/15 text-green-400' :
            'bg-purple-500/15 text-purple-400'
          }`}>
            {SOURCE_LABELS[result.source]}
          </span>
        </div>
        <div className="text-xs text-white/40 truncate mt-0.5">{result.subtitle}</div>
        {result.snippet && (
          <div className="text-xs text-white/30 truncate mt-0.5 italic">
            {result.snippet}
          </div>
        )}
      </div>

      {/* Arrow hint */}
      <span className={`text-white/20 flex-shrink-0 mt-1 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}>
        →
      </span>
    </div>
  );
}

export default SmartSearchModal;
