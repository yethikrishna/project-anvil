/**
 * useGoalPlanner — React hook for AI-driven goal execution.
 *
 * Connects the GoalAutopilotPanel to the /api/goal-planner SSE endpoint.
 * Streams plan creation and execution events in real time.
 *
 * Usage:
 * ```tsx
 * const planner = useGoalPlanner();
 * planner.start("Summarize my inbox and schedule time to respond");
 * ```
 */

import { useState, useCallback, useRef } from 'react';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'awaiting_approval';
export type TaskRisk   = 'read' | 'write' | 'send' | 'delete';

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  dependsOn: string[];
  status: TaskStatus;
  risk: TaskRisk;
  requiresApproval: boolean;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface GoalPlan {
  id: string;
  goal: string;
  reasoning: string;
  tasks: PlanTask[];
  status: 'planning' | 'executing' | 'done' | 'failed' | 'cancelled';
  createdAt: number;
  completedAt?: number;
  summary?: string;
}

export type PlannerPhase = 'idle' | 'planning' | 'executing' | 'done' | 'failed';

interface PlannerState {
  phase: PlannerPhase;
  plan: GoalPlan | null;
  summary: string;
  error: string;
}

export interface UsePlannerReturn extends PlannerState {
  start: (goal: string) => Promise<void>;
  cancel: () => void;
  approveTask: (taskId: string) => void;
  rejectTask:  (taskId: string) => void;
  reset: () => void;
}

const INITIAL: PlannerState = { phase: 'idle', plan: null, summary: '', error: '' };

export function useGoalPlanner(): UsePlannerReturn {
  const [state, setState] = useState<PlannerState>(INITIAL);
  const cancelRef = useRef(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const updateTask = useCallback((taskId: string, update: Partial<PlanTask>) => {
    setState(prev => {
      if (!prev.plan) return prev;
      return {
        ...prev,
        plan: {
          ...prev.plan,
          tasks: prev.plan.tasks.map(t => t.id === taskId ? { ...t, ...update } : t),
        },
      };
    });
  }, []);

  const handlePlanEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case 'thinking':
        // Thinking events: just informational — could surface in UI later
        break;

      case 'plan_created': {
        const plan = event.plan as GoalPlan;
        setState(prev => ({ ...prev, phase: 'executing', plan }));
        break;
      }

      case 'task_started':
        updateTask(event.taskId as string, { status: 'running', startedAt: Date.now() });
        break;

      case 'task_done':
        updateTask(event.taskId as string, {
          status: 'done',
          result: event.result,
          completedAt: Date.now(),
        });
        break;

      case 'task_failed':
        updateTask(event.taskId as string, {
          status: 'failed',
          error: event.error as string,
          completedAt: Date.now(),
        });
        break;

      case 'task_approval_needed':
        updateTask((event.task as PlanTask).id, { status: 'awaiting_approval' });
        break;

      case 'plan_complete':
        setState(prev => ({
          ...prev,
          phase: 'done',
          plan: event.plan as GoalPlan,
          summary: event.summary as string,
        }));
        break;

      case 'plan_failed':
        setState(prev => ({
          ...prev,
          phase: 'failed',
          plan: event.plan as GoalPlan,
          error: event.error as string,
        }));
        break;
    }
  }, [updateTask]);

  const start = useCallback(async (goal: string) => {
    cancelRef.current = false;
    setState({ phase: 'planning', plan: null, summary: '', error: '' });

    try {
      const resp = await fetch('/api/goal-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, userId: 'default' }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` })) as { error?: string };
        throw new Error(err.error ?? `Server error ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');
      readerRef.current = reader;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (cancelRef.current) { reader.cancel(); break; }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data) as Record<string, unknown>;
            if (!cancelRef.current) handlePlanEvent(event);
          } catch { /* ignore parse errors */ }
        }
      }

      // If we finished without a plan_complete / plan_failed event, set idle
      if (!cancelRef.current) {
        setState(prev => {
          if (prev.phase === 'executing' || prev.phase === 'planning') {
            return { ...prev, phase: 'done', summary: 'Execution complete.' };
          }
          return prev;
        });
      }
    } catch (err) {
      if (!cancelRef.current) {
        setState(prev => ({
          ...prev,
          phase: 'failed',
          error: err instanceof Error ? err.message : 'Planning failed',
        }));
      }
    }
  }, [handlePlanEvent]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    setState(prev => ({
      ...prev,
      phase: 'idle',
      plan: prev.plan ? { ...prev.plan, status: 'cancelled' } : null,
    }));
  }, []);

  const approveTask = useCallback((taskId: string) => {
    updateTask(taskId, { status: 'running', startedAt: Date.now() });
    // In a full implementation, we'd send an approval signal back to the server.
    // For now, the planner is server-side and approval gates let tasks proceed.
  }, [updateTask]);

  const rejectTask = useCallback((taskId: string) => {
    updateTask(taskId, { status: 'skipped' });
  }, [updateTask]);

  const reset = useCallback(() => {
    cancelRef.current = true;
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    setState(INITIAL);
  }, []);

  return { ...state, start, cancel, approveTask, rejectTask, reset };
}
