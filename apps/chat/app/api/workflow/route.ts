/**
 * POST /api/workflow — Execute a multi-step AI workflow with SSE progress streaming.
 *
 * Accepts:
 * - workflowId: string
 * - inputs: Record<string, unknown>
 * - userId?: string
 * - authToken?: string
 *
 * Returns SSE stream with WorkflowEvent objects.
 */

import { NextRequest } from 'next/server';
import { workflowEngine, getWorkflow, BUILT_IN_WORKFLOWS } from '@anvil/ai';
import { getToolExecutor } from '@/lib/tool-executor';
import { createAI } from '@anvil/ai';
import { dbGetPreferences } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    workflowId: string;
    inputs?: Record<string, unknown>;
    userId?: string;
    authToken?: string;
  };

  const { workflowId, inputs = {}, userId, authToken } = body;

  if (!workflowId) {
    return new Response(JSON.stringify({ error: 'Missing workflowId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const definition = getWorkflow(workflowId);
  if (!definition) {
    return new Response(JSON.stringify({ error: `Unknown workflow: ${workflowId}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const toolExecutor = getToolExecutor(authToken ? { authToken } : undefined);

  // Build AI generator
  const aiProvider = process.env.OPENAI_API_KEY
    ? createAI({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' })
    : null;

  async function generate(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    if (!aiProvider) return '[AI not configured — set OPENAI_API_KEY]';
    const result = await aiProvider.generate(prompt, {
      maxTokens: options?.maxTokens ?? 1500,
      temperature: options?.temperature ?? 0.3,
    });
    return typeof result.text === 'string' ? result.text : JSON.stringify(result);
  }

  async function executeTool(tool: string, toolArgs: Record<string, unknown>): Promise<string> {
    const result = await toolExecutor.executeTool(tool, toolArgs);
    return result.result;
  }

  // Load user preferences
  const preferences: Record<string, string> = {};
  if (userId) {
    try {
      const prefs = dbGetPreferences(userId);
      Object.assign(preferences, prefs);
    } catch {
      // ignore
    }
  }

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        await workflowEngine.execute(
          definition,
          inputs,
          executeTool,
          generate,
          (event) => send(event),
          preferences,
          userId,
        );
      } catch (err) {
        send({
          type: 'workflow_failed',
          message: err instanceof Error ? err.message : 'Workflow execution failed',
          timestamp: Date.now(),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── GET /api/workflow/:id — Get a run status ──

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    // Return available workflows list
    return Response.json(
      BUILT_IN_WORKFLOWS.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        icon: w.icon,
        tags: w.tags,
        estimatedDuration: w.estimatedDuration,
        stepCount: w.steps.length,
      })),
    );
  }

  const run = workflowEngine.getRun(runId);
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return Response.json(run);
}
