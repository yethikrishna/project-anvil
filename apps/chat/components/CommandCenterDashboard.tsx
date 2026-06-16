/**
 * CommandCenterDashboard — the AI assistant's home screen.
 *
 * Shows a live grid of cross-app status:
 * - Inbox: unread count + top urgent email
 * - Calendar: next event + today's count
 * - Drive: recently modified files
 * - Tasks: pending action items
 * - Memory: recent things the AI remembers
 * - Quick actions: one-click common tasks
 *
 * This is the "What do I need to know right now?" screen.
 * Appears on the welcome screen or as a collapsible header card.
 */

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface StatusCard {
  id: string;
  icon: string;
  title: string;
  value: string;
  subtext?: string;
  action?: string;
  actionLabel?: string;
  status: 'loading' | 'ok' | 'alert' | 'empty' | 'error';
}

interface Props {
  onAction: (prompt: string) => void;
  onOpenTriage: () => void;
  onOpenTasks: () => void;
  className?: string;
}

const LOADING_CARD = (id: string, title: string, icon: string): StatusCard => ({
  id, icon, title, value: '…', status: 'loading',
});

async function fetchDashboardData(): Promise<StatusCard[]> {
  const cards: StatusCard[] = [];

  // Fetch in parallel
  const [triageRes, attentionRes] = await Promise.allSettled([
    fetch('/api/attention/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5, generateReplies: false }),
    }).then(r => r.ok ? r.json() : null),
    fetch('/api/attention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: false }),
    }).then(r => r.ok ? r.json() : null),
  ]);

  // Inbox card
  const triage = triageRes.status === 'fulfilled' ? triageRes.value : null;
  if (triage) {
    const urgent = (triage.triaged ?? []).filter((e: { urgencyScore: number }) => e.urgencyScore >= 7);
    cards.push({
      id: 'inbox',
      icon: '📧',
      title: 'Inbox',
      value: urgent.length > 0 ? `${urgent.length} urgent` : `${(triage.triaged ?? []).length} unread`,
      subtext: triage.triaged?.[0]?.subject?.slice(0, 45) ?? triage.summary,
      action: '__inbox_triage__',
      actionLabel: 'Triage',
      status: urgent.length > 0 ? 'alert' : 'ok',
    });
  } else {
    cards.push({ id: 'inbox', icon: '📧', title: 'Inbox', value: 'Unavailable', status: 'error' });
  }

  // Attention card
  const attn = attentionRes.status === 'fulfilled' ? attentionRes.value : null;
  if (attn) {
    const items = attn.items ?? attn.digest ?? [];
    const urgent = items.filter((i: { priority?: string; score?: number }) =>
      i.priority === 'urgent' || (i.score ?? 0) >= 8
    );
    cards.push({
      id: 'attention',
      icon: '⚡',
      title: 'Needs attention',
      value: urgent.length > 0 ? `${urgent.length} urgent` : `${items.length} items`,
      subtext: items[0]?.title?.slice(0, 45) ?? items[0]?.subject?.slice(0, 45),
      action: 'Scan my unread emails and upcoming calendar events. Give me a priority-ranked list of what needs my attention right now.',
      actionLabel: 'See all',
      status: urgent.length > 0 ? 'alert' : items.length > 0 ? 'ok' : 'empty',
    });
  } else {
    cards.push({ id: 'attention', icon: '⚡', title: 'Needs attention', value: 'Unavailable', status: 'error' });
  }

  return cards;
}

const STATUS_STYLES: Record<StatusCard['status'], string> = {
  loading: 'border-gray-200 dark:border-gray-700',
  ok: 'border-gray-200 dark:border-gray-700',
  alert: 'border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20',
  empty: 'border-gray-200 dark:border-gray-700 opacity-70',
  error: 'border-gray-200 dark:border-gray-700 opacity-50',
};

const STATUS_DOT: Record<StatusCard['status'], string> = {
  loading: 'bg-gray-300 animate-pulse',
  ok: 'bg-green-400',
  alert: 'bg-red-500 animate-pulse',
  empty: 'bg-gray-300',
  error: 'bg-gray-300',
};

const QUICK_ACTIONS = [
  { icon: '✉️', label: 'Draft reply', prompt: 'Find my most recent unread email and draft a professional reply.' },
  { icon: '📅', label: 'Schedule', prompt: '__schedule__' },
  { icon: '📄', label: 'Find file', prompt: "I need to find a file. What's the name or topic?" },
  { icon: '📊', label: 'Weekly brief', prompt: '__weekly_summary__' },
  { icon: '🤖', label: 'Auto-task', prompt: '/chain ' },
  { icon: '👥', label: 'Follow-ups', prompt: "Scan my sent emails from the last 7 days and find conversations where I'm waiting on a reply or need to follow up." },
];

export default function CommandCenterDashboard({ onAction, onOpenTriage, onOpenTasks, className }: Props) {
  const [cards, setCards] = useState<StatusCard[]>([
    LOADING_CARD('inbox', 'Inbox', '📧'),
    LOADING_CARD('attention', 'Needs attention', '⚡'),
  ]);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchDashboardData().then(data => {
      if (mounted) {
        setCards(data);
        setLastRefresh(Date.now());
      }
    }).catch(() => {
      if (mounted) setCards(prev => prev.map(c => ({ ...c, status: 'error' as const })));
    });
    return () => { mounted = false; };
  }, []);

  const handleCardAction = (card: StatusCard) => {
    if (!card.action) return;
    if (card.id === 'inbox' || card.action === '__inbox_triage__') { onOpenTriage(); return; }
    if (card.id === 'tasks' || card.action === '__extract_tasks__') { onOpenTasks(); return; }
    onAction(card.action);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Status grid */}
      <div className="grid grid-cols-2 gap-2">
        {cards.map(card => (
          <div
            key={card.id}
            className={cn(
              'rounded-xl border p-3 transition-all',
              STATUS_STYLES[card.status],
            )}
          >
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{card.icon}</span>
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{card.title}</span>
              </div>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1', STATUS_DOT[card.status])} />
            </div>

            <div className="mt-1.5">
              <p className={cn(
                'text-sm font-semibold',
                card.status === 'alert'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-800 dark:text-gray-200',
                card.status === 'loading' && 'text-gray-400 animate-pulse',
              )}>
                {card.value}
              </p>
              {card.subtext && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {card.subtext}
                </p>
              )}
            </div>

            {card.actionLabel && card.status !== 'loading' && card.status !== 'error' && (
              <button
                onClick={() => handleCardAction(card)}
                className="mt-2 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                {card.actionLabel} →
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wide font-medium">
          Quick actions
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {QUICK_ACTIONS.map(qa => (
            <button
              key={qa.label}
              onClick={() => onAction(qa.prompt)}
              className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all group"
            >
              <span className="text-base group-hover:scale-110 transition-transform">{qa.icon}</span>
              <span className="text-[9px] font-medium text-gray-600 dark:text-gray-400 text-center leading-tight">
                {qa.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {lastRefresh && (
        <p className="text-[9px] text-gray-400 dark:text-gray-600 text-right">
          Updated {new Date(lastRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
