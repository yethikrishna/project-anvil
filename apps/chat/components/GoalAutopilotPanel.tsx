/**
 * GoalAutopilotPanel — AI-driven goal execution with visual plan.
 *
 * The "Anthropic killer" feature: user describes a complex goal,
 * AI generates an execution plan, shows it as an interactive checklist,
 * then executes each step with real-time progress and approval gates.
 *
 * Features:
 * - Natural language goal input
 * - AI-generated step-by-step plan with dependency graph
 * - Risk badges (read / write / send / delete)
 * - Per-step approval gates for high-risk actions
 * - Live execution progress with timing
 * - Result summary when done
 * - Cancel at any time
 *
 * Powered by @anvil/ai GoalPlanner via /api/goal-planner SSE endpoint.
 */

'use client';

import { useState, useCallback } from 'react';
import { cn } from '@anvil/ui';
import { useGoalPlanner } from '@/lib/use-goal-planner';
import type { PlanTask } from '@/lib/use-goal-planner';

export type { TaskStatus, TaskRisk, PlanTask, GoalPlan } from '@/lib/use-goal-planner';

interface Props {
  onSendMessage: (msg: string) => void;
  onClose: () => void;
  className?: string;
}

// ── Risk styling ────────────────────────────────────────────────────────────

type TaskRisk = 'read' | 'write' | 'send' | 'delete';
type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'awaiting_approval';

