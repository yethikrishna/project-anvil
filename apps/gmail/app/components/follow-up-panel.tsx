'use client';

/**
 * Follow-Up Reminders Panel
 *
 * Displays AI-detected follow-up reminders:
 * - No-reply emails
 * - Unanswered questions
 * - Approaching deadlines
 * - Stale threads
 *
 * Features:
 * - Urgency-based sorting and color coding
 * - One-click compose follow-up
 * - Mark as done / snooze
 * - Summary stats
 */

import {useState, useCallback} from 'react';
import {
  type FollowUpItem,
  useFollowUpDetector,
} from '../lib/follow-up-detector';
import type {MailMessage} from '../lib/ai-mail';

// ── Props ──

interface FollowUpPanelProps {
  messages: MailMessage[];
  onCompose: (to: string, subject: string, context: string) => void;
  onSelectThread: (threadId: string) => void;
  onClose: () => void;
}

// ── Urgency Config ──

const URGENCY_STYLES = {
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    icon: '🔴',
    label: 'Urgent',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-700',
    icon: '🟡',
    label: 'Medium',
  },
  low: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    icon: '🔵',
    label: 'Low',
  },
};

const TYPE_ICONS: Record<FollowUpItem['type'], {icon: string; label: string}> = {
  'no-reply': {icon: '📭', label: 'No Reply'},
  'unanswered-question': {icon: '❓', label: 'Unanswered'},
  'approaching-deadline': {icon: '⏰', label: 'Deadline'},
  'stale-thread': {icon: '🕸️', label: 'Stale'},
};

// ── Component ──

export function FollowUpPanel({messages, onCompose, onSelectThread, onClose}: FollowUpPanelProps) {
  const {followUps, stats} = useFollowUpDetector(messages);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'high' | FollowUpItem['type']>('all');

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  }, []);

  const handleSnooze = useCallback((item: FollowUpItem) => {
    // Mark as snoozed (in a real app this would persist)
    handleDismiss(`${item.threadId}-${item.type}`);
  }, [handleDismiss]);

  const handleFollowUp = useCallback((item: FollowUpItem) => {
    onCompose(
      item.from,
      `Re: ${item.subject}`,
      `Following up on our previous conversation about "${item.subject}".\n\n${item.suggestedAction}`,
    );
  }, [onCompose]);

  const visibleFollowUps = followUps.filter(f => {
    if (dismissed.has(`${f.threadId}-${f.type}`)) return false;
    if (filter === 'all') return true;
    if (filter === 'high') return f.urgency === 'high';
    return f.type === filter;
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔔</span>
              <h3 className="font-semibold text-gray-900">Follow-Up Reminders</h3>
              {stats.urgent > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                  {stats.urgent} urgent
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-2">
            <StatBadge label="No Reply" count={stats.noReply} icon="📭" />
            <StatBadge label="Unanswered" count={stats.unanswered} icon="❓" />
            <StatBadge label="Deadlines" count={stats.deadlines} icon="⏰" />
            <StatBadge label="Stale" count={stats.stale} icon="🕸️" />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1 px-5 py-2 border-b border-gray-100 overflow-x-auto">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All ({stats.total})</FilterButton>
          <FilterButton active={filter === 'high'} onClick={() => setFilter('high')}>🔴 Urgent</FilterButton>
          <FilterButton active={filter === 'no-reply'} onClick={() => setFilter('no-reply')}>No Reply</FilterButton>
          <FilterButton active={filter === 'unanswered-question'} onClick={() => setFilter('unanswered-question')}>Unanswered</FilterButton>
          <FilterButton active={filter === 'approaching-deadline'} onClick={() => setFilter('approaching-deadline')}>Deadlines</FilterButton>
          <FilterButton active={filter === 'stale-thread'} onClick={() => setFilter('stale-thread')}>Stale</FilterButton>
        </div>

        {/* Follow-ups List */}
        <div className="flex-1 overflow-auto divide-y divide-gray-100">
          {visibleFollowUps.length === 0 ? (
            <div className="py-12 text-center">
              <span className="text-3xl">✅</span>
              <p className="text-sm text-gray-500 mt-2">
                {dismissed.size > 0 ? 'All caught up! Dismissed items are hidden.' : 'No follow-ups needed right now.'}
              </p>
            </div>
          ) : (
            visibleFollowUps.map((item, i) => {
              const style = URGENCY_STYLES[item.urgency];
              const typeInfo = TYPE_ICONS[item.type];
              return (
                <div key={`${item.threadId}-${item.type}-${i}`} className={`px-5 py-3 ${style.bg} border-l-4 ${style.border}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{typeInfo.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{item.subject}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${style.badge}`}>
                          {style.label} · {item.daysSince}d
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">💡 {item.suggestedAction}</p>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleFollowUp(item)}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          ✉️ Follow Up
                        </button>
                        <button
                          onClick={() => onSelectThread(item.threadId)}
                          className="px-3 py-1 text-xs bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          Open Thread
                        </button>
                        <button
                          onClick={() => handleSnooze(item)}
                          className="px-3 py-1 text-xs text-gray-400 hover:text-gray-600"
                        >
                          Snooze
                        </button>
                        <button
                          onClick={() => handleDismiss(`${item.threadId}-${item.type}`)}
                          className="px-3 py-1 text-xs text-gray-400 hover:text-red-500"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatBadge({label, count, icon}: {label: string; count: number; icon: string}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span>{icon}</span>
      <span className="font-medium text-gray-700">{count}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}

function FilterButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
        active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}
