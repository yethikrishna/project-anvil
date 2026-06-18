'use client';

/**
 * ActionItemsPanel — extracted tasks, decisions, and AI commitments.
 *
 * Reads from /api/intelligence and shows:
 * - Pending tasks (user or AI)
 * - Decisions made in conversations
 * - AI commitments / follow-ups
 *
 * Allows marking tasks as done, scrolling to source conversation.
 */

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

interface Task {
  id: string;
  text: string;
  assignee: 'ai' | 'user' | 'unknown';
  dueHint?: string;
  status: 'pending' | 'done' | 'cancelled';
  conversationId: string;
  createdAt: number;
}

interface Decision {
  id: string;
  text: string;
  context: string;
  conversationId: string;
  createdAt: number;
}

interface Commitment {
  id: string;
  text: string;
  who: 'ai' | 'user';
  conversationId: string;
  dueHint?: string;
  createdAt: number;
}

interface IntelligenceSummary {
  pendingTasks: number;
  recentDecisions: number;
  openCommitments: number;
  tasks: Task[];
  decisions: Decision[];
  commitments: Commitment[];
}

interface Props {
  userId?: string;
  onJumpToConversation?: (convId: string) => void;
  className?: string;
}

const TABS = ['Tasks', 'Decisions', 'Commitments'] as const;
type Tab = typeof TABS[number];

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ActionItemsPanel({ userId = 'default', onJumpToConversation, className }: Props) {
  const [data, setData] = useState<IntelligenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('Tasks');
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/intelligence?userId=${userId}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json() as IntelligenceSummary;
      setData(json);
    } catch {
      // Silently fail — panel is non-critical
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    // Refresh every 30s
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const completeTask = useCallback(async (taskId: string) => {
    setCompleting(prev => new Set([...prev, taskId]));
    try {
      await fetch('/api/intelligence', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId, status: 'done' }),
      });
      // Optimistically update
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: 'done' } : t),
          pendingTasks: Math.max(0, prev.pendingTasks - 1),
        };
      });
    } finally {
      setCompleting(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }, [userId]);

  const pendingTasks = data?.tasks.filter(t => t.status === 'pending') ?? [];
  const decisions = data?.decisions ?? [];
  const commitments = data?.commitments ?? [];

  const totalBadge = pendingTasks.length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Action Items
          </span>
          {totalBadge > 0 && (
            <span className="text-[10px] font-bold bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {totalBadge}
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        {TABS.map(tab => {
          const count = tab === 'Tasks' ? pendingTasks.length
            : tab === 'Decisions' ? decisions.length
            : commitments.length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 text-xs py-2 font-medium transition-colors relative',
                activeTab === tab
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
              )}
            >
              {tab}
              {count > 0 && (
                <span className={cn(
                  'ml-1 text-[10px] font-bold',
                  activeTab === tab ? 'text-indigo-500' : 'text-gray-400',
                )}>
                  {count}
                </span>
              )}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'Tasks' ? (
          pendingTasks.length === 0 ? (
            <EmptyState
              icon="✅"
              title="No pending tasks"
              subtitle="Tasks from your conversations appear here"
            />
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {pendingTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isCompleting={completing.has(task.id)}
                  onComplete={() => completeTask(task.id)}
                  onJump={onJumpToConversation ? () => onJumpToConversation(task.conversationId) : undefined}
                />
              ))}
            </ul>
          )
        ) : activeTab === 'Decisions' ? (
          decisions.length === 0 ? (
            <EmptyState
              icon="🧠"
              title="No decisions yet"
              subtitle="Decisions made in conversations are recorded here"
            />
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {decisions.map(d => (
                <li key={d.id} className="px-4 py-3 group">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-base shrink-0">🧠</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{d.text}</p>
                      {d.context && (
                        <p className="text-[10px] text-gray-400 mt-0.5 italic truncate">&quot;{d.context}&quot;</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">{relativeTime(d.createdAt)}</p>
                    </div>
                    {onJumpToConversation && (
                      <button
                        onClick={() => onJumpToConversation(d.conversationId)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-0.5"
                        title="Go to conversation"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          commitments.length === 0 ? (
            <EmptyState
              icon="🤝"
              title="No commitments"
              subtitle="Things the AI promised to do appear here"
            />
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {commitments.map(c => (
                <li key={c.id} className="px-4 py-3 group">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-base shrink-0">
                      {c.who === 'ai' ? '🤖' : '👤'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{c.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          c.who === 'ai'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500',
                        )}>
                          {c.who === 'ai' ? 'AI' : 'You'}
                        </span>
                        {c.dueHint && (
                          <span className="text-[10px] text-amber-500">{c.dueHint}</span>
                        )}
                        <span className="text-[10px] text-gray-400">{relativeTime(c.createdAt)}</span>
                      </div>
                    </div>
                    {onJumpToConversation && (
                      <button
                        onClick={() => onJumpToConversation(c.conversationId)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Go to conversation"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function TaskRow({
  task,
  isCompleting,
  onComplete,
  onJump,
}: {
  task: Task;
  isCompleting: boolean;
  onComplete: () => void;
  onJump?: () => void;
}) {
  return (
    <li className="px-4 py-3 group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
      <div className="flex items-start gap-2.5">
        {/* Checkbox */}
        <button
          onClick={onComplete}
          disabled={isCompleting}
          className={cn(
            'mt-0.5 w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-all',
            isCompleting
              ? 'border-indigo-400 bg-indigo-400'
              : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400',
          )}
          title="Mark as done"
        >
          {isCompleting && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{task.text}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {/* Assignee badge */}
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              task.assignee === 'ai'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
            )}>
              {task.assignee === 'ai' ? '🤖 AI' : '👤 You'}
            </span>
            {task.dueHint && (
              <span className="text-[10px] text-amber-500 font-medium">{task.dueHint}</span>
            )}
            <span className="text-[10px] text-gray-400 ml-auto">
              {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {onJump && (
          <button
            onClick={onJump}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-0.5"
            title="Go to conversation"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <span className="text-3xl mb-2">{icon}</span>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{subtitle}</p>
    </div>
  );
}
