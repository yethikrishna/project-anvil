/**
 * QuickActionsBar — live "command center" status strip.
 *
 * Shows real-time counts and quick-access actions for:
 * 📧 Unread emails
 * 📅 Next meeting
 * 📁 Recent files
 * ✅ Pending replies
 *
 * Designed to sit at the top of the welcome screen and provide
 * instant awareness of what needs attention. Clicking any card
 * triggers the corresponding AI action.
 *
 * Data is fetched from /api/quick-actions with 60s refresh.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

interface QuickItem {
  id?: string;
  title: string;
  subtitle?: string;
  action?: string;
}

interface QuickActionData {
  action: string;
  title: string;
  summary: string;
  items?: QuickItem[];
  count?: number;
}

type Status = 'loading' | 'ok' | 'error';

interface CardState {
  id: string;
  icon: string;
  label: string;
  data: QuickActionData | null;
  status: Status;
  action: string;
}

const CARDS: Array<Omit<CardState, 'data' | 'status'>> = [
  { id: 'summarize_inbox', icon: '📧', label: 'Inbox', action: 'summarize_inbox' },
  { id: 'next_meeting', icon: '📅', label: 'Next meeting', action: 'next_meeting' },
  { id: 'pending_replies', icon: '↩️', label: 'Needs reply', action: 'pending_replies' },
  { id: 'recent_files', icon: '📁', label: 'Recent files', action: 'recent_files' },
];

async function fetchQuickAction(action: string): Promise<QuickActionData> {
  const res = await fetch('/api/quick-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

interface Props {
  onAction: (prompt: string) => void;
  className?: string;
}

export default function QuickActionsBar({ onAction, className }: Props) {
  const [cards, setCards] = useState<CardState[]>(
    CARDS.map(c => ({ ...c, data: null, status: 'loading' as const }))
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setCards(prev => prev.map(c => ({ ...c, status: 'loading' })));

    // Fetch all in parallel
    CARDS.forEach(card => {
      fetchQuickAction(card.action)
        .then(data => {
          setCards(prev => prev.map(c =>
            c.id === card.id ? { ...c, data, status: 'ok' } : c
          ));
        })
        .catch(() => {
          setCards(prev => prev.map(c =>
            c.id === card.id ? { ...c, status: 'error' } : c
          ));
        });
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className={cn('w-full', className)}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map(card => {
          const isExpanded = expandedId === card.id;
          const isLoading = card.status === 'loading';
          const hasItems = (card.data?.items?.length ?? 0) > 0;

          return (
            <div key={card.id} className="flex flex-col">
              {/* Main card */}
              <button
                onClick={() => {
                  if (hasItems) {
                    setExpandedId(isExpanded ? null : card.id);
                  } else if (card.data?.summary) {
                    // Direct action if no items
                    onAction(`Show me my ${card.label.toLowerCase()}`);
                  }
                }}
                className={cn(
                  'flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border text-left transition-all',
                  isExpanded
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-700'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-base">{card.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {card.label}
                      </span>
                      {hasItems && (
                        <span className="text-[9px] text-gray-400 ml-1">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mt-0.5" />
                    ) : card.status === 'error' ? (
                      <span className="text-[11px] text-gray-400">Unavailable</span>
                    ) : (
                      <span className={cn(
                        'text-[13px] font-semibold leading-tight',
                        (card.data?.count ?? 0) > 0
                          ? 'text-gray-900 dark:text-gray-100'
                          : 'text-gray-400',
                      )}>
                        {card.data?.title ?? '—'}
                      </span>
                    )}
                  </div>
                </div>
                {!isLoading && card.data?.summary && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 text-left">
                    {card.data.summary.length > 50
                      ? card.data.summary.slice(0, 50) + '…'
                      : card.data.summary}
                  </p>
                )}
              </button>

              {/* Expanded items dropdown */}
              {isExpanded && hasItems && (
                <div className="mt-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-lg">
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                    {(card.data?.items ?? []).slice(0, 5).map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (item.action) onAction(item.action);
                          setExpandedId(null);
                        }}
                        className="w-full flex flex-col items-start gap-0.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors"
                      >
                        <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate w-full">
                          {item.title.length > 55 ? item.title.slice(0, 55) + '…' : item.title}
                        </span>
                        {item.subtitle && (
                          <span className="text-[10px] text-gray-400 truncate w-full">
                            {item.subtitle}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-1.5">
                    <button
                      onClick={() => {
                        onAction(`Show me all my ${card.label.toLowerCase()}`);
                        setExpandedId(null);
                      }}
                      className="text-[10px] text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      View all →
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Refresh hint */}
      <div className="flex justify-end mt-1">
        <button
          onClick={load}
          className="text-[9px] text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
