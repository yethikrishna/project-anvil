/**
 * POST /api/goal-planner — AI Goal Planner endpoint.
 *
 * Streams plan creation + execution events via SSE.
 * Uses @anvil/ai GoalPlanner to decompose goals into tool steps.
 *
 * Events (SSE `data: <json>\n\n`):
 *   { type: "plan_created", plan }
 *   { type: "task_started", taskId }
 *   { type: "task_done", taskId, result }
 *   { type: "task_failed", taskId, error }
 *   { type: "task_approval_needed", task }
 *   { type: "plan_complete", plan, summary }
 *   { type: "plan_failed", plan, error }
 *   { type: "thinking", text }
 */

import { NextRequest } from 'next/server';
import { createAI, ANVIL_TOOLS, GoalPlanner } from '@anvil/ai';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 120;

function sendEvent(
  controller: ReadableStreamDefaultController,
  event: Record<string, unknown>,
): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  controller.enqueue(new TextEncoder().encode(data));
}

export async function POST(req: NextRequest) {
  const { goal, userId = 'default' } = await req.json() as { goal: string; userId?: string };

  if (!goal?.trim()) {
    return new Response(JSON.stringify({ error: 'goal is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const executor = getToolExecutor({ userId });

  const ai = createAI({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_API_URL?.replace('/chat/completions', '') ?? 'https://api.openai.com/v1',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const planner = new GoalPlanner(ai.provider, ANVIL_TOOLS, {
          maxRetries: 2,
          requireApprovalFor: ['send', 'delete'],
          executeTask: async (tool, args) => {
            return executor.executeTool(tool, args).then(r => r.result);
          },
        });

        for await (const event of planner.plan(goal)) {
          sendEvent(controller, event);
        }

        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      } catch (err) {
        sendEvent(controller, {
          type: 'plan_failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          plan: { id: 'error', goal, reasoning: '', tasks: [], status: 'failed', createdAt: Date.now() },
        });
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
