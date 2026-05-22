'use client';

/**
 * AI Semantic Find & Replace — Anvil Docs
 *
 * Goes beyond literal text matching. Supports:
 * - Semantic search: "find sentences about project deadlines" 
 * - Pattern search: "find all action items", "find passive voice"
 * - Smart replace: "replace technical jargon with simpler words"
 * - Batch operations: replace all instances with preview
 *
 * Uses local heuristics for common patterns + AI for semantic queries.
 */

import {useState, useCallback, useMemo, useRef, useEffect} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface FindResult {
  id: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  from: number;
  to: number;
  matchType: 'exact' | 'semantic' | 'pattern';
  score?: number;
}

export interface ReplaceOperation {
  findResultId: string;
  originalText: string;
  replacementText: string;
  applied: boolean;
}

type SearchMode = 'exact' | 'regex' | 'semantic' | 'pattern';

interface PatternSearch {
  id: string;
  label: string;
  description: string;
  icon: string;
  detector: (text: string) => boolean;
}

// ── Built-in semantic patterns ──

const SEMANTIC_PATTERNS: PatternSearch[] = [
  {
    id: 'passive-voice',
    label: 'Passive Voice',
    description: 'Sentences using passive construction',
    icon: '🔄',
    detector: (text) => /\b(is|are|was|were|be|been|being)\s+\w+ed\b/i.test(text),
  },
  {
    id: 'action-items',
    label: 'Action Items',
    description: 'Tasks, to-dos, and commitments',
    icon: '✅',
    detector: (text) => /\b(will|should|must|need to|please|action item|todo|to-do)\b/i.test(text),
  },
  {
    id: 'long-sentences',
    label: 'Long Sentences',
    description: 'Sentences with more than 30 words',
    icon: '📏',
    detector: (text) => text.trim().split(/\s+/).length > 30,
  },
  {
    id: 'filler-words',
    label: 'Filler Words',
    description: 'Very, really, basically, actually, just...',
    icon: '✂️',
    detector: (text) => /\b(very|really|quite|basically|actually|literally|honestly|just|simply)\b/i.test(text),
  },
  {
    id: 'hedging',
    label: 'Hedging Language',
    description: 'Uncertain or weak language',
    icon: '🤔',
    detector: (text) => /\b(maybe|perhaps|possibly|might|could|sort of|kind of|somewhat|I think)\b/i.test(text),
  },
  {
    id: 'dates-times',
    label: 'Dates & Times',
    description: 'All date and time references',
    icon: '📅',
    detector: (text) => /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|at \d+:\d+|\d+am|\d+pm)\b/i.test(text),
  },
  {
    id: 'questions',
    label: 'Questions',
    description: 'Sentences ending in ?',
    icon: '❓',
    detector: (text) => text.trim().endsWith('?'),
  },
  {
    id: 'numbers',
    label: 'Numbers & Stats',
    description: 'Numerical data and percentages',
    icon: '🔢',
    detector: (text) => /\b\d+(\.\d+)?%?\b/.test(text),
  },
];

// ── Extract sentences from document ──

function extractSentences(editor: Editor): {text: string; from: number; to: number}[] {
  const doc = editor.state.doc;
  const fullText = editor.getText();
  const sentences: {text: string; from: number; to: number}[] = [];

  // Walk document nodes, map sentence positions
  let charOffset = 0;
  doc.forEach((node) => {
    if (node.isText && node.text) {
      // Split into sentences
      const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
      let match;
      while ((match = sentenceRegex.exec(node.text)) !== null) {
        sentences.push({
          text: match[0].trim(),
          from: charOffset + match.index,
          to: charOffset + match.index + match[0].length,
        });
      }
    }
    charOffset += node.nodeSize;
  });

  // Fallback: split full text into sentences with approximate positions
  if (sentences.length === 0) {
    const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
    let match;
    while ((match = sentenceRegex.exec(fullText)) !== null) {
      sentences.push({
        text: match[0].trim(),
        from: match.index,
        to: match.index + match[0].length,
      });
    }
  }

  return sentences;
}

// ── Local search ──

function searchExact(editor: Editor, query: string, caseSensitive: boolean): FindResult[] {
  const text = editor.getText();
  const results: FindResult[] = [];
  const searchText = caseSensitive ? query : query.toLowerCase();
  const sourceText = caseSensitive ? text : text.toLowerCase();

  let pos = 0;
  while (true) {
    const idx = sourceText.indexOf(searchText, pos);
    if (idx === -1) break;

    const contextStart = Math.max(0, idx - 40);
    const contextEnd = Math.min(text.length, idx + query.length + 40);

    results.push({
      id: `exact-${idx}`,
      text: text.slice(idx, idx + query.length),
      contextBefore: text.slice(contextStart, idx),
      contextAfter: text.slice(idx + query.length, contextEnd),
      from: idx,
      to: idx + query.length,
      matchType: 'exact',
    });
    pos = idx + 1;
  }
  return results;
}

