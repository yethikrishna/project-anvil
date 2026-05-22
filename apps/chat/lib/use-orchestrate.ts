/**
 * useOrchestrate — React hook for cross-app workflow execution.
 *
 * Connects to /api/orchestrate SSE endpoint and tracks multi-step
 * tool chain progress with state management.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { WorkflowStepResult } from '@/components/WorkflowProgress';
import { parseSSEStream } from './sse-parser';

export interface WorkflowRun {
  id: string;
  type: string;
  steps: WorkflowStepResult[];
  isRunning: boolean;
  summary: string;
  totalDurationMs: number;
  error: string | null;
}

interface UseOrchestrateReturn {
  activeWorkflow: WorkflowRun | null;
  execute: (workflow: string, params: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
}

export function useOrchestrate(): UseOrchestrateReturn {
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (
    workflow: string,
    params: Record<string, unknown>,
  ) => {
    const id = crypto.randomUUID();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setActiveWorkflow({
      id,
      type: workflow,
      steps: [],
      isRunning: true,
      summary: '',
      totalDurationMs: 0,
      error: null,
    });

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ workflow, params }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      await parseSSEStream(res, (event) => {
        setActiveWorkflow(prev => {
          if (!prev) return prev;

          switch (event.event) {
            case 'start':
              return { ...prev, type: (event.data as { workflow: string })?.workflow ?? workflow };

            case 'progress': {
              const data = event.data as { step?: number; message?: string };
              if (data.step !== undefined) {
                const steps = [...prev.steps];
                // Ensure array is long enough
                while (steps.length <= data.step) {
                  steps.push({
                    name: '',
                    tool: '',
                    success: false,
                    result: '',
                    duration: 0,
                  });
                }
                steps[data.step] = {
                  ...steps[data.step],
                  name: data.message ?? steps[data.step].name,
                };
                return { ...prev, steps };
              }
              return prev;
            }

            case 'done': {
              const data = event.data as {
                success?: boolean;
                steps?: Array<{ name: string; success: boolean; result: string; duration: number }>;
                summary?: string;
                totalDurationMs?: number;
              };

              return {
                ...prev,
                isRunning: false,
                steps: data.steps?.map(s => ({ ...s, tool: s.name })) ?? prev.steps,
                summary: data.summary ?? '',
                totalDurationMs: data.totalDurationMs ?? 0,
              };
            }

            case 'error': {
              const data = event.data as { message?: string };
              return {
                ...prev,
                isRunning: false,
                error: data.message ?? 'Unknown error',
              };
            }

            default:
              return prev;
          }
        });
      }, abortController.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setActiveWorkflow(prev => prev ? {
          ...prev,
          isRunning: false,
          error: err instanceof Error ? err.message : 'Workflow failed',
        } : null);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setActiveWorkflow(prev => prev ? { ...prev, isRunning: false } : null);
  }, []);

  return { activeWorkflow, execute, cancel };
}
