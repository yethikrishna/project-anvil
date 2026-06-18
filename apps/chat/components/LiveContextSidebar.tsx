/**
 * LiveContextSidebar — real-time AI knowledge panel.
 *
 * Shows what the AI currently knows and has retrieved for this conversation:
 * - RAG index stats (how many emails/docs indexed)
 * - Recent retrievals with relevance scores
 * - Quick "index now" to re-ingest fresh content
 * - Semantic search test
 * - Context variables the AI has accumulated
 *
 * This panel is the "AI's brain" visualizer — makes the AI feel transparent,
 * trustworthy, and genuinely powerful.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@anvil/ui';
import type { ConversationContext } from '@/lib/types';

// ── Types ──

interface IndexStats {
  documents: number;
  chunks: number;
  sources: Record<string, number>;
  avgChunkLen: number;
}

interface SearchResult {
  title: string;
  source: string;
  text: string;
  score: number;
  timestamp?: number;
}

interface RetrievalTrace {
  query: string;
  results: SearchResult[];
  answer?: string;
  retrievedAt: number;
}

interface Props {
  context: ConversationContext;
  userId?: string;
  onSendMessage?: (msg: string) => void;
  className?: string;
}

// ── Source config ──

const SOURCE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  gmail:        { icon: '📧', label: 'Gmail',     color: 'text-red-500' },
  drive:        { icon: '📁', label: 'Drive',     color: 'text-blue-500' },
  calendar:     { icon: '📅', label: 'Calendar',  color: 'text-green-500' },
  conversation: { icon: '💬', label: 'Chat',      color: 'text-purple-500' },
  web:          { icon: '🌐', label: 'Web',       color: 'text-gray-500' },
};

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ScoreBar({ score, maxScore = 1 }: { score: number; maxScore?: number }) {
  const pct = Math.round((score / maxScore) * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Retrieval Trace Card ──

function RetrievalCard({ trace, onClose }: { trace: RetrievalTrace; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-indigo-200 dark:border-indigo-800/50 rounded-lg overflow-hidden text-[11px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-2 bg-indigo-50/50 dark:bg-indigo-950/20">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[10px] text-indigo-500 dark:text-indigo-400 mb-0.5">
            <span>🔍</span>
            <span>Semantic retrieval · {formatRelativeTime(trace.retrievedAt)}</span>
          </div>
          <p className="font-medium text-gray-800 dark:text-gray-200 truncate">"{trace.query}"</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 mt-0.5">×</button>
      </div>

      {/* Answer if generated */}
      {trace.answer && (
        <div className="p-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{trace.answer}</p>
        </div>
      )}

      {/* Sources */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {(expanded ? trace.results : trace.results.slice(0, 2)).map((r, i) => {
          const src = SOURCE_CONFIG[r.source] ?? SOURCE_CONFIG.web;
          return (
            <div key={i} className="p-2">
              <div className="flex items-start gap-1.5 mb-1">
                <span>{src.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 dark:text-gray-300 truncate">{r.title}</p>
                  {r.timestamp && (
                    <p className="text-[10px] text-gray-400">{formatRelativeTime(r.timestamp)}</p>
                  )}
                </div>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-1 line-clamp-2">{r.text}</p>
              <ScoreBar score={r.score} maxScore={Math.max(...trace.results.map(x => x.score))} />
            </div>
          );
        })}
      </div>

      {trace.results.length > 2 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full py-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          {expanded ? '▲ Show less' : `▼ +${trace.results.length - 2} more sources`}
        </button>
      )}
    </div>
  );
}

// ── Main Component ──

