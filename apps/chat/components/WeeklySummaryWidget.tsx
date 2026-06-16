/**
 * WeeklySummaryWidget — renders the rich weekly digest with full data.
 *
 * Shows:
 * - Headline + week range
 * - Email metrics + hot threads
 * - Calendar next-week highlights
 * - Prioritized action items
 * - Insights + next week prep
 * - Export as Markdown
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

// New rich data shape from /api/weekly-summary
interface HotThread {
  subject: string;
  from: string;
  status: 'needs-reply' | 'in-progress' | 'resolved' | 'waiting';
  urgency: 'high' | 'medium' | 'low';
  summary: string;
}

interface CalendarHighlight {
  title: string;
  time: string;
  type: 'meeting' | 'deadline' | 'event';
  attendees: number;
}

interface ActionItem {
  item: string;
  priority: 'urgent' | 'high' | 'normal';
  source: 'email' | 'calendar' | 'doc';
  due: 'today' | 'this-week' | 'next-week' | 'ongoing';
}

interface RichSummary {
  weekRange: string;
  generatedAt: string;
  headline: string;
  email: {
    totalReceived: number;
    totalSent: number;
    unread: number;
    urgentUnread: number;
    topSenders: Array<{ name: string; count: number }>;
    hotThreads: HotThread[];
  };
  calendar: {
    meetingsLastWeek: number;
    meetingHoursLastWeek: number;
    meetingsNextWeek: number;
    upcomingHighlights: CalendarHighlight[];
  };
  documents: {
    recentlyAccessed: Array<{ title: string; type: string; relevance: string }>;
  };
  actionItems: ActionItem[];
  insights: string[];
  nextWeekPrep: string[];
  // Legacy fields (backwards compat)
  emailsProcessed?: number;
  meetingsAttended?: number;
  docsCreated?: number;
  filesShared?: number;
  topTopics?: string[];
  highlights?: string[];
  productivity?: { emailsPerDay?: number; meetingsPerDay?: number; avgResponseTimeHours?: number };
}

const URGENCY_COLOR: Record<string, string> = {
  high: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  medium: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  low: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const PRIORITY_ICON: Record<string, string> = {
  urgent: '🔴',
  high: '🟡',
  normal: '⚪',
};

const STATUS_LABEL: Record<string, string> = {
  'needs-reply': '↩ Reply',
  'in-progress': '⏳ In progress',
  'resolved': '✅ Done',
  'waiting': '⏸ Waiting',
};

interface Props {
  onClose: () => void;
}

export default function WeeklySummaryWidget({ onClose }: Props) {
  const [summary, setSummary] = useState<RichSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'email' | 'calendar' | 'actions'>('overview');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/weekly-summary');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const toggleItem = (idx: number) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleExportMd = async () => {
    if (!summary) return;
    try {
      const res = await fetch('/api/weekly-summary?format=md');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weekly-summary-${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: build locally
      const blob = new Blob([buildLocalMarkdown(summary)], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weekly-summary-${new Date().toISOString().split('T')[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const tabClass = (tab: typeof activeTab) =>
    cn(
      'text-xs px-3 py-1.5 rounded-lg transition-colors font-medium',
      activeTab === tab
        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                📊 Weekly Summary
              </h2>
              {summary?.weekRange && (
                <p className="text-xs text-gray-500 mt-0.5">{summary.weekRange}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {summary && (
                <button
                  onClick={handleExportMd}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  📥 Export
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">✕</button>
            </div>
          </div>

          {/* Tabs */}
          {summary && (
            <div className="flex gap-1.5">
              <button className={tabClass('overview')} onClick={() => setActiveTab('overview')}>Overview</button>
              <button className={tabClass('email')} onClick={() => setActiveTab('email')}>
                Email
                {(summary.email?.urgentUnread ?? 0) > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {summary.email.urgentUnread}
                  </span>
                )}
              </button>
              <button className={tabClass('calendar')} onClick={() => setActiveTab('calendar')}>Calendar</button>
              <button className={tabClass('actions')} onClick={() => setActiveTab('actions')}>
                Actions
                {summary.actionItems?.filter(a => a.priority === 'urgent').length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 inline-flex items-center justify-center">
                    {summary.actionItems.filter(a => a.priority === 'urgent').length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-16">
              <div className="flex justify-center gap-1 mb-4">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-400">Analyzing your week across Mail, Calendar, and Drive...</p>
              <p className="text-xs text-gray-300 mt-1">This takes about 10 seconds</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-2xl mb-3">⚠️</p>
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button onClick={fetchSummary} className="text-xs text-blue-500 hover:underline">Try again</button>
            </div>
          ) : summary ? (
            <>
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  {/* Headline */}
                  {summary.headline && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-900">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100 leading-relaxed">
                        {summary.headline}
                      </p>
                    </div>
                  )}

                  {/* Stats grid */}
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Emails" value={summary.email?.totalReceived ?? summary.emailsProcessed ?? 0} icon="✉️" />
                    <StatCard label="Unread" value={summary.email?.unread ?? 0} icon="📬" urgent={(summary.email?.urgentUnread ?? 0) > 0} />
                    <StatCard label="Meetings" value={summary.calendar?.meetingsLastWeek ?? summary.meetingsAttended ?? 0} icon="📅" />
                    <StatCard label="Next week" value={summary.calendar?.meetingsNextWeek ?? 0} icon="🗓️" />
                  </div>

                  {/* Insights */}
                  {summary.insights?.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Insights</h3>
                      <div className="space-y-2">
                        {summary.insights.map((insight, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span className="mt-0.5 shrink-0">💡</span>
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next week prep */}
                  {summary.nextWeekPrep?.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Next Week Prep</h3>
                      <div className="space-y-1.5">
                        {summary.nextWeekPrep.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span className="mt-0.5 shrink-0">📌</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Legacy fallback: top topics */}
                  {!summary.insights && summary.topTopics && summary.topTopics.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Top Topics</h3>
                      <div className="flex flex-wrap gap-2">
                        {summary.topTopics.map((t, i) => (
                          <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* EMAIL TAB */}
              {activeTab === 'email' && (
                <div className="space-y-4">
                  {/* Email stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Received" value={summary.email?.totalReceived ?? 0} icon="📥" />
                    <StatCard label="Sent" value={summary.email?.totalSent ?? 0} icon="📤" />
                    <StatCard label="Unread" value={summary.email?.unread ?? 0} icon="📬" urgent={(summary.email?.urgentUnread ?? 0) > 0} />
                  </div>

                  {/* Top senders */}
                  {summary.email?.topSenders && summary.email.topSenders.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Top Senders</h3>
                      <div className="space-y-1">
                        {summary.email.topSenders.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 dark:text-gray-300">{s.name}</span>
                            <span className="text-xs text-gray-400">{s.count} emails</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hot threads */}
                  {summary.email?.hotThreads && summary.email.hotThreads.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Hot Threads</h3>
                      <div className="space-y-2">
                        {summary.email.hotThreads.map((thread, i) => (
                          <div key={i} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                {thread.subject}
                              </span>
                              <span className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase shrink-0',
                                URGENCY_COLOR[thread.urgency],
                              )}>
                                {thread.urgency}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mb-1.5">From: {thread.from}</div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">{thread.summary}</span>
                              <span className="text-[10px] text-gray-400 ml-2 shrink-0">
                                {STATUS_LABEL[thread.status]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CALENDAR TAB */}
              {activeTab === 'calendar' && (
                <div className="space-y-4">
                  {/* Calendar stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Meetings" value={summary.calendar?.meetingsLastWeek ?? 0} icon="📅" />
                    <StatCard label="Hours" value={summary.calendar?.meetingHoursLastWeek ?? 0} icon="⏱️" />
                    <StatCard label="Next week" value={summary.calendar?.meetingsNextWeek ?? 0} icon="🗓️" />
                  </div>

                  {/* Upcoming */}
                  {summary.calendar?.upcomingHighlights && summary.calendar.upcomingHighlights.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Coming Up</h3>
                      <div className="space-y-2">
                        {summary.calendar.upcomingHighlights.map((event, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                            <span className="text-lg shrink-0">
                              {event.type === 'deadline' ? '⏰' : event.type === 'event' ? '🎉' : '📅'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{event.title}</div>
                              <div className="text-xs text-gray-400">{event.time}</div>
                            </div>
                            {event.attendees > 0 && (
                              <span className="text-xs text-gray-400 shrink-0">👥 {event.attendees}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent docs */}
                  {summary.documents?.recentlyAccessed && summary.documents.recentlyAccessed.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Recent Documents</h3>
                      <div className="space-y-1.5">
                        {summary.documents.recentlyAccessed.map((doc, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span>📄</span>
                            <span className="truncate">{doc.title}</span>
                            <span className="text-xs text-gray-400 ml-auto shrink-0">{doc.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ACTIONS TAB */}
              {activeTab === 'actions' && (
                <div className="space-y-4">
                  {summary.actionItems?.length > 0 ? (
                    <div>
                      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                        {summary.actionItems.filter((_, i) => !checkedItems.has(i)).length} remaining
                      </h3>
                      <div className="space-y-2">
                        {summary.actionItems.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => toggleItem(i)}
                            className={cn(
                              'w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all',
                              checkedItems.has(i)
                                ? 'opacity-50 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700',
                            )}
                          >
                            <span className="text-lg shrink-0">{PRIORITY_ICON[action.priority]}</span>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                'text-sm',
                                checkedItems.has(i)
                                  ? 'line-through text-gray-400'
                                  : 'text-gray-800 dark:text-gray-200',
                              )}>
                                {action.item}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-gray-400">{action.source}</span>
                                <span className="text-[10px] text-gray-400">·</span>
                                <span className="text-[10px] text-gray-400">{action.due}</span>
                              </div>
                            </div>
                            {checkedItems.has(i) && (
                              <span className="text-green-500 text-sm shrink-0">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-3xl mb-3">✅</p>
                      <p className="text-sm">No pending action items</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, icon, urgent }: {
  label: string;
  value: number;
  icon: string;
  urgent?: boolean;
}) {
  return (
    <div className={cn(
      'p-3 rounded-xl border text-center',
      urgent
        ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900'
        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800',
    )}>
      <div className="text-base mb-0.5">{icon}</div>
      <div className={cn(
        'text-xl font-bold',
        urgent ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200',
      )}>
        {value}
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

// ── Local markdown builder (fallback) ──

function buildLocalMarkdown(s: RichSummary): string {
  const lines = [`# Weekly Summary — ${s.weekRange}`, '', `> ${s.headline}`, ''];

  if (s.actionItems?.length) {
    lines.push('## Action Items', '');
    for (const a of s.actionItems) {
      lines.push(`- [${PRIORITY_ICON[a.priority]}] ${a.item} (${a.due})`);
    }
    lines.push('');
  }

  if (s.insights?.length) {
    lines.push('## Insights', '');
    for (const i of s.insights) lines.push(`- 💡 ${i}`);
    lines.push('');
  }

  if (s.nextWeekPrep?.length) {
    lines.push('## Next Week', '');
    for (const p of s.nextWeekPrep) lines.push(`- 📌 ${p}`);
    lines.push('');
  }

  lines.push(`---`, `*Generated ${new Date(s.generatedAt).toLocaleString()}*`);
  return lines.join('\n');
}
