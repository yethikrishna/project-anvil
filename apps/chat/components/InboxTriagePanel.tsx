/**
 * InboxTriagePanel — AI-scored smart inbox view.
 *
 * Not just unread emails. Scored, ranked, and actionable:
 * - Urgency heat indicator (red/orange/yellow/gray)
 * - Action type badge (Reply/Review/Schedule/Forward)
 * - Suggested reply starter (click to draft)
 * - Estimated read time
 * - Tags (blocking, has-deadline, from-vip, etc.)
 * - One-click "Draft reply", "Schedule", "Forward" buttons
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface TriagedEmail {
  threadId: string;
  subject: string;
  from: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  urgencyScore: number;
  actionRequired: 'reply' | 'review' | 'forward' | 'schedule' | 'none';
  suggestedReply?: string;
  whyItMatters: string;
  tags: string[];
  estimatedReadMinutes: number;
}

interface Props {
  onAction: (prompt: string) => void;
  onClose: () => void;
}

const ACTION_CONFIG = {
  reply: { label: 'Reply', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800', icon: '↩️' },
  review: { label: 'Review', color: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800', icon: '👁' },
  forward: { label: 'Forward', color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800', icon: '→' },
  schedule: { label: 'Schedule', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800', icon: '📅' },
  none: { label: 'FYI', color: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700', icon: '📌' },
};

const TAG_STYLES: Record<string, string> = {
  'awaiting-response': 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  'has-deadline': 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
  'decision-required': 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300',
  'from-vip': 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300',
  'has-attachment': 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  'can-delegate': 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300',
  'thread-long': 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  'recurring': 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
};

function urgencyToColor(score: number): string {
  if (score >= 9) return 'bg-red-500';
  if (score >= 7) return 'bg-orange-500';
  if (score >= 5) return 'bg-yellow-400';
  if (score >= 3) return 'bg-blue-400';
  return 'bg-gray-300 dark:bg-gray-600';
}

function urgencyToLabel(score: number): string {
  if (score >= 9) return 'Critical';
  if (score >= 7) return 'Urgent';
  if (score >= 5) return 'Normal';
  if (score >= 3) return 'Low';
  return 'Noise';
}

function buildActionPrompt(email: TriagedEmail, action: 'draft' | 'schedule' | 'summarize'): string {
  switch (action) {
    case 'draft':
      return email.suggestedReply
        ? `Draft a reply to "${email.subject}" from ${email.from}. Start with: "${email.suggestedReply}" — expand it into a complete professional email.`
        : `Read the email thread "${email.subject}" from ${email.from} and draft a professional reply addressing their main point.`;
    case 'schedule':
      return `Schedule a meeting or call related to "${email.subject}" with ${email.from}. Check my calendar for availability this week.`;
    case 'summarize':
      return `Summarize the email thread "${email.subject}" from ${email.from} and tell me what action I need to take.`;
    default:
      return `Help me with "${email.subject}" from ${email.from}.`;
  }
}

export default function InboxTriagePanel({ onAction, onClose }: Props) {
  const [emails, setEmails] = useState<TriagedEmail[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'reply' | 'review'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchTriage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/attention/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 12, generateReplies: true }),
      });
      if (!res.ok) throw new Error('Triage failed');
      const data = await res.json();
      setEmails(data.triaged ?? []);
      setSummary(data.summary ?? '');
      setLastFetched(Date.now());
    } catch {
      setError('Could not fetch inbox. Mail service may be unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTriage(); }, [fetchTriage]);

  const filteredEmails = emails.filter(e => {
    if (dismissed.has(e.threadId)) return false;
    if (filter === 'urgent') return e.urgencyScore >= 7;
    if (filter === 'reply') return e.actionRequired === 'reply';
    if (filter === 'review') return ['review', 'forward', 'schedule'].includes(e.actionRequired);
    return true;
  });

  const urgentCount = emails.filter(e => e.urgencyScore >= 7 && !dismissed.has(e.threadId)).length;
  const replyCount = emails.filter(e => e.actionRequired === 'reply' && !dismissed.has(e.threadId)).length;

  return (
    <div className="w-96 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 px-4 pt-3 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span>📥</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Smart Inbox</span>
            {urgentCount > 0 && (
              <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full px-1.5 py-0.5 font-semibold">
                {urgentCount} urgent
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchTriage}
              disabled={loading}
              className={cn(
                'text-[10px] px-2 py-1 rounded-lg transition-colors',
                loading ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {loading ? 'Loading…' : '↻'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs p-1 transition-colors">✕</button>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">{summary}</p>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1">
          {([
            { id: 'all', label: 'All', count: emails.length - dismissed.size },
            { id: 'urgent', label: 'Urgent', count: urgentCount },
            { id: 'reply', label: 'Reply', count: replyCount },
            { id: 'review', label: 'Review', count: emails.filter(e => ['review','forward','schedule'].includes(e.actionRequired) && !dismissed.has(e.threadId)).length },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'text-[10px] px-2 py-1 rounded-lg transition-colors font-medium',
                filter === tab.id
                  ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {tab.label}
              {tab.count > 0 && <span className="ml-1 opacity-60">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {loading && emails.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <div className="flex gap-1.5">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && filteredEmails.length === 0 && emails.length > 0 && (
          <div className="flex flex-col items-center justify-center p-8 gap-2">
            <span className="text-2xl">✨</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">Nothing in this filter</p>
          </div>
        )}

        <div className="p-3 space-y-2">
          {filteredEmails.map(email => {
            const actionCfg = ACTION_CONFIG[email.actionRequired];
            const isExpanded = expandedId === email.threadId;

            return (
              <div
                key={email.threadId}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden"
              >
                {/* Urgency bar */}
                <div className={cn('h-1 w-full', urgencyToColor(email.urgencyScore))} />

                <div className="p-3">
                  {/* Header row */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn(
                          'text-[9px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wide',
                          actionCfg.color,
                        )}>
                          {actionCfg.icon} {actionCfg.label}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {urgencyToLabel(email.urgencyScore)} · {email.estimatedReadMinutes}min
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {email.subject}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {email.from}{email.fromEmail ? ` <${email.fromEmail}>` : ''}
                      </p>
                    </div>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : email.threadId)}
                      className="text-gray-400 hover:text-gray-600 text-xs shrink-0 transition-colors"
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Why it matters */}
                  {email.whyItMatters && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1.5 leading-snug">
                      {email.whyItMatters}
                    </p>
                  )}

                  {/* Tags */}
                  {email.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {email.tags.map(tag => (
                        <span
                          key={tag}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                            TAG_STYLES[tag] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500',
                          )}
                        >
                          {tag.replace(/-/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      {email.snippet && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 italic mb-2">
                          "{email.snippet}"
                        </p>
                      )}
                      {email.suggestedReply && (
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-2 mb-2">
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mb-0.5">Suggested start:</p>
                          <p className="text-[11px] text-blue-700 dark:text-blue-300 italic">"{email.suggestedReply}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-2">
                    {email.actionRequired === 'reply' && (
                      <button
                        onClick={() => { onAction(buildActionPrompt(email, 'draft')); onClose(); }}
                        className="flex-1 text-[10px] px-2 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium text-center"
                      >
                        Draft Reply
                      </button>
                    )}
                    {email.actionRequired === 'schedule' && (
                      <button
                        onClick={() => { onAction(buildActionPrompt(email, 'schedule')); onClose(); }}
                        className="flex-1 text-[10px] px-2 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium text-center"
                      >
                        Schedule
                      </button>
                    )}
                    <button
                      onClick={() => { onAction(buildActionPrompt(email, 'summarize')); onClose(); }}
                      className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Summarize
                    </button>
                    <button
                      onClick={() => setDismissed(prev => new Set([...prev, email.threadId]))}
                      className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {lastFetched && (
          <div className="px-4 pb-3">
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              Scored {new Date(lastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
