/**
 * useChain — React hook for AI-driven dynamic tool chaining.
 *
 * Executes a multi-step goal via /api/chain and streams step-by-step
 * progress back to the UI with full status tracking.
 *
 * Usage:
 *   const { run, isRunning, steps, answer, cancel } = useChain();
 *   await run('Find the Q4 report and email it to the team');
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { parseSSEStream } from './sse-parser';
import type { ToolCallResult } from './types';

export interface ChainStepState {
  stepIndex: number;
  tool: string;
  args: Record<string, unknown>;
  result: ToolCallResult;
  reasoning?: string;
  status: 'running' | 'done' | 'error';
}

export interface UseChainReturn {
  isRunning: boolean;
  steps: ChainStepState[];
  answer: string | null;
  error: string | null;
  stoppedReason: string | null;
  totalDurationMs: number;
  run: (goal: string, options?: { maxSteps?: number; userId?: string }) => Promise<string | null>;
  plan: (goal: string) => Promise<Array<{ tool: string; reason: string }>>;
  cancel: () => void;
  reset: () => void;
}

export function useChain(): UseChainReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<ChainStepState[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stoppedReason, setStoppedReason] = useState<string | null>(null);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setSteps([]);
    setAnswer(null);
    setError(null);
    setStoppedReason(null);
    setTotalDurationMs(0);
  }, []);

  const run = useCallback(async (
    goal: string,
    options: { maxSteps?: number; userId?: string } = {},
  ): Promise<string | null> => {
    const abortController = new AbortController();
    abortRef.current = abortController;

    reset();
    setIsRunning(true);

    try {
      const res = await fetch('/api/chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          goal,
          maxSteps: options.maxSteps ?? 8,
          userId: options.userId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `API error: ${res.status}`);
      }

      let finalAnswer: string | null = null;

      await parseSSEStream(res, (event) => {
        switch (event.event) {
          case 'step': {
            const data = event.data as ChainStepState;
            setSteps(prev => {
              const next = [...prev];
              const existing = next.findIndex(s => s.stepIndex === data.stepIndex);
              const step: ChainStepState = {
                ...data,
                status: data.result?.status === 'error' ? 'error' : 'done',
              };
              if (existing >= 0) {
                next[existing] = step;
              } else {
                next.push(step);
              }
              return next.sort((a, b) => a.stepIndex - b.stepIndex);
            });
            break;
          }

          case 'done': {
            const data = event.data as {
              success: boolean;
              answer: string;
              stoppedReason: string;
              totalDurationMs: number;
            };
            finalAnswer = data.answer;
            setAnswer(data.answer);
            setStoppedReason(data.stoppedReason);
            setTotalDurationMs(data.totalDurationMs);
            break;
          }

          case 'error': {
            const data = event.data as { message: string };
            setError(data.message);
            break;
          }
        }
      }, abortController.signal);

      return finalAnswer;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Chain failed');
      }
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [reset]);

  const plan = useCallback(async (
    goal: string,
  ): Promise<Array<{ tool: string; reason: string }>> => {
    try {
      const res = await fetch('/api/chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, planOnly: true }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.plan ?? [];
    } catch {
      return [];
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setStoppedReason('cancelled');
  }, []);

  return { isRunning, steps, answer, error, stoppedReason, totalDurationMs, run, plan, cancel, reset };
}