const RISK_CONFIG: Record<TaskRisk, { label: string; color: string; icon: string }> = {
  read:   { label: 'Read',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',     icon: '👁️' },
  write:  { label: 'Write',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300', icon: '✏️' },
  send:   { label: 'Send',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300', icon: '📤' },
  delete: { label: 'Delete', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',         icon: '🗑️' },
};

const STATUS_CONFIG: Record<TaskStatus, { icon: string; color: string }> = {
  pending:            { icon: '○',  color: 'text-gray-400' },
  running:            { icon: '⟳',  color: 'text-blue-500' },
  done:               { icon: '✓',  color: 'text-green-500' },
  failed:             { icon: '✗',  color: 'text-red-500' },
  skipped:            { icon: '↷',  color: 'text-gray-400' },
  awaiting_approval:  { icon: '⏸',  color: 'text-amber-500' },
};

// ── Predefined goals ────────────────────────────────────────────────────────

const GOAL_TEMPLATES = [
  { icon: '📧', label: 'Inbox Zero',    goal: 'Scan my unread emails, categorize them by urgency, archive newsletters, and draft replies for the 3 most important emails' },
  { icon: '📅', label: 'Weekly Prep',   goal: 'Find my calendar events for next week, check if any have missing info, and create a preparation doc with agenda + attendees' },
  { icon: '📁', label: 'Project Brief', goal: 'Search Drive for files related to my current project, summarize key documents, and create an exec brief doc' },
  { icon: '🤝', label: 'Meeting Follow-up', goal: 'Find emails and notes from my last meeting, extract action items, create a follow-up email draft, and add tasks to my calendar' },
];

// ── Task Step ───────────────────────────────────────────────────────────────

function TaskStep({
  task,
  index,
  onApprove,
  onReject,
}: {
  task: PlanTask;
  index: number;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskCfg = RISK_CONFIG[task.risk as TaskRisk] ?? RISK_CONFIG.read;
  const statusCfg = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.pending;
  const duration = task.startedAt && task.completedAt
    ? ((task.completedAt - task.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200',
        task.status === 'running'           && 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/10',
        task.status === 'done'              && 'border-green-200 dark:border-green-800/40 bg-green-50/30 dark:bg-green-950/10',
        task.status === 'failed'            && 'border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-950/10',
        task.status === 'awaiting_approval' && 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10',
        task.status === 'pending'           && 'border-gray-200 dark:border-gray-700',
        task.status === 'skipped'           && 'border-gray-100 dark:border-gray-800 opacity-50',
      )}
    >
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Step number / status */}
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', statusCfg.color)}>
          <span className="text-sm font-bold">
            {task.status === 'running' ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : task.status === 'done' ? '✓' : task.status === 'failed' ? '✗' : task.status === 'awaiting_approval' ? '!' : index + 1}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{task.title}</p>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', riskCfg.color)}>
              {riskCfg.icon} {riskCfg.label}
            </span>
            {duration && (
              <span className="text-xs text-gray-400 tabular-nums">{duration}s</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.description}</p>

          {/* Error */}
          {task.status === 'failed' && task.error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">{task.error}</p>
          )}
        </div>

        {/* Expand chevron */}
        <svg
          className={cn('w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform', expanded && 'rotate-180')}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded: approval gate */}
      {task.status === 'awaiting_approval' && (
        <div className="px-3 pb-3 border-t border-amber-200 dark:border-amber-800/40 pt-2">
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2 font-medium">
            ⚠️ This action requires your approval before executing.
          </p>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 text-xs font-mono text-gray-600 dark:text-gray-300 mb-2 max-h-20 overflow-auto">
            {JSON.stringify(task.args, null, 2)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(task.id); }}
              className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              ✓ Approve
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReject(task.id); }}
              className="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950/40 dark:hover:bg-red-900/40 dark:text-red-300 rounded-lg transition-colors"
            >
              ✗ Skip
            </button>
          </div>
        </div>
      )}

      {/* Expanded: result */}
      {expanded && task.status === 'done' && task.result && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
          <p className="text-xs text-gray-400 mb-1">Result:</p>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 text-xs font-mono text-gray-600 dark:text-gray-300 max-h-32 overflow-auto">
            {typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────

function PlanProgress({ tasks }: { tasks: PlanTask[] }) {
  if (!tasks.length) return null;
  const done = tasks.filter(t => t.status === 'done' || t.status === 'skipped').length;
  const pct = Math.round((done / tasks.length) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{done}/{tasks.length} steps</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function GoalAutopilotPanel({ onSendMessage, onClose, className }: Props) {
  const [goal, setGoal] = useState('');
  const planner = useGoalPlanner();

  const handleStart = useCallback(() => {
    if (!goal.trim()) return;
    planner.start(goal.trim());
  }, [goal, planner]);

  const handleDone = useCallback(() => {
    if (planner.summary) {
      // Inject the summary into the main conversation
      onSendMessage(`[Autopilot complete] ${planner.summary}`);
    }
    planner.reset();
    setGoal('');
  }, [planner, onSendMessage]);

  const phase = planner.phase;

  return (
    <div className={cn('bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[85vh] w-full max-w-lg', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-lg flex-shrink-0">
          🚀
        </div>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">AI Autopilot</h3>
          <p className="text-xs text-gray-500">Describe a goal — AI plans and executes it</p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Input phase */}
        {phase === 'idle' && (
          <>
            {/* Goal templates */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Quick goals
              </p>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    onClick={() => setGoal(t.goal)}
                    className={cn(
                      'text-left p-3 rounded-xl border-2 transition-all',
                      goal === t.goal
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                    )}
                  >
                    <p className="text-base mb-1">{t.icon}</p>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{t.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom goal input */}
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">
                Or describe your goal
              </label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="e.g. Find all unread emails from last week, summarize the important ones, and draft replies for action items…"
                rows={3}
                className={cn(
                  'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
                  'bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white',
                  'placeholder:text-gray-400 p-3 focus:outline-none focus:ring-2 focus:ring-violet-500',
                )}
              />
            </div>

            {planner.error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
                {planner.error}
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={!goal.trim()}
              className={cn(
                'w-full py-3 rounded-xl font-semibold text-sm transition-all',
                goal.trim()
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed',
              )}
            >
              🚀 Launch Autopilot
            </button>
          </>
        )}

        {/* Planning phase */}
        {phase === 'planning' && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Analyzing your goal…</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 text-center max-w-xs">
              Breaking it into executable steps with dependencies
            </p>
            <button
              onClick={planner.cancel}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-2"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Executing phase */}
        {(phase === 'executing' || phase === 'done') && planner.plan && (
          <>
            {/* Reasoning */}
            {planner.plan.reasoning && (
              <div className="bg-violet-50 dark:bg-violet-950/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">🧠 Plan reasoning</p>
                <p className="text-xs text-violet-600 dark:text-violet-400 leading-relaxed">{planner.plan.reasoning}</p>
              </div>
            )}

            {/* Progress bar */}
            <PlanProgress tasks={planner.plan.tasks} />

            {/* Steps */}
            <div className="space-y-2">
              {planner.plan.tasks.map((task, i) => (
                <TaskStep
                  key={task.id}
                  task={task}
                  index={i}
                  onApprove={planner.approveTask}
                  onReject={planner.rejectTask}
                />
              ))}
            </div>

            {phase === 'executing' && (
              <button
                onClick={planner.cancel}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-colors border border-gray-200 dark:border-gray-700"
              >
                ✕ Cancel execution
              </button>
            )}

            {phase === 'done' && planner.summary && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">✅ Complete</p>
                <p className="text-xs text-green-600 dark:text-green-400">{planner.summary}</p>
              </div>
            )}

            {phase === 'done' && (
              <div className="flex gap-2">
                <button
                  onClick={handleDone}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  Add to conversation
                </button>
                <button
                  onClick={() => { planner.reset(); setGoal(''); }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  New goal
                </button>
              </div>
            )}
          </>
        )}

        {/* Failed phase */}
        {phase === 'failed' && (
          <div className="flex flex-col items-center py-6 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center text-3xl">
              ❌
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Execution failed</p>
              <p className="text-sm text-red-500 mt-1">{planner.error}</p>
            </div>
            <button
              onClick={() => { planner.reset(); }}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
