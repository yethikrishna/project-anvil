/**
 * AgentActivityMonitor — live panel showing what the AI agent is doing.
 *
 * Shows a scrolling log of:
 * - AI reasoning steps ("Scanning inbox...", "Analyzing 42 emails...")
 * - Tool calls with args + results
 * - Timing metrics per step
 * - Total tokens / cost estimate
 * - Stop button
 *
 * This makes agent mode feel like watching a capable human at work,
 * not a black box spinner.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@anvil/ui';
import type { ToolCallResult } from '@/lib/types';

export interface AgentStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'decision' | 'complete' | 'error';
  label: string;
  detail?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  startedAt: number;
  completedAt?: number;
  tokenCount?: number;
}

interface Props {
  steps: AgentStep[];
  isRunning: boolean;
  onStop?: () => void;
  totalTokens?: number;
  className?: string;
  /** Collapsible — default expanded */
  defaultExpanded?: boolean;
}

const STEP_ICONS: Record<AgentStep['type'], string> = {
  thinking: '🧠',
  tool_call: '🔧',
  tool_result: '📥',
  decision: '⚡',
  complete: '✅',
  error: '❌',
};

const TOOL_ICONS: Record<string, string> = {
  email_search: '📧',
  email_send: '📤',
  email_read_thread: '📨',
  email_save_draft: '✏️',
  email_archive: '📦',
  file_search: '🔍',
  file_read: '📄',
  file_share: '🔗',
  document_write: '📝',
  calendar_create_event: '📅',
  calendar_check_availability: '🕐',
  calendar_update_event: '✏️',
  calendar_upcoming: '📆',
  web_search: '🌐',
  docs_create: '📝',
  docs_search: '🔍',
  default: '🔧',
};

function getToolIcon(tool?: string): string {
  if (!tool) return '🔧';
  return TOOL_ICONS[tool] ?? TOOL_ICONS.default;
}

function formatDuration(startedAt: number, completedAt?: number): string {
  const ms = (completedAt ?? Date.now()) - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return '';
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => {
      const key = k.replace(/_/g, ' ');
      const val = String(v).slice(0, 60);
      return `${key}: ${val}${String(v).length > 60 ? '…' : ''}`;
    })
    .join(' · ');
}

function parseResultPreview(result?: string): string {
  if (!result) return '';
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return `${parsed.length} result${parsed.length !== 1 ? 's' : ''} returned`;
    }
    if (parsed.error) return `Error: ${parsed.error}`;
    if (parsed.id) return `Created (id: ${String(parsed.id).slice(0, 12)})`;
    return 'Done';
  } catch {
    const preview = result.slice(0, 80).replace(/\n/g, ' ');
    return preview + (result.length > 80 ? '…' : '');
  }
}

