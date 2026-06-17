/**
 * AgentPanel — displays an in-progress or completed autonomous agent plan.
 *
 * Shows:
 * - Plan goal + status badge
 * - Action list with status icons and results
 * - Approval gates with Approve/Reject buttons
 * - Final summary on completion
 *
 * Used in chat messages whenever the AI triggers an agent run
 * (high-autonomy multi-step tasks like "triage inbox" or "schedule Q3 meetings").
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';
import type { AgentPlan, AgentAction } from '@anvil/ai';

// ── Status styles ──

const STATUS_STYLES: Record<string, { icon: string; cls: string; label: string }> = {
  idle: { icon: '○', cls: 'text-gray-400', label: 'Waiting' },
  running: { icon: '⟳', cls: 'text-blue-500 animate-spin', label: 'Running' },
  waiting_approval: { icon: '⏸', cls: 'text-amber-500', label: 'Needs approval' },
  completed: { icon: '✓', cls: 'text-green-500', label: 'Done' },
  failed: { icon: '✗', cls: 'text-red-500', label: 'Failed' },
};

const ACTION_STATUS_ICONS: Record<string, { icon: string; cls: string }> = {
  pending: { icon: '○', cls: 'text-gray-300 dark:text-gray-600' },
  approved: { icon: '✓', cls: 'text-green-400' },
  rejected: { icon: '✗', cls: 'text-red-400' },
  executing: { icon: '⟳', cls: 'text-blue-500 animate-spin' },
  completed: { icon: '✓', cls: 'text-green-500' },
  failed: { icon: '✗', cls: 'text-red-500' },
  rolled_back: { icon: '↩', cls: 'text-orange-400' },
};

const RISK_BADGES: Record<string, string> = {
  low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  destructive: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

interface ApprovalPending {
  planId: string;
  actionId: string;
  action: AgentAction;
}

interface Props {
  /** Initial plan from plan_created event */
  plan: AgentPlan;
  /** Live updates from SSE stream */
  events?: AgentEvent[];
  /** Called when user approves/rejects an action */
  onDecide?: (planId: string, actionId: string, decision: 'approved' | 'rejected') => void;
  className?: string;
}

export interface AgentEvent {
  type: 'plan_created' | 'action_start' | 'action_complete' | 'action_failed' |
        'approval_required' | 'plan_complete' | 'plan_failed' | 'error';
  planId?: string;
  actionId?: string;
  plan?: AgentPlan;
  action?: AgentAction;
  result?: unknown;
  error?: string;
  message?: string;
}