export default function LiveContextSidebar({ context, userId = 'default', onSendMessage, className }: Props) {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [traces, setTraces] = useState<RetrievalTrace[]>([]);
  const [section, setSection] = useState<'index' | 'search' | 'context'>('index');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load index stats ──
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/rag?action=stats', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as { stats: IndexStats };
        setStats(data.stats);
      }
    } catch { /* ignore */ }
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── Ingest content ──
  const handleIngest = useCallback(async (sources: string[]) => {
    setIngesting(true);
    setIngestResult(null);
    try {
      const res = await fetch('/api/rag?action=ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sources, limit: 25 }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await res.json() as { indexed?: number; chunks?: number; message?: string };
      setIngestResult(data.message ?? `Indexed ${data.indexed ?? 0} docs`);
      await loadStats();
    } catch {
      setIngestResult('Ingest failed — check connection');
    }
    setIngesting(false);
  }, [userId, loadStats]);

  // ── Semantic search ──
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    try {
      const res = await fetch('/api/rag?action=query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 5 }),
        signal: AbortSignal.timeout(20_000),
      });

      if (res.ok) {
        const data = await res.json() as { answer?: string; sources?: SearchResult[]; results?: SearchResult[] };
        const results = data.sources ?? data.results ?? [];
        setTraces(prev => [
          {
            query: q,
            results,
            answer: data.answer,
            retrievedAt: Date.now(),
          },
          ...prev.slice(0, 4),
        ]);
        setSearchQuery('');
      }
    } catch { /* ignore */ }
    setSearching(false);
  }, [searchQuery]);

  // ── Context variables from accumulator ──
  const contextItems = [
    ...(context.recentTopics?.slice(0, 3).map(t => ({ key: 'topic', value: t, icon: '🏷️' })) ?? []),
    ...(context.pendingActions?.slice(0, 2).map(a => ({ key: 'pending', value: a, icon: '⏳' })) ?? []),
    ...(context.mentionedPeople?.slice(0, 2).map(p => ({ key: 'person', value: p, icon: '👤' })) ?? []),
    ...(context.keyDecisions?.slice(0, 2).map(d => ({ key: 'decision', value: d, icon: '✅' })) ?? []),
  ].slice(0, 8);

  return (
    <div className={cn(
      'flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 h-full overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">🧠</span>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">AI Context</h3>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {(['index', 'search', 'context'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSection(tab)}
              className={cn(
                'flex-1 py-1 text-[10px] font-medium rounded-md transition-colors capitalize',
                section === tab
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {tab === 'index' ? '📚 Index' : tab === 'search' ? '🔍 Search' : '🧩 Context'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── INDEX SECTION ── */}
        {section === 'index' && (
          <>
            {/* Stats */}
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3">
              {statsLoading ? (
                <p className="text-[11px] text-gray-400 text-center py-2">Loading…</p>
              ) : stats ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Knowledge Index</span>
                    <button onClick={loadStats} className="text-[10px] text-gray-400 hover:text-gray-600">↻</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{stats.documents}</div>
                      <div className="text-gray-500">docs</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{stats.chunks}</div>
                      <div className="text-gray-500">chunks</div>
                    </div>
                  </div>
                  {Object.keys(stats.sources).length > 0 && (
                    <div className="space-y-1">
                      {Object.entries(stats.sources).map(([src, count]) => {
                        const cfg = SOURCE_CONFIG[src] ?? SOURCE_CONFIG.web;
                        return (
                          <div key={src} className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1">
                              <span>{cfg.icon}</span>
                              <span className="text-gray-600 dark:text-gray-400">{cfg.label}</span>
                            </span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 text-center py-2">No index data</p>
              )}
            </div>

            {/* Ingest Controls */}
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-2">
                Ingest Content
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '📧 Gmail', sources: ['gmail'] },
                  { label: '📁 Drive', sources: ['drive'] },
                  { label: '📅 Calendar', sources: ['calendar'] },
                  { label: '🔄 All', sources: ['gmail', 'drive', 'calendar'] },
                ].map(btn => (
                  <button
                    key={btn.label}
                    disabled={ingesting}
                    onClick={() => handleIngest(btn.sources)}
                    className={cn(
                      'py-1.5 px-2 text-[11px] rounded-lg border transition-colors',
                      ingesting
                        ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700 text-gray-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                    )}
                  >
                    {ingesting ? '…' : btn.label}
                  </button>
                ))}
              </div>
              {ingestResult && (
                <p className="mt-2 text-[10px] text-green-600 dark:text-green-400 text-center">
                  ✓ {ingestResult}
                </p>
              )}
            </div>

            {/* Explanation */}
            {stats && stats.documents === 0 && (
              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 p-3 text-[11px] text-indigo-700 dark:text-indigo-300">
                <p className="font-medium mb-1">Index your content</p>
                <p className="text-indigo-600/80 dark:text-indigo-400/80">
                  Ingest emails and files to enable "What did we discuss about X?" style questions with full semantic understanding.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── SEARCH SECTION ── */}
        {section === 'search' && (
          <>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ask anything about your content…"
                className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none focus:border-indigo-400 dark:focus:border-indigo-600"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] rounded-lg font-medium transition-colors',
                  searching || !searchQuery.trim()
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                )}
              >
                {searching ? '…' : '→'}
              </button>
            </form>

            {/* Quick queries */}
            {traces.length === 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Try asking</p>
                <div className="space-y-1.5">
                  {[
                    'What was decided about the Q3 budget?',
                    'Find emails about the product launch',
                    'What meetings are coming up?',
                    'Summary of recent project updates',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => {
                        setSearchQuery(q);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="w-full text-left text-[11px] text-gray-600 dark:text-gray-400 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Retrieval traces */}
            {traces.length > 0 && (
              <div className="space-y-2">
                {traces.map((trace, i) => (
                  <RetrievalCard
                    key={i}
                    trace={trace}
                    onClose={() => setTraces(prev => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CONTEXT SECTION ── */}
        {section === 'context' && (
          <>
            {contextItems.length > 0 ? (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2">
                  What AI Knows (This Conversation)
                </p>
                <div className="space-y-1.5">
                  {contextItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px]"
                    >
                      <span className="shrink-0 mt-0.5">{item.icon}</span>
                      <span className="text-gray-700 dark:text-gray-300 leading-relaxed">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-[11px] text-gray-400">
                <p>No context extracted yet.</p>
                <p className="mt-1">Start chatting to build context.</p>
              </div>
            )}

            {/* Conversation stats */}
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 space-y-2 text-[11px]">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Conversation Stats</p>
              {[
                ['Intent', context.intent ?? 'Unknown'],
                ['Topics', (context.recentTopics?.length ?? 0).toString()],
                ['Pending actions', (context.pendingActions?.length ?? 0).toString()],
                ['People mentioned', (context.mentionedPeople?.length ?? 0).toString()],
                ['Decisions', (context.keyDecisions?.length ?? 0).toString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{k}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{v}</span>
                </div>
              ))}
            </div>

            {/* Quick action */}
            {onSendMessage && (
              <button
                onClick={() => onSendMessage('Recall everything you know about me and this project')}
                className="w-full py-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-800/50 transition-colors"
              >
                🧠 Show full AI context
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
