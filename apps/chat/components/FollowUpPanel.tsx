/**
 * FollowUpPanel — AI-tracked email follow-ups.
 *
 * Shows three categories:
 * 🕐 Awaiting Reply — emails you sent that need a response
 * 📬 Need to Reply — unread emails waiting for your response
 * ✋ They Promised — commitments others made that haven't come through
 *
 * One-click actions: Send nudge, Draft reply, Mark done
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

interface FollowUpItem {
  id: string;
  type: 'awaiting-reply' | 'promised-by-them' | 'need-to-reply' | 'overdue-task';
  priority: 'high' | 'medium' | 'low';
  subject: string;
  contact: string;
  contactEmail?: string;
  daysSince: number;
  context: string;
  suggestedAction: string;
}

interface Props {
  onAction?: (prompt: string) => void;
  onClose: () => void;
}

const TYPE_CONFIG = {
  'awaiting-reply': { icon: '🕐', label: 'Awaiting reply', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
  'need-to-reply': { icon: '📬', label: 'Need to reply', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20' },
  'promised-by-them': { icon: '✋', label: 'They promised', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/20' },
  'overdue-task': { icon: '⏰', label: 'Overdue task', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20' },
};

const PRIORITY_CONFIG = {
  high: { label: 'High', cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  medium: { label: 'Med', cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  low: { label: 'Low', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500' },
};

export default function FollowUpPanel({ onAction, onClose }: Props) {
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FollowUpItem['type'] | 'all'>('all');
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays: 14 }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setLastGenerated(data.generatedAt);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]));

  const visibleItems = items
    .filter(item => !dismissed.has(item.id))
    .filter(item => activeFilter === 'all' || item.type === activeFilter)
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });

  const countByType = (type: FollowUpItem['type']) =>
    items.filter(i => !dismissed.has(i.id) && i.type === type).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              🎯 Follow-up Tracker
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''} need attention
              {lastGenerated && ` · ${new Date(lastGenerated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              ↺
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-4 pb-2 overflow-x-auto">
          {([
            { id: 'all' as const, label: `All (${visibleItems.length})` },
            { id: 'need-to-reply' as const, label: `Reply (${countByType('need-to-reply')})` },
            { id: 'awaiting-reply' as const, label: `Waiting (${countByType('awaiting-reply')})` },
            { id: 'promised-by-them' as const, label: `Promised (${countByType('promised-by-them')})` },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                'text-[10px] px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors shrink-0',
                activeFilter === tab.id
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50">
          {loading && (
            <div className="p-6 text-center">
              <div className="flex justify-center gap-1 mb-2">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
              <p className="text-[11px] text-gray-400">Scanning email threads...</p>
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All caught up!</p>
              <p className="text-[11px] text-gray-400 mt-1">No follow-ups needed right now.</p>
            </div>
          )}

          {!loading && visibleItems.map(item => {
            const typeConf = TYPE_CONFIG[item.type];
            const priConf = PRIORITY_CONFIG[item.priority];

            return (
              <div key={item.id} className="p-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <div className="flex items-start gap-2.5">
                  {/* Type icon */}
                  <span className="text-base mt-0.5 shrink-0">{typeConf.icon}</span>

                  <div className="flex-1 min-w-0">
                    {/* Subject + priority */}
                    <div className="flex items-start gap-1.5 mb-0.5">
                      <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
                        {item.subject}
                      </p>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0', priConf.cls)}>
                        {priConf.label}
                      </span>
                    </div>

                    {/* Contact + days */}
                    <p className="text-[10px] text-gray-500">
                      {item.contact}{item.contactEmail ? ` · ${item.contactEmail}` : ''}
                      {' · '}
                      <span className={cn(item.daysSince >= 7 ? 'text-red-500' : 'text-gray-400')}>
                        {item.daysSince}d ago
                      </span>
                    </p>

                    {/* Context */}
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {item.context}
                    </p>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {item.type === 'awaiting-reply' && onAction && (
                        <button
                          onClick={() => { onAction(`Send a polite follow-up nudge to ${item.contact} about "${item.subject}"`); dismiss(item.id); }}
                          className="text-[9px] px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                        >
                          Send nudge
                        </button>
                      )}
                      {item.type === 'need-to-reply' && onAction && (
                        <button
                          onClick={() => { onAction(`Draft a reply to ${item.contact} about "${item.subject}"`); dismiss(item.id); }}
                          className="text-[9px] px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 hover:bg-red-100 transition-colors"
                        >
                          Draft reply
                        </button>
                      )}
                      {item.type === 'promised-by-them' && onAction && (
                        <button
                          onClick={() => { onAction(`Follow up with ${item.contact} on their promise: "${item.context}"`); dismiss(item.id); }}
                          className="text-[9px] px-2 py-0.5 rounded-md bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-800 hover:bg-yellow-100 transition-colors"
                        >
                          Follow up
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(item.id)}
                        className="text-[9px] px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-400 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        ✓ Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!loading && items.length > 0 && onAction && (
          <div className="border-t border-gray-100 dark:border-gray-800 p-3">
            <button
              onClick={() => {
                onAction('Review all my follow-ups and help me triage them one by one');
                onClose();
              }}
              className="w-full text-[11px] py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-colors font-medium"
            >
              🤖 AI triage all follow-ups
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