export default function AgentPanel({ plan: initialPlan, events = [], onDecide, className }: Props) {
  const [plan, setPlan] = useState<AgentPlan>(initialPlan);
  const [actionResults, setActionResults] = useState<Map<string, unknown>>(new Map());
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalPending[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Apply SSE events to local state
  useEffect(() => {
    for (const event of events) {
      switch (event.type) {
        case 'plan_created':
        case 'plan_complete':
        case 'plan_failed':
          if (event.plan) setPlan(event.plan);
          break;
        case 'action_start':
          setPlan(prev => ({
            ...prev,
            actions: prev.actions.map(a =>
              a.id === event.actionId ? { ...a, status: 'executing' } : a,
            ),
          }));
          break;
        case 'action_complete':
          setPlan(prev => ({
            ...prev,
            actions: prev.actions.map(a =>
              a.id === event.actionId ? { ...a, status: 'completed', result: event.result } : a,
            ),
          }));
          if (event.actionId) {
            setActionResults(prev => new Map(prev).set(event.actionId!, event.result));
          }
          break;
        case 'action_failed':
          setPlan(prev => ({
            ...prev,
            actions: prev.actions.map(a =>
              a.id === event.actionId ? { ...a, status: 'failed', error: event.error } : a,
            ),
          }));
          break;
        case 'approval_required':
          if (event.action && event.planId && event.actionId) {
            setPendingApprovals(prev => {
              const exists = prev.some(p => p.actionId === event.actionId);
              if (exists) return prev;
              return [...prev, { planId: event.planId!, actionId: event.actionId!, action: event.action! }];
            });
            setPlan(prev => ({ ...prev, status: 'waiting_approval' }));
          }
          break;
      }
    }
  }, [events]);

  const handleDecide = useCallback((planId: string, actionId: string, decision: 'approved' | 'rejected') => {
    setPendingApprovals(prev => prev.filter(p => p.actionId !== actionId));
    setPlan(prev => ({
      ...prev,
      status: 'running',
      actions: prev.actions.map(a =>
        a.id === actionId ? { ...a, status: decision === 'approved' ? 'approved' : 'rejected' } : a,
      ),
    }));
    onDecide?.(planId, actionId, decision);
  }, [onDecide]);

  const planStatus = STATUS_STYLES[plan.status] ?? STATUS_STYLES.idle;
  const completedCount = plan.actions.filter(a => a.status === 'completed').length;
  const totalCount = plan.actions.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className={cn(
      'rounded-xl border bg-white dark:bg-gray-900 overflow-hidden',
      plan.status === 'waiting_approval'
        ? 'border-amber-300 dark:border-amber-700'
        : plan.status === 'failed'
        ? 'border-red-200 dark:border-red-800'
        : plan.status === 'completed'
        ? 'border-green-200 dark:border-green-800'
        : 'border-gray-200 dark:border-gray-800',
      className,
    )}>
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="mt-0.5 shrink-0">
          <span className={cn('text-base', planStatus.cls)}>{planStatus.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
              Agent Task
            </span>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              planStatus.cls,
              plan.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20' :
              plan.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20' :
              plan.status === 'waiting_approval' ? 'bg-amber-50 dark:bg-amber-900/20' :
              'bg-blue-50 dark:bg-blue-900/20',
            )}>
              {planStatus.label}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 font-medium leading-snug">
            {plan.goal}
          </p>
        </div>
        <div className="text-[10px] text-gray-400 shrink-0">
          {completedCount}/{totalCount}
        </div>
      </div>

      {/* Progress bar */}
      {plan.status === 'running' && (
        <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Pending approvals (highlighted) */}
      {pendingApprovals.length > 0 && (
        <div className="p-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          {pendingApprovals.map(pending => (
            <div key={pending.actionId} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-sm shrink-0">⚠️</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    Approval required
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {pending.action.description}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', RISK_BADGES[pending.action.risk])}>
                      {pending.action.risk} risk
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecide(pending.planId, pending.actionId, 'approved')}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => handleDecide(pending.planId, pending.actionId, 'rejected')}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors"
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action list */}
      <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
        {plan.actions.map((action, i) => {
          const iconData = ACTION_STATUS_ICONS[action.status] ?? ACTION_STATUS_ICONS.pending;
          const result = actionResults.get(action.id);
          const isExpanded = expanded === action.id;

          return (
            <div key={action.id}>
              <button
                onClick={() => setExpanded(isExpanded ? null : action.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors',
                  action.status === 'executing' ? 'bg-blue-50/50 dark:bg-blue-950/20' :
                  action.status === 'failed' ? 'bg-red-50/50 dark:bg-red-950/20' :
                  'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                )}
              >
                <span className="text-[11px] shrink-0 w-4 text-center">
                  <span className={iconData.cls}>{iconData.icon}</span>
                </span>
                <span className="text-xs text-gray-400 shrink-0">{i + 1}</span>
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">
                  {action.description}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn('text-[9px] px-1 py-0.5 rounded', RISK_BADGES[action.risk])}>
                    {action.risk}
                  </span>
                  {(result || action.error) && (
                    <span className="text-[10px] text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  )}
                </div>
              </button>

              {isExpanded && (result || action.error) && (
                <div className="px-4 pb-2.5 pt-1">
                  {action.error ? (
                    <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/30 rounded p-2">
                      Error: {action.error}
                    </p>
                  ) : (
                    <pre className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                      {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion footer */}
      {plan.status === 'completed' && (
        <div className="px-4 py-2.5 bg-green-50 dark:bg-green-950/20 border-t border-green-100 dark:border-green-900/50">
          <p className="text-xs text-green-700 dark:text-green-300">
            ✓ All {totalCount} action{totalCount !== 1 ? 's' : ''} completed successfully
          </p>
        </div>
      )}

      {plan.status === 'failed' && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/50">
          <p className="text-xs text-red-600 dark:text-red-400">
            ✗ {plan.actions.filter(a => a.status === 'failed').length} action(s) failed
          </p>
        </div>
      )}
    </div>
  );
}
