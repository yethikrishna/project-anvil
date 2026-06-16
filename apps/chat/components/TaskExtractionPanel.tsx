/**
 * TaskExtractionPanel — AI-powered action item extraction.
 *
 * Given the current conversation or email thread context,
 * surfaces a structured list of extracted tasks with:
 * - Priority indicators (🔴🟡🟢)
 * - Due date inference
 * - Category icons
 * - "Add to calendar" / "Create document" one-click actions
 * - Dismiss / mark done flow
 *
 * Lives in the right panel (toggled from header).
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';
import type { ChatMessage } from '@/lib/types';

interface ExtractedTask {
  id: string;
  title: string;
  description?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  dueDate?: string;
  dueDateConfidence: 'explicit' | 'inferred' | 'none';
  assignee?: string;
  source: string;
  category: 'communication' | 'meeting' | 'document' | 'research' | 'decision' | 'other';
  dependencies: string[];
  blocking: boolean;
  context: string;
  done?: boolean;
}

interface Props {
  messages: ChatMessage[];
  onExecute: (prompt: string) => void;
  onClose: () => void;
}

const PRIORITY_CONFIG = {
  5: { label: 'Urgent', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  4: { label: 'High', dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', badge: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  3: { label: 'Medium', dot: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', badge: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' },
  2: { label: 'Low', dot: 'bg-blue-400', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  1: { label: 'Someday', dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400', badge: 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700' },
};

const CATEGORY_ICONS: Record<ExtractedTask['category'], string> = {
  communication: '📧',
  meeting: '📅',
  document: '📄',
  research: '🔍',
  decision: '⚖️',
  other: '✅',
};

function formatDueDate(dueDate?: string, confidence?: string): string | null {
  if (!dueDate || confidence === 'none') return null;
  try {
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) return dueDate; // natural language fallback
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days <= 7) return `Due in ${days}d`;
    return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } catch {
    return dueDate;
  }
}

function buildActionPrompt(task: ExtractedTask): string {
  switch (task.category) {
    case 'communication':
      return `Help me with this task: "${task.title}". ${task.context}`;
    case 'meeting':
      return `Schedule this: "${task.title}". ${task.context}`;
    case 'document':
      return `Create a document for: "${task.title}". ${task.context}`;
    case 'research':
      return `Research: "${task.title}". ${task.context}`;
    case 'decision':
      return `Help me decide: "${task.title}". ${task.context}`;
    default:
      return `Help me complete: "${task.title}". ${task.context}`;
  }
}

function buildActionLabel(category: ExtractedTask['category']): string {
  const map: Record<ExtractedTask['category'], string> = {
    communication: 'Draft reply',
    meeting: 'Schedule',
    document: 'Create doc',
    research: 'Research',
    decision: 'Analyze',
    other: 'Act on this',
  };
  return map[category];
}

export default function TaskExtractionPanel({ messages, onExecute, onClose }: Props) {
  const [tasks, setTasks] = useState<ExtractedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExtracted, setLastExtracted] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const extractTasks = useCallback(async () => {
    const relevantMessages = messages
      .filter(m => m.role !== 'system')
      .slice(-20); // last 20 messages

    if (relevantMessages.length < 2) {
      setError('Not enough conversation to extract tasks. Continue chatting first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'conversation',
          messages: relevantMessages.map(m => ({ role: m.role, content: m.content })),
          limit: 12,
        }),
      });

      if (!res.ok) throw new Error('Task extraction failed');
      const data = await res.json() as { tasks: ExtractedTask[] };
      setTasks(data.tasks ?? []);
      setLastExtracted(Date.now());
    } catch (err) {
      setError('Failed to extract tasks. Try again.');
    } finally {
      setLoading(false);
    }
  }, [messages]);

  // Auto-extract when panel opens with content
  useEffect(() => {
    const hasEnoughContent = messages.filter(m => m.role !== 'system').length >= 4;
    if (hasEnoughContent && tasks.length === 0 && !loading) {
      extractTasks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDone = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: true } : t));
  }, []);

  const dismissTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const activeTasks = tasks.filter(t => !t.done);
  const doneTasks = tasks.filter(t => t.done);

  return (
    <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">✅</span>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Action Items</span>
          {activeTasks.length > 0 && (
            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full px-1.5 py-0.5 font-medium">
              {activeTasks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={extractTasks}
            disabled={loading}
            className={cn(
              'text-[10px] px-2 py-1 rounded-lg transition-colors',
              loading
                ? 'text-gray-400 animate-pulse cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
            title="Re-extract tasks from conversation"
          >
            {loading ? 'Analyzing…' : '↻ Refresh'}
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-colors p-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex gap-1.5">
              {[0, 150, 300].map(delay => (
                <span
                  key={delay}
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Analyzing conversation for action items…
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="p-4">
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={extractTasks}
                className="mt-2 text-xs text-red-600 dark:text-red-400 underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {activeTasks.length === 0 && !loading && !error && tasks.length > 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <span className="text-3xl">🎉</span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All done!</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">No pending action items</p>
          </div>
        )}

        {activeTasks.length === 0 && !loading && !error && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-2xl">🤖</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              I'll extract action items from your conversation as you chat.
            </p>
            <button
              onClick={extractTasks}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Extract now
            </button>
          </div>
        )}

        {activeTasks.length > 0 && (
          <div className="p-3 space-y-2">
            {activeTasks.map(task => {
              const cfg = PRIORITY_CONFIG[task.priority];
              const dueStr = formatDueDate(task.dueDate, task.dueDateConfidence);
              const isExpanded = expandedId === task.id;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'rounded-xl border transition-all',
                    task.blocking
                      ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950',
                  )}
                >
                  {/* Task header */}
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      {/* Priority dot */}
                      <div className="mt-1 shrink-0">
                        <span className={cn('w-2 h-2 rounded-full block shrink-0', cfg.dot)} />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1 flex-wrap">
                          <span className="text-xs shrink-0">{CATEGORY_ICONS[task.category]}</span>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug flex-1">
                            {task.title}
                          </p>
                        </div>

                        {/* Metadata row */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={cn(
                            'text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                            cfg.badge, cfg.text,
                          )}>
                            {cfg.label}
                          </span>

                          {task.blocking && (
                            <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                              🚫 Blocking
                            </span>
                          )}

                          {dueStr && (
                            <span className={cn(
                              'text-[10px]',
                              dueStr === 'Overdue' || dueStr === 'Due today'
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : 'text-gray-500 dark:text-gray-400',
                            )}>
                              📅 {dueStr}
                            </span>
                          )}

                          {task.assignee && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                              → {task.assignee}
                            </span>
                          )}
                        </div>

                        {/* Expanded context */}
                        {isExpanded && task.context && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">
                            {task.context}
                          </p>
                        )}
                      </div>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : task.id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs shrink-0 transition-colors"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={() => {
                          onExecute(buildActionPrompt(task));
                          onClose();
                        }}
                        className="flex-1 text-[10px] px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-center font-medium"
                      >
                        {buildActionLabel(task.category)}
                      </button>
                      <button
                        onClick={() => markDone(task.id)}
                        className="text-[10px] px-2 py-1 rounded-lg border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                        title="Mark as done"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => dismissTask(task.id)}
                        className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
        )}

        {/* Completed tasks (collapsed) */}
        {doneTasks.length > 0 && (
          <div className="px-3 pb-3">
            <details className="group">
              <summary className="cursor-pointer text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none">
                {doneTasks.length} completed ▾
              </summary>
              <div className="mt-2 space-y-1.5">
                {doneTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900">
                    <span className="text-[10px]">✅</span>
                    <span className="text-[11px] text-gray-400 line-through flex-1 truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {lastExtracted && (
          <div className="px-4 pb-3">
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              Extracted {new Date(lastExtracted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
