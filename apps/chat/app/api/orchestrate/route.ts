/**
 * POST /api/orchestrate — Cross-app workflow execution.
 *
 * Accepts a workflow name + params, executes the multi-step chain,
 * and streams progress via SSE.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolOrchestrator } from '@/lib/tool-orchestrator';

export const runtime = 'edge';

type WorkflowType = 'find_and_share' | 'summarize_and_save' | 'smart_schedule' | 'custom';

interface OrchestrateRequest {
  workflow: WorkflowType;
  params: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { workflow, params } = (await req.json()) as OrchestrateRequest;

  if (!workflow) {
    return NextResponse.json({ error: 'Missing workflow type' }, { status: 400 });
  }

  const orchestrator = getToolOrchestrator();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const onProgress = (step: number, msg: string) => {
        send('progress', { step, message: msg });
      };

      try {
        send('start', { workflow });

        let result;

        switch (workflow) {
          case 'find_and_share':
            result = await orchestrator.findAndShareFile(
              String(params.query ?? ''),
              String(params.recipientEmail ?? ''),
              String(params.message ?? ''),
              onProgress,
            );
            break;

          case 'summarize_and_save':
            result = await orchestrator.summarizeAndSave(
              String(params.threadId ?? ''),
              String(params.docTitle ?? 'Thread Summary'),
              onProgress,
            );
            break;

          case 'smart_schedule':
            result = await orchestrator.smartSchedule(
              String(params.title ?? 'Meeting'),
              Number(params.durationMinutes ?? 60),
              (params.attendeeEmails ?? []) as string[],
              {
                from: String(params.dateFrom ?? ''),
                to: String(params.dateTo ?? ''),
              },
              onProgress,
            );
            break;

          case 'custom':
            if (!Array.isArray(params.steps)) {
              throw new Error('Custom workflow requires "steps" array');
            }
            result = await orchestrator.executeWorkflow(
              params.steps as Array<{
                name: string;
                tool: string;
                args: Record<string, unknown>;
                extract?: Record<string, { fromStep: number; path: string }>;
              }>,
              undefined,
              (stepIndex, step, toolResult) => {
                send('progress', { step: stepIndex, message: step.name, toolResult });
              },
            );
            break;

          default:
            throw new Error(`Unknown workflow: ${workflow}`);
        }

        send('done', result);
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
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