function searchPattern(editor: Editor, patternId: string): FindResult[] {
  const pattern = SEMANTIC_PATTERNS.find(p => p.id === patternId);
  if (!pattern) return [];

  const sentences = extractSentences(editor);
  return sentences
    .filter(s => pattern.detector(s.text))
    .map((s, i) => ({
      id: `pattern-${patternId}-${i}`,
      text: s.text,
      contextBefore: '',
      contextAfter: '',
      from: s.from,
      to: s.to,
      matchType: 'pattern' as const,
    }));
}

async function searchSemantic(editor: Editor, query: string): Promise<FindResult[]> {
  const text = editor.getText();
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'semantic-find',
        payload: {query, sentences: sentences.slice(0, 50)},
      }),
    });
    if (!resp.ok) throw new Error('AI search failed');
    const data = await resp.json() as {matches: Array<{index: number; score: number; reason: string}>};

    return data.matches.map(m => {
      const sentence = sentences[m.index] || '';
      const pos = text.indexOf(sentence);
      return {
        id: `semantic-${m.index}`,
        text: sentence.trim(),
        contextBefore: '',
        contextAfter: '',
        from: Math.max(0, pos),
        to: Math.max(0, pos + sentence.length),
        matchType: 'semantic' as const,
        score: m.score,
      };
    });
  } catch {
    // Fallback: keyword-based matching
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return sentences
      .map((s, i) => {
        const lower = s.toLowerCase();
        const hits = words.filter(w => lower.includes(w)).length;
        if (hits === 0) return null;
        const pos = text.indexOf(s);
        return {
          id: `semantic-fallback-${i}`,
          text: s.trim(),
          contextBefore: '',
          contextAfter: '',
          from: Math.max(0, pos),
          to: Math.max(0, pos + s.length),
          matchType: 'semantic' as const,
          score: hits / words.length,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 15);
  }
}

// ── Component ──

interface AIFindReplaceProps {
  editor: Editor;
  onClose: () => void;
}

export function AIFindReplace({editor, onClose}: AIFindReplaceProps) {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [mode, setMode] = useState<SearchMode>('exact');
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [results, setResults] = useState<FindResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replacePreview, setReplacePreview] = useState<Map<string, string>>(new Map());
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback(async () => {
    if (!query && mode !== 'pattern') return;
    if (mode === 'pattern' && !selectedPatternId) return;

    setIsSearching(true);
    setResults([]);
    setSelectedResults(new Set());

    try {
      let found: FindResult[] = [];
      if (mode === 'exact') found = searchExact(editor, query, caseSensitive);
      else if (mode === 'pattern' && selectedPatternId) found = searchPattern(editor, selectedPatternId);
      else if (mode === 'semantic') found = await searchSemantic(editor, query);
      else if (mode === 'regex') {
        try {
          const re = new RegExp(query, caseSensitive ? 'g' : 'gi');
          const text = editor.getText();
          const matches = [...text.matchAll(re)];
          found = matches.map((m, i) => ({
            id: `regex-${i}`,
            text: m[0],
            contextBefore: text.slice(Math.max(0, (m.index || 0) - 30), m.index),
            contextAfter: text.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 30),
            from: m.index || 0,
            to: (m.index || 0) + m[0].length,
            matchType: 'exact',
          }));
        } catch { found = []; }
      }
      setResults(found);
      // Select all by default
      setSelectedResults(new Set(found.map(r => r.id)));
      if (found.length > 0) setActiveResultId(found[0].id);
    } finally {
      setIsSearching(false);
    }
  }, [editor, query, mode, caseSensitive, selectedPatternId]);

  // Navigate to result in editor
  const navigateTo = useCallback((result: FindResult) => {
    setActiveResultId(result.id);
    // Scroll into view by setting selection
    editor.chain().focus().setTextSelection({from: result.from, to: result.to}).run();
  }, [editor]);

  // Apply replace for selected results
  const applyReplace = useCallback(() => {
    if (!replaceText && mode !== 'semantic') return;
    const toReplace = results.filter(r => selectedResults.has(r.id));

    // Apply in reverse order to preserve positions
    const sorted = [...toReplace].sort((a, b) => b.from - a.from);
    editor.chain().focus().run();

    for (const result of sorted) {
      const replacement = replacePreview.get(result.id) || replaceText;
      editor.commands.command(({tr, state}) => {
        // Verify text still matches at position
        const currentText = state.doc.textBetween(result.from, result.to);
        if (currentText === result.text || mode !== 'exact') {
          tr.replaceWith(
            result.from,
            result.to,
            state.schema.text(replacement),
          );
          return true;
        }
        return false;
      });
    }

    setResults([]);
    setSelectedResults(new Set());
  }, [editor, results, selectedResults, replaceText, replacePreview, mode]);

  // Generate AI replacement preview
  const generateReplacement = useCallback(async (result: FindResult) => {
    if (!replaceText) return;
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'rewrite',
          payload: {text: result.text, mode: replaceText, context: editor.getText().slice(0, 500)},
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json() as {text: string};
      setReplacePreview(prev => new Map(prev).set(result.id, data.text));
    } catch {}
  }, [editor, replaceText]);

  const toggleSelectAll = () => {
    if (selectedResults.size === results.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(results.map(r => r.id)));
    }
  };

  const modeButtons: {id: SearchMode; label: string; icon: string}[] = [
    {id: 'exact', label: 'Exact', icon: 'Aa'},
    {id: 'regex', label: 'Regex', icon: '.*'},
    {id: 'pattern', label: 'Pattern', icon: '🔍'},
    {id: 'semantic', label: 'AI', icon: '✨'},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[600px] max-h-[70vh] flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">Find & Replace</span>
          <span className="ml-1 text-xs text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded-full">AI</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm p-1 rounded hover:bg-gray-100">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Mode selector */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            {modeButtons.map(btn => (
              <button
                key={btn.id}
                onClick={() => setMode(btn.id)}
                className={`flex-1 py-1 rounded-md text-xs font-medium transition-all ${
                  mode === btn.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {btn.icon} {btn.label}
              </button>
            ))}
          </div>

          {/* Pattern selector */}
          {mode === 'pattern' && (
            <div className="grid grid-cols-2 gap-1.5">
              {SEMANTIC_PATTERNS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatternId(p.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs text-left transition-all ${
                    selectedPatternId === p.id
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{p.icon}</span>
                  <div>
                    <div className="font-medium">{p.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{p.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Search input */}
          {mode !== 'pattern' && (
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={
                    mode === 'semantic' ? 'e.g. "sentences about project risks"' :
                    mode === 'regex' ? 'e.g. \\d+%' :
                    'Find text...'
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
                {mode === 'exact' && (
                  <button
                    onClick={() => setCaseSensitive(c => !c)}
                    title="Case sensitive"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs rounded ${caseSensitive ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    Aa
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isSearching ? '...' : 'Find'}
              </button>
            </div>
          )}

          {/* Replace input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder={mode === 'semantic' ? 'Replace mode: shorter, formal, casual, fix-grammar...' : 'Replace with...'}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            {results.length > 0 && (
              <button
                onClick={applyReplace}
                disabled={!replaceText || selectedResults.size === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                Replace {selectedResults.size > 0 ? `(${selectedResults.size})` : 'All'}
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="border-t border-gray-100 flex-1 overflow-hidden flex flex-col">
            {/* Results header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-50">
              <input
                type="checkbox"
                checked={selectedResults.size === results.length}
                onChange={toggleSelectAll}
                className="rounded"
              />
              <span className="text-xs text-gray-500">{results.length} match{results.length !== 1 ? 'es' : ''}</span>
              {mode === 'semantic' && (
                <span className="text-xs text-purple-500">AI semantic search</span>
              )}
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {results.map(result => (
                <div
                  key={result.id}
                  onClick={() => navigateTo(result)}
                  className={`px-4 py-2.5 cursor-pointer flex items-start gap-2.5 hover:bg-gray-50 ${
                    activeResultId === result.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedResults.has(result.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedResults(prev => {
                        const next = new Set(prev);
                        if (next.has(result.id)) next.delete(result.id);
                        else next.add(result.id);
                        return next;
                      });
                    }}
                    className="mt-0.5 rounded flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-600 line-clamp-2">
                      <span className="text-gray-400">{result.contextBefore}</span>
                      <span className="bg-yellow-100 text-yellow-800 rounded px-0.5">{result.text}</span>
                      <span className="text-gray-400">{result.contextAfter}</span>
                    </div>
                    {replacePreview.has(result.id) && (
                      <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <span>→</span>
                        <span className="truncate">{replacePreview.get(result.id)}</span>
                      </div>
                    )}
                    {result.score !== undefined && (
                      <div className="text-[10px] text-purple-400 mt-0.5">
                        {Math.round(result.score * 100)}% relevance
                      </div>
                    )}
                  </div>
                  {mode === 'semantic' && replaceText && (
                    <button
                      onClick={(e) => { e.stopPropagation(); generateReplacement(result); }}
                      className="text-[10px] text-purple-600 hover:text-purple-800 flex-shrink-0 px-1.5 py-0.5 bg-purple-50 rounded"
                    >
                      Preview
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && !isSearching && query && (
          <div className="px-4 pb-4 text-xs text-gray-400 text-center">No matches found</div>
        )}
      </div>
    </div>
  );
}
