'use client';

/**
 * AI Bulk Triage — Process entire inbox in one shot.
 *
 * Sends all unread emails to the LLM in a single batch request.
 * Returns a priority matrix: Urgent → Today → This Week → Low.
 * User can act (archive, label, reply) directly from the triage view.
 *
 * Powered by @anvil/ai via /api/ai (triage-batch action).
 */

import { useState, useCallback, useMemo } from 'react';

// ── Types ──

export interface TriageItem {
  emailId: string;
  subject: string;
  from: string;
  date: string;
  priority: 'urgent' | 'today' | 'this-week' | 'low';
  category: string;
  reason: string;
  suggestedAction: 'reply' | 'archive' | 'label' | 'read' | 'forward' | 'delegate';
  actionLabel: string;
  estimatedReadTime: string;
}

export interface TriageResult {
  urgent: TriageItem[];
  today: TriageItem[];
  thisWeek: TriageItem[];
  low: TriageItem[];
  totalProcessed: number;
  processingTimeMs: number;
}

interface MailMessageInput {
  id: string;
  subject: string;
  from: { name: string; email: string };
  body: string;
  date: string;
  read: boolean;
}

interface AIBulkTriageProps {
  messages: MailMessageInput[];
  onSelectEmail: (id: string) => void;
  onArchive?: (id: string) => void;
  onLabel?: (id: string, label: string) => void;
  onClose: () => void;
}

// ── Priority config ──

const PRIORITY_CONFIG = {
  urgent: {
    label: '🔴 Urgent',
    description: 'Needs attention today — deadlines, blockers, or direct asks',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    headerBg: 'bg-red-600',
  },
  today: {
    label: '🟠 Today',
    description: 'Important, respond or act today',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    badge: 'bg-orange-100 text-orange-700',
    headerBg: 'bg-orange-500',
  },
  'this-week': {
    label: '🟡 This Week',
    description: 'Can wait a day or two',
    bg: 'bg-yellow-50',
    border: 'border-yellow-100',
    badge: 'bg-yellow-100 text-yellow-700',
    headerBg: 'bg-yellow-500',
  },
  low: {
    label: '⚪ Low Priority',
    description: 'FYI only — newsletters, updates, notifications',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
    badge: 'bg-gray-100 text-gray-600',
    headerBg: 'bg-gray-400',
  },
};

// ── Local fast pre-triage (no API) ──

function localTriage(messages: MailMessageInput[]): TriageResult {
  const now = Date.now();
  const result: TriageResult = { urgent: [], today: [], thisWeek: [], low: [], totalProcessed: 0, processingTimeMs: 0 };
  const t0 = performance.now();

  const unread = messages.filter(m => !m.read);
  result.totalProcessed = unread.length;

  for (const m of unread) {
    const lower = `${m.subject} ${m.body}`.toLowerCase();
    const fromLower = m.from.email.toLowerCase();
    const dayOld = now - new Date(m.date).getTime() > 86_400_000;

    const isUrgent = /urgent|asap|immediately|deadline|by (today|tomorrow|monday|friday)|action required|critical|p0|blocker|follow.?up|please respond|need your|your approval|overdue|final notice/i.test(lower);
    const isWork = /@company\.|@corp\.|@team\.|slack|github|jira|linear|notion|figma/i.test(fromLower);
    const isNewsletter = /unsubscribe|newsletter|digest|weekly|monthly|noreply@|no-reply@|notifications@/i.test(`${fromLower} ${lower}`);
    const isTransaction = /order|receipt|invoice|subscription|payment|billing|charged|confirmation|tracking/i.test(lower);

    let priority: TriageItem['priority'];
    let suggestedAction: TriageItem['suggestedAction'];
    let category = 'general';

    if (isUrgent) {
      priority = 'urgent';
      suggestedAction = 'reply';
      category = 'urgent';
    } else if (isWork && !dayOld) {
      priority = 'today';
      suggestedAction = 'reply';
      category = 'work';
    } else if (isNewsletter) {
      priority = 'low';
      suggestedAction = 'archive';
      category = 'newsletter';
    } else if (isTransaction) {
      priority = dayOld ? 'low' : 'this-week';
      suggestedAction = 'read';
      category = 'transaction';
    } else if (isWork) {
      priority = 'this-week';
      suggestedAction = 'reply';
      category = 'work';
    } else {
      priority = 'low';
      suggestedAction = 'read';
      category = 'personal';
    }

    const words = m.body.split(/\s+/).length;
    const readSec = Math.ceil((words / 200) * 60);
    const estimatedReadTime = readSec < 30 ? '< 30s' : readSec < 60 ? `~${readSec}s` : `~${Math.round(readSec / 60)}m`;

    const item: TriageItem = {
      emailId: m.id,
      subject: m.subject,
      from: m.from.name || m.from.email,
      date: m.date,
      priority,
      category,
      reason: isUrgent
        ? 'Contains urgency signals'
        : isNewsletter ? 'Newsletter / automated' : isTransaction ? 'Transaction / receipt' : isWork ? 'Work email' : 'General',
      suggestedAction,
      actionLabel: suggestedAction === 'reply' ? 'Reply' : suggestedAction === 'archive' ? 'Archive' : 'Read',
      estimatedReadTime,
    };

    if (priority === 'urgent') result.urgent.push(item);
    else if (priority === 'today') result.today.push(item);
    else if (priority === 'this-week') result.thisWeek.push(item);
    else result.low.push(item);
  }

  result.processingTimeMs = Math.round(performance.now() - t0);
  return result;
}

