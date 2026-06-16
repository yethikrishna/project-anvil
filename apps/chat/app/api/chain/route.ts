/**
 * POST /api/chain — Execute a goal via AI-driven dynamic tool chaining.
 *
 * The AI plans and executes tools autonomously until the goal is achieved.
 * Progress is streamed via SSE.
 *
 * Body: { goal: string, maxSteps?: number, userId?: string, planOnly?: boolean }
 *
 * SSE events:
 * - step: { stepIndex, tool, args, result, reasoning }
 * - done: { success, steps, answer, totalDurationMs, stoppedReason }
 * - error: { message }
 */

import { NextRequest } from 'next/server';
import { getDynamicChain } from '@/lib/dynamic-chain';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { goal, maxSteps = 8, userId, planOnly = false } = await req.json();

  if (!goal) {
    return new Response(JSON.stringify({ error: 'Missing goal' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const chain = getDynamicChain();

  // Plan-only mode: show what steps would be taken
  if (planOnly) {
    const plan = await chain.plan(goal);
    return new Response(JSON.stringify({ plan }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream execution
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        const result = await chain.run(goal, {
          maxSteps,
          userId,
          onStep: (step, stepIndex) => {
            send('step', {
              stepIndex,
              tool: step.tool,
              args: step.args,
              result: step.result,
              reasoning: step.reasoning,
            });
          },
        });

        send('done', result);
      } catch (err) {
        send('error', {
          message: err instanceof Error ? err.message : 'Chain execution failed',
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
