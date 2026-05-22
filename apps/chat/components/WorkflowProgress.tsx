/**
 * WorkflowProgress — visualizes multi-step tool chain execution.
 *
 * Shows each step with:
 * - Tool icon and name
 * - Status (pending, running, success, error)
 * - Duration
 * - Expandable result preview
 * - Overall progress bar
 * - Summary on completion
 */

'use client';

import { useState } from 'react';
import { cn } from '@anvil/ui';

export interface WorkflowStepResult {
  name: string;
  tool: string;
  success: boolean;
  result: string;
  duration: number;
}

interface Props {
  steps: WorkflowStepResult[];
  isRunning: boolean;
  currentStep?: number;
  summary?: string;
  totalDurationMs?: number;
}

const TOOL_COLORS: Record<string, string> = {
  email_search: 'border-l-blue-400',
  email_send: 'border-l-blue-500',
  email_read_thread: 'border-l-blue-400',
  email_save_draft: 'border-l-blue-300',
  file_search: 'border-l-green-400',
  file_read: 'border-l-green-500',
  file_share: 'border-l-green-400',
  document_write: 'border-l-purple-400',
  calendar_create_event: 'border-l-orange-400',
  calendar_check_availability: 'border-l-orange-300',
  web_search: 'border-l-cyan-400',
};

export default function WorkflowProgress({
  steps,
  isRunning,
  currentStep,
  summary,
  totalDurationMs,
}: Props) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const completedSteps = steps.filter(s => s.success).length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;

  return (
    <div className="mx-4 my-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30">
        <span className="text-sm">🔗</span>
        <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
          Workflow
        </span>
        <span className="text-[10px] text-indigo-500 ml-1">
          {completedSteps}/{totalSteps} steps
        </span>

        {isRunning && (
          <span className="text-[10px] text-indigo-500 animate-pulse ml-auto flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
            Running step {Math.min((currentStep ?? 0) + 1, totalSteps)}...
          </span>
        )}

        {!isRunning && summary && (
          <span className="text-[10px] text-green-600 dark:text-green-400 ml-auto">
            ✓ {summary}
          </span>
        )}

        {!isRunning && totalDurationMs && (
          <span className="text-[10px] text-gray-400 ml-2">
            {totalDurationMs < 1000 ? `${totalDurationMs}ms` : `${(totalDurationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-indigo-100 dark:bg-indigo-900">
        <div
          className="h-full bg-indigo-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="divide-y divide-indigo-100 dark:divide-indigo-900">
        {steps.map((step, i) => {
          const isCurrent = isRunning && i === currentStep;
          const color = TOOL_COLORS[step.tool] ?? 'border-l-gray-300';

          return (
            <div key={i} className={cn('border-l-2', color)}>
              <button
                onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-indigo-100/30 dark:hover:bg-indigo-900/10 transition-colors"
              >
                {/* Status */}
                <span className={cn(
                  'text-xs w-4 text-center',
                  step.success && 'text-green-500',
                  isCurrent && 'text-blue-500 animate-pulse',
                  !step.success && !isCurrent && 'text-red-500',
                )}>
                  {step.success ? '✓' : isCurrent ? '⟳' : '✗'}
                </span>

                {/* Name */}
                <span className={cn(
                  'text-xs font-medium flex-1',
                  step.success && 'text-gray-700 dark:text-gray-300',
                  isCurrent && 'text-indigo-600 dark:text-indigo-400',
                  !step.success && !isCurrent && 'text-red-600 dark:text-red-400',
                )}>
                  {step.name}
                </span>

                {/* Duration */}
                {step.duration > 0 && (
                  <span className="text-[10px] text-gray-400">
                    {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(1)}s`}
                  </span>
                )}

                {/* Expand */}
                <span className="text-[10px] text-gray-300 dark:text-gray-600">
                  {expandedStep === i ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded result */}
              {expandedStep === i && (
                <div className="px-4 pb-2">
                  <pre className="text-[10px] font-mono bg-white dark:bg-gray-900 rounded-lg p-2.5 max-h-36 overflow-auto whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                    {(() => {
                      try {
                        const parsed = JSON.parse(step.result);
                        const formatted = JSON.stringify(parsed, null, 2);
                        return formatted.length > 400
                          ? formatted.slice(0, 400) + '\n...'
                          : formatted;
                      } catch {
                        return step.result.slice(0, 400);
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {/* Pending step */}
        {isRunning && currentStep !== undefined && currentStep >= steps.length && (
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="text-xs animate-pulse text-indigo-400">⟳</span>
            <span className="text-xs text-indigo-400 animate-pulse">
              Executing next step...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