// ── Component ──

export function AIBulkTriage({ messages, onSelectEmail, onArchive, onLabel, onClose }: AIBulkTriageProps) {
  const [result, setResult] = useState<TriageResult | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isAIEnhanced, setIsAIEnhanced] = useState(false);
  const [actedIds, setActedIds] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'urgent' | 'today' | 'this-week' | 'low'>('urgent');

  const unreadCount = useMemo(() => messages.filter(m => !m.read).length, [messages]);

  // Show local result immediately
  const runLocalTriage = useCallback(() => {
    const local = localTriage(messages);
    setResult(local);
  }, [messages]);

  // Enhance with AI
  const runAITriage = useCallback(async () => {
    setIsAILoading(true);
    try {
      const unread = messages.filter(m => !m.read).slice(0, 50);
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'triage-batch',
          payload: {
            emails: unread.map(m => ({
              id: m.id,
              subject: m.subject,
              from: `${m.from.name} <${m.from.email}>`,
              body: m.body.slice(0, 400),
              date: m.date,
            })),
          },
        }),
      });

      if (resp.ok) {
        const aiResult: TriageResult = await resp.json();
        setResult(aiResult);
        setIsAIEnhanced(true);
      }
    } catch {
      // Keep local result
    } finally {
      setIsAILoading(false);
    }
  }, [messages]);

  const markActed = (id: string) => {
    setActedIds(prev => new Set([...prev, id]));
  };

  if (!result) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="text-5xl mb-4">🤖</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Inbox Triage</h2>
          <p className="text-sm text-gray-500 mb-6">
            Process <strong>{unreadCount} unread emails</strong> and sort them by priority.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={runLocalTriage}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              ⚡ Fast Triage (instant)
            </button>
            <button
              onClick={() => { runLocalTriage(); runAITriage(); }}
              className="px-6 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
            >
              ✨ AI-Powered Triage (deep)
            </button>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sections: Array<{ key: 'urgent' | 'today' | 'this-week' | 'low'; items: TriageItem[] }> = [
    { key: 'urgent', items: result.urgent },
    { key: 'today', items: result.today },
    { key: 'this-week', items: result.thisWeek },
    { key: 'low', items: result.low },
  ];

  const activeItems = sections.find(s => s.key === activeSection)?.items ?? [];

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              🤖 AI Inbox Triage
              {isAIEnhanced && (
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">AI Enhanced</span>
              )}
              {isAILoading && (
                <span className="text-[10px] text-purple-500 flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 border border-purple-500 border-t-transparent rounded-full animate-spin" />
                  AI enhancing...
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500">
              {result.totalProcessed} emails processed in {result.processingTimeMs}ms
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Section tabs */}
        <div className="flex border-b border-gray-100">
          {sections.map(({ key, items }) => {
            const cfg = PRIORITY_CONFIG[key];
            const unattempted = items.filter(i => !actedIds.has(i.emailId)).length;
            return (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  activeSection === key
                    ? 'border-b-2 border-purple-500 text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{cfg.label}</span>
                {unattempted > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
                    {unattempted}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {activeItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm">No emails in this category</p>
            </div>
          ) : (
            activeItems.map(item => {
              const isActed = actedIds.has(item.emailId);
              return (
                <div
                  key={item.emailId}
                  className={`flex items-start gap-3 px-5 py-3 transition-opacity ${isActed ? 'opacity-40' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => { onSelectEmail(item.emailId); onClose(); }}
                      className="text-left w-full"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-gray-800 truncate">{item.from}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-[10px] text-gray-400">{item.estimatedReadTime}</span>
                      </div>
                      <p className="text-xs text-gray-700 truncate">{item.subject}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{item.reason}</p>
                    </button>
                  </div>

                  {/* Actions */}
                  {!isActed && (
                    <div className="flex items-center gap-1 shrink-0">
                      {item.suggestedAction === 'archive' && onArchive && (
                        <button
                          onClick={() => { onArchive(item.emailId); markActed(item.emailId); }}
                          className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        >
                          Archive
                        </button>
                      )}
                      {item.suggestedAction === 'reply' && (
                        <button
                          onClick={() => { onSelectEmail(item.emailId); onClose(); }}
                          className="text-[10px] px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          Reply
                        </button>
                      )}
                      <button
                        onClick={() => markActed(item.emailId)}
                        className="text-[10px] px-1.5 py-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
                        title="Mark as handled"
                      >
                        ✓
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer summary */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="flex gap-4 text-xs text-gray-500">
            <span>🔴 {result.urgent.length} urgent</span>
            <span>🟠 {result.today.length} today</span>
            <span>🟡 {result.thisWeek.length} this week</span>
            <span>⚪ {result.low.length} low</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
