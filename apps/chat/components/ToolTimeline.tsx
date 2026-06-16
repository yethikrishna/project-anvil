/**
 * ToolTimeline — renders a live timeline of AI tool execution steps.
 *
 * Shows:
 * - Each tool call as a step with icon + label
 * - Live spinning indicator for running tools
 * - Duration badge on completed steps
 * - Expandable results panel per step
 * - Total time counter
 *
 * This makes multi-step AI actions feel like watching a skilled
 * assistant work — transparent, fast, and impressive.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@anvil/ui';
import type { ToolCallResult } from '@/lib/types';

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  email_search: { icon: '📧', label: 'Searching mail', color: 'text-blue-600 dark:text-blue-400' },
  email_read_thread: { icon: '📬', label: 'Reading thread', color: 'text-blue-600 dark:text-blue-400' },
  email_send: { icon: '📤', label: 'Sending email', color: 'text-green-600 dark:text-green-400' },
  email_save_draft: { icon: '📝', label: 'Saving draft', color: 'text-indigo-600 dark:text-indigo-400' },
  email_archive: { icon: '📦', label: 'Archiving', color: 'text-gray-600 dark:text-gray-400' },
  file_search: { icon: '🔍', label: 'Searching Drive', color: 'text-yellow-600 dark:text-yellow-400' },
  file_read: { icon: '📄', label: 'Reading file', color: 'text-yellow-600 dark:text-yellow-400' },
  file_share: { icon: '🔗', label: 'Sharing file', color: 'text-orange-600 dark:text-orange-400' },
  document_write: { icon: '📝', label: 'Writing doc', color: 'text-purple-600 dark:text-purple-400' },
  calendar_create_event: { icon: '📅', label: 'Creating event', color: 'text-rose-600 dark:text-rose-400' },
  calendar_get_events: { icon: '📆', label: 'Checking calendar', color: 'text-rose-600 dark:text-rose-400' },
  calendar_check_availability: { icon: '🕐', label: 'Checking availability', color: 'text-rose-600 dark:text-rose-400' },
  web_search: { icon: '🌐', label: 'Searching web', color: 'text-cyan-600 dark:text-cyan-400' },
  context_memo: { icon: '💾', label: 'Saving to memory', color: 'text-teal-600 dark:text-teal-400' },
  context_recall: { icon: '🧠', label: 'Recalling memory', color: 'text-teal-600 dark:text-teal-400' },
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function parseResultPreview(result: string, tool: string): string {
  try {
    const parsed = JSON.parse(result);
    if (tool === 'email_search' && Array.isArray(parsed)) {
      return `Found ${parsed.length} email${parsed.length !== 1 ? 's' : ''}`;
    }
    if (tool === 'file_search' && Array.isArray(parsed)) {
      return `Found ${parsed.length} file${parsed.length !== 1 ? 's' : ''}`;
    }
    if (tool === 'calendar_get_events' && Array.isArray(parsed)) {
      return `${parsed.length} event${parsed.length !== 1 ? 's' : ''} found`;
    }
    if (tool === 'calendar_check_availability' && Array.isArray(parsed)) {
      return `${parsed.length} slot${parsed.length !== 1 ? 's' : ''} available`;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      if ('id' in parsed) return 'Created successfully';
      if ('url' in parsed || 'shareUrl' in parsed) return 'Share link ready';
      if ('draftId' in parsed) return 'Draft saved';
    }
    return 'Done';
  } catch {
    if (result.length < 60) return result;
    return result.slice(0, 57) + '…';
  }
}

interface ToolStepProps {
  tc: ToolCallResult;
  index: number;
  isLast: boolean;
}

function ToolStep({ tc, index, isLast }: ToolStepProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[tc.tool] ?? {
    icon: '⚙️',
    label: tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'text-gray-600 dark:text-gray-400',
  };

  const isRunning = tc.status === 'running';
  const isError = tc.status === 'error';
  const preview = !isRunning ? parseResultPreview(tc.result ?? '', tc.tool) : null;

  return (
    <div className="flex gap-2.5">
      {/* Line + dot */}
      <div className="flex flex-col items-center" style={{ width: 20 }}>
        <div className={cn(
          'w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          isRunning
            ? 'border-2 border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900'
            : isError
              ? 'bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-700'
              : 'bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700',
        )}>
          {isRunning ? (
            <div className="w-2 h-2 rounded-full bg-blue-400 dark:bg-blue-500 animate-ping" />
          ) : isError ? (
            <span className="text-[7px] text-red-500">✕</span>
          ) : (
            <span className="text-[7px] text-emerald-600 dark:text-emerald-400">✓</span>
          )}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-2.5', isLast && 'pb-0')}>
        <button
          onClick={() => !isRunning && setExpanded(v => !v)}
          disabled={isRunning}
          className="w-full text-left group"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{meta.icon}</span>
            <span className={cn('text-xs font-medium', meta.color)}>
              {meta.label}
            </span>
            {isRunning && (
              <div className="ml-1 flex gap-0.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            )}
            {!isRunning && tc.duration != null && (
              <span className="ml-auto text-[10px] text-gray-400 shrink-0">
                {formatMs(tc.duration)}
              </span>
            )}
            {!isRunning && preview && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                {preview}
              </span>
            )}
          </div>
        </button>

        {/* Expanded result */}
        {expanded && tc.result && (
          <div className="mt-1.5 text-[10px] bg-gray-50 dark:bg-gray-800 rounded-lg p-2 max-h-32 overflow-y-auto font-mono text-gray-600 dark:text-gray-400 leading-relaxed">
            {tc.result.length > 500
              ? tc.result.slice(0, 497) + '…'
              : tc.result}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  toolCalls: ToolCallResult[];
  startedAt?: number;
  className?: string;
}

export default function ToolTimeline({ toolCalls, startedAt, className }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasRunning = toolCalls.some(tc => tc.status === 'running');

  useEffect(() => {
    if (!startedAt) return;
    if (hasRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAt);
      }, 100);
    } else {
      setElapsed(startedAt ? Date.now() - startedAt : 0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasRunning, startedAt]);

  if (toolCalls.length === 0) return null;

  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.duration ?? 0), 0);

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            {hasRunning ? 'Running actions' : `${toolCalls.length} action${toolCalls.length !== 1 ? 's' : ''} completed`}
          </span>
          {hasRunning && startedAt && (
            <span className="text-[10px] text-gray-400 font-mono">
              {formatMs(elapsed)}
            </span>
          )}
        </div>
        {!hasRunning && totalDuration > 0 && (
          <span className="text-[10px] text-gray-400">
            Total: {formatMs(totalDuration)}
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="p-3">
        {toolCalls.map((tc, i) => (
          <ToolStep
            key={tc.id}
            tc={tc}
            index={i}
            isLast={i === toolCalls.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
