/**
 * POST /api/orchestrate — Cross-app workflow execution.
 *
 * Accepts a workflow name + params, executes the multi-step chain,
 * and streams progress via SSE.
 *
 * Supported workflows:
 * - find_and_share: Search file → share link → email
 * - summarize_and_save: Email thread → summarize → save to Docs
 * - smart_schedule: Check availability → create event
 * - find_summarize_email: Search doc → read → email summary
 * - email_to_calendar: Email → extract event → create calendar
 * - custom: Arbitrary step array
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolOrchestrator } from '@/lib/tool-orchestrator';

export const runtime = 'edge';

type WorkflowType =
  | 'find_and_share'
  | 'summarize_and_save'
  | 'smart_schedule'
  | 'find_summarize_email'
  | 'email_to_calendar'
  | 'custom';

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
              String(params.message ?? 'I\'m sharing this file with you.'),
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
                from: String(params.dateFrom ?? new Date().toISOString()),
                to: String(params.dateTo ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
              },
              onProgress,
            );
            break;

          case 'find_summarize_email':
            result = await orchestrator.findSummarizeEmail(
              String(params.fileQuery ?? ''),
              (params.recipientEmails ?? []) as string[],
              String(params.summaryInstructions ?? ''),
              onProgress,
            );
            break;

          case 'email_to_calendar':
            result = await orchestrator.emailToCalendar(
              String(params.emailQuery ?? ''),
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
