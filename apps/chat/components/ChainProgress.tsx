/**
 * ChainProgress — visual step-by-step display of AI dynamic tool chaining.
 *
 * Shows the AI's execution plan: each tool call, its args, result, and status.
 * Like a progress stepper but for autonomous AI actions.
 */

'use client';

import { useState } from 'react';
import { cn } from '@anvil/ui';
import type { ChainStepState } from '@/lib/use-chain';

const TOOL_ICONS: Record<string, string> = {
  email_search: '📧',
  email_send: '📤',
  email_read_thread: '📨',
  email_save_draft: '📝',
  email_archive: '📦',
  file_search: '🔍',
  file_read: '📄',
  file_share: '🔗',
  document_write: '✍️',
  calendar_create_event: '📅',
  calendar_get_events: '🗓️',
  calendar_check_availability: '⏰',
  web_search: '🌐',
  context_memo: '🧠',
  context_recall: '💡',
};

const TOOL_LABELS: Record<string, string> = {
  email_search: 'Search email',
  email_send: 'Send email',
  email_read_thread: 'Read thread',
  email_save_draft: 'Save draft',
  email_archive: 'Archive email',
  file_search: 'Search Drive',
  file_read: 'Read file',
  file_share: 'Share file',
  document_write: 'Write document',
  calendar_create_event: 'Create event',
  calendar_get_events: 'Get events',
  calendar_check_availability: 'Check availability',
  web_search: 'Search web',
  context_memo: 'Save preference',
  context_recall: 'Recall preference',
};

function stepSummary(step: ChainStepState): string {
  const { tool, args } = step;
  switch (tool) {
    case 'email_search': return `Search: "${String(args.query ?? '').slice(0, 40)}"`;
    case 'email_send': return `To: ${String(args.to ?? '').slice(0, 30)}`;
    case 'email_read_thread': return `Thread: ${String(args.thread_id ?? '').slice(0, 20)}`;
    case 'email_save_draft': return `Draft to: ${String(args.to ?? '').slice(0, 30)}`;
    case 'file_search': return `Search: "${String(args.query ?? '').slice(0, 40)}"`;
    case 'file_read': return `File: ${String(args.file_id ?? '').slice(0, 20)}`;
    case 'file_share': return `Share file`;
    case 'document_write': return `Doc: "${String(args.title ?? '').slice(0, 30)}"`;
    case 'calendar_create_event': return `Event: "${String(args.title ?? '').slice(0, 30)}"`;
    case 'calendar_get_events': return `Events: ${String(args.from ?? 'now')} – ${String(args.to ?? '')}`;
    case 'calendar_check_availability': return `Check: ${String(args.from ?? '')}`;
    case 'web_search': return `Search: "${String(args.query ?? '').slice(0, 40)}"`;
    case 'context_memo': return `Remember: ${String(args.key ?? '')} = ${String(args.value ?? '').slice(0, 30)}`;
    case 'context_recall': return `Recall: ${String(args.key ?? '')}`;
    default: return JSON.stringify(args).slice(0, 60);
  }
}

function parseResult(result: ChainStepState['result']): unknown {
  try {
    return JSON.parse(result.result);
  } catch {
    return { raw: result.result };
  }
}

interface Props {
  steps: ChainStepState[];
  isRunning: boolean;
  answer: string | null;
  error: string | null;
  stoppedReason: string | null;
  totalDurationMs: number;
  onCancel?: () => void;
}

export default function ChainProgress({
  steps,
  isRunning,
  answer,
  error,
  stoppedReason,
  totalDurationMs,
  onCancel,
}: Props) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (!isRunning && steps.length === 0 && !answer && !error) return null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          ) : error ? (
            <span className="h-2 w-2 rounded-full bg-red-500" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-green-500" />
          )}
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {isRunning
              ? 'Working...'
              : error
                ? 'Stopped with error'
                : `Done in ${(totalDurationMs / 1000).toFixed(1)}s`}
          </span>
          {steps.length > 0 && (
            <span className="text-[10px] text-gray-400">
              {steps.length} step{steps.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {steps.map((step, idx) => {
            const isExpanded = expandedStep === idx;
            const icon = TOOL_ICONS[step.tool] ?? '⚙️';
            const label = TOOL_LABELS[step.tool] ?? step.tool;

            return (
              <div key={idx} className="px-4 py-2">
                <button
                  className="w-full text-left flex items-center gap-3"
                  onClick={() => setExpandedStep(isExpanded ? null : idx)}
                >
                  {/* Step indicator */}
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    step.status === 'error'
                      ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                      : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                  )}>
                    {step.status === 'error' ? '✕' : idx + 1}
                  </div>

                  {/* Tool icon + name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{icon}</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {label}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 truncate mt-0.5">
                      {stepSummary(step)}
                    </div>
                  </div>

                  {/* Duration + expand toggle */}
                  <div className="shrink-0 flex items-center gap-2 text-[10px] text-gray-400">
                    {step.result.duration != null && (
                      <span>{step.result.duration}ms</span>
                    )}
                    <span>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-2 ml-9 space-y-2">
                    {step.reasoning && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                        "{step.reasoning.slice(0, 200)}"
                      </div>
                    )}
                    <pre className="text-[10px] bg-gray-100 dark:bg-gray-800 rounded-lg p-2 overflow-auto max-h-32 text-gray-700 dark:text-gray-300">
                      {JSON.stringify(parseResult(step.result), null, 2).slice(0, 1000)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}

          {/* Running indicator */}
          {isRunning && (
            <div className="px-4 py-2 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 shrink-0">
                <span className="text-[10px] animate-spin">⟳</span>
              </div>
              <span className="text-xs text-gray-400 animate-pulse">Thinking...</span>
            </div>
          )}
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Result</div>
          <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
            {answer}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 border-t border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
          <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
        </div>
      )}

      {/* Footer: stopped reason */}
      {stoppedReason === 'max_steps' && (
        <div className="px-4 py-1.5 border-t border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20">
          <div className="text-[10px] text-amber-600 dark:text-amber-400">
            ⚠ Reached maximum steps. Task may be incomplete.
          </div>
        </div>
      )}
    </div>
  );
}