export default function AgentActivityMonitor({
  steps,
  isRunning,
  onStop,
  totalTokens,
  className,
  defaultExpanded = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const startTime = steps[0]?.startedAt ?? Date.now();
  const runningStep = steps.find(s => s.status === 'running');
  const completedSteps = steps.filter(s => s.status === 'done' || s.status === 'error');
  const toolSteps = steps.filter(s => s.type === 'tool_call' || s.type === 'tool_result');

  // Auto-scroll to bottom when new steps come in
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [steps, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isNearBottom);
  }, []);

  if (steps.length === 0 && !isRunning) return null;

  // Compact pulse badge when collapsed
  if (!expanded) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer transition-colors select-none',
          isRunning
            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
            : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
          className,
        )}
        onClick={() => setExpanded(true)}
      >
        {isRunning && (
          <span className="flex gap-[2px] items-end h-3 shrink-0">
            {[0, 100, 200].map(delay => (
              <span
                key={delay}
                className="w-[2px] bg-indigo-500 rounded-full animate-bounce"
                style={{ animationDelay: `${delay}ms`, height: delay === 100 ? '8px' : '4px' }}
              />
            ))}
          </span>
        )}
        {!isRunning && (
          <span className="text-xs">✅</span>
        )}
        <span className="text-xs font-medium">
          {isRunning
            ? `Agent running · ${completedSteps.length} steps done`
            : `Agent done · ${completedSteps.length} steps · ${formatDuration(startTime, steps[steps.length - 1]?.completedAt)}`
          }
        </span>
        <span className="text-[10px] text-gray-400 ml-auto">▲ expand</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border overflow-hidden',
        isRunning
          ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        {/* Live pulse */}
        {isRunning && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
          </span>
        )}
        {!isRunning && <span className="text-xs shrink-0">✅</span>}

        <span className={cn('text-xs font-semibold', isRunning ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300')}>
          {isRunning ? 'Agent running' : 'Agent complete'}
        </span>

        {/* Stats */}
        <div className="flex items-center gap-2 ml-2 text-[10px] text-gray-500 dark:text-gray-400">
          <span>{completedSteps.length}/{steps.length} steps</span>
          {toolSteps.length > 0 && (
            <span>· {Math.ceil(toolSteps.length / 2)} tools</span>
          )}
          <span>· {formatDuration(startTime)}</span>
          {totalTokens && <span>· ~{totalTokens.toLocaleString()} tokens</span>}
        </div>

        {/* Controls */}
        <div className="ml-auto flex items-center gap-1">
          {!autoScroll && isRunning && (
            <button
              onClick={() => { setAutoScroll(true); logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
            >
              ↓ Follow
            </button>
          )}
          {isRunning && onStop && (
            <button
              onClick={onStop}
              className="text-[10px] text-red-500 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium transition-colors"
            >
              ⏹ Stop
            </button>
          )}
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Step log */}
      <div
        ref={logRef}
        onScroll={handleScroll}
        className="max-h-72 overflow-y-auto"
        style={{ scrollBehavior: 'smooth' }}
      >
        {steps.map((step, idx) => (
          <StepRow key={step.id} step={step} isLast={idx === steps.length - 1} />
        ))}

        {/* Spinner for running step */}
        {isRunning && !runningStep && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400">
            <span className="animate-spin text-sm">⚙</span>
            <span>Processing…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const [detailExpanded, setDetailExpanded] = useState(false);
  const hasExpandable = step.type === 'tool_result' && !!step.result && step.result.length > 100;

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-3 py-2 text-xs border-b border-gray-100 dark:border-gray-800/50 last:border-0',
        step.status === 'running' ? 'bg-indigo-50/80 dark:bg-indigo-950/30' : '',
        step.status === 'error' ? 'bg-red-50 dark:bg-red-950/20' : '',
      )}
    >
      {/* Icon + connector */}
      <div className="flex flex-col items-center shrink-0 mt-0.5">
        <div className={cn(
          'w-5 h-5 rounded-full flex items-center justify-center text-[10px]',
          step.status === 'running' ? 'bg-indigo-100 dark:bg-indigo-900 animate-pulse' : '',
          step.status === 'done' ? 'bg-green-50 dark:bg-green-950/30' : '',
          step.status === 'error' ? 'bg-red-100 dark:bg-red-900/40' : '',
          step.status === 'pending' ? 'bg-gray-100 dark:bg-gray-800 opacity-50' : '',
        )}>
          {step.status === 'running'
            ? <span className="animate-spin text-indigo-500">⚙</span>
            : step.type === 'tool_call' ? getToolIcon(step.tool)
            : STEP_ICONS[step.type]
          }
        </div>
        {!isLast && (
          <div className="w-px h-full min-h-2 bg-gray-200 dark:bg-gray-700 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className={cn(
            'font-medium',
            step.status === 'running' ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300',
            step.status === 'error' ? 'text-red-600 dark:text-red-400' : '',
          )}>
            {step.label}
          </span>
          {step.completedAt && (
            <span className="text-gray-400 text-[10px] shrink-0">
              {formatDuration(step.startedAt, step.completedAt)}
            </span>
          )}
        </div>

        {/* Args preview */}
        {step.args && Object.keys(step.args).length > 0 && (
          <p className="text-gray-400 dark:text-gray-500 mt-0.5 truncate text-[11px]">
            {formatArgs(step.args)}
          </p>
        )}

        {/* Result preview */}
        {step.type === 'tool_result' && step.result && !detailExpanded && (
          <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-[11px]">
            {parseResultPreview(step.result)}
            {hasExpandable && (
              <button
                onClick={() => setDetailExpanded(true)}
                className="ml-1 text-indigo-500 hover:text-indigo-700 hover:underline"
              >
                see full ▼
              </button>
            )}
          </p>
        )}

        {/* Expanded result */}
        {detailExpanded && step.result && (
          <div className="mt-1">
            <pre className="text-[10px] bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto max-h-36 text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {step.result.slice(0, 2000)}{step.result.length > 2000 ? '\n…(truncated)' : ''}
            </pre>
            <button
              onClick={() => setDetailExpanded(false)}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 mt-0.5"
            >
              collapse ▲
            </button>
          </div>
        )}

        {/* Detail text */}
        {step.detail && step.type !== 'tool_result' && (
          <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-[11px]">{step.detail}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Helper: convert ToolCallResult[] → AgentStep[] for display.
 * Call this from StreamingMessage or the chat page.
 */
export function toolCallsToAgentSteps(toolCalls: ToolCallResult[]): AgentStep[] {
  const steps: AgentStep[] = [];

  for (const tc of toolCalls) {
    // Tool call step
    steps.push({
      id: `call-${tc.id}`,
      type: 'tool_call',
      label: formatToolName(tc.tool),
      tool: tc.tool,
      args: tc.args,
      status: tc.status === 'running' ? 'running' : 'done',
      startedAt: Date.now() - (tc.duration ?? 0),
      completedAt: tc.status !== 'running' ? Date.now() : undefined,
    });

    // Tool result step (only when complete)
    if (tc.status !== 'running') {
      steps.push({
        id: `result-${tc.id}`,
        type: 'tool_result',
        label: tc.status === 'error' ? `${formatToolName(tc.tool)} failed` : `${formatToolName(tc.tool)} returned`,
        tool: tc.tool,
        result: tc.result,
        status: tc.status === 'error' ? 'error' : 'done',
        startedAt: Date.now() - (tc.duration ?? 0) / 2,
        completedAt: Date.now(),
      });
    }
  }

  return steps;
}

function formatToolName(tool: string): string {
  return tool
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
