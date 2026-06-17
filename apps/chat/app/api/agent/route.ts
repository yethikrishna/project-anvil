/**
 * POST /api/agent — Autonomous agent endpoint.
 *
 * Accepts a natural-language goal, uses AgentRuntime to plan + execute
 * multi-step tasks across Mail, Drive, Calendar, and Docs.
 *
 * Streams progress events via SSE while the agent works.
 * Pauses and emits an approval_required event for high-risk actions.
 * Clients resume by calling with { planId, actionId, decision }.
 *
 * Flow:
 *   1. Client POST { goal, userId } → agent plans → streams action events
 *   2. On approval_required → client POST { planId, actionId, decision: "approved"|"rejected" }
 *   3. Agent resumes
 *
 * Events (SSE `data: <json>\n\n`):
 *   { type: "plan_created", plan: AgentPlan }
 *   { type: "action_start", planId, actionId, action: AgentAction }
 *   { type: "action_complete", planId, actionId, result }
 *   { type: "action_failed", planId, actionId, error }
 *   { type: "approval_required", planId, actionId, action: AgentAction }
 *   { type: "plan_complete", plan: AgentPlan }
 *   { type: "plan_failed", plan: AgentPlan, error }
 *   { type: "error", message }
 */

import { NextRequest, NextResponse } from 'next/server';
import { AgentRuntime, type AgentPlan, type AgentAction, type ApprovalRequest } from '@anvil/ai';
import { createAI } from '@anvil/ai';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ── In-memory plan store (replaced by DB in prod) ──
// Keyed by planId. Stores pending approval resolvers.
const pendingApprovals = new Map<string, {
  resolve: (decision: 'approved' | 'rejected') => void;
  action: AgentAction;
}>();

const agentPlans = new Map<string, AgentPlan>();

// ── Build tool-backed action executors ──
function buildAgentRuntime(userId: string): AgentRuntime {
  const tools = getToolExecutor({ userId });

  const ai = createAI({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_API_URL?.replace('/chat/completions', '') ?? 'https://api.openai.com/v1',
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  const runtime = new AgentRuntime({
    name: 'anvil-agent',
    aiProvider: ai,
    approvalThreshold: 'high',
    onRequestApproval: (req) => {
      // Store for later resolution via POST with decision
      pendingApprovals.set(`${req.planId}:${req.actionId}`, {
        resolve: (decision) => req.decide(decision),
        action: req.action,
      });
    },
  });

  // Register REAL tool-backed executors
  runtime.registerAction('email_search', {
    risk: 'low',
    description: 'Search emails',
    execute: async (params) => {
      const result = await tools.searchEmails(
        String(params.query ?? ''),
        String(params.folder ?? 'inbox'),
        Number(params.limit ?? 10),
      );
      return JSON.parse(result);
    },
  });

  runtime.registerAction('email_send', {
    risk: 'high',
    description: 'Send email',
    execute: async (params) => {
      const result = await tools.sendEmail(
        String(params.to ?? ''),
        String(params.subject ?? ''),
        String(params.body ?? ''),
        params.cc ? String(params.cc) : undefined,
      );
      return JSON.parse(result);
    },
    rollback: async (params) => ({
      note: `Cannot unsend email to ${params.to}`,
    }),
  });

  runtime.registerAction('email_save_draft', {
    risk: 'low',
    description: 'Save email draft',
    execute: async (params) => {
      const result = await tools.saveDraft(
        String(params.to ?? ''),
        String(params.subject ?? ''),
        String(params.body ?? ''),
      );
      return JSON.parse(result);
    },
  });

  runtime.registerAction('email_read_thread', {
    risk: 'low',
    description: 'Read email thread',
    execute: async (params) => {
      const result = await tools.getEmailThread(String(params.threadId ?? params.id ?? ''));
      return JSON.parse(result);
    },
  });

  runtime.registerAction('file_search', {
    risk: 'low',
    description: 'Search Drive files',
    execute: async (params) => {
      const result = await tools.searchFiles(
        String(params.query ?? ''),
        String(params.type ?? 'any'),
        Number(params.limit ?? 10),
      );
      return JSON.parse(result);
    },
  });

  runtime.registerAction('file_read', {
    risk: 'low',
    description: 'Read file contents',
    execute: async (params) => {
      const result = await tools.readFile(String(params.fileId ?? params.id ?? ''));
      return JSON.parse(result);
    },
  });

  runtime.registerAction('file_share', {
    risk: 'medium',
    description: 'Create shareable link',
    execute: async (params) => {
      const result = await tools.createShareLink(
        String(params.fileId ?? params.id ?? ''),
        params.public !== false,
      );
      return JSON.parse(result);
    },
  });

  runtime.registerAction('document_write', {
    risk: 'medium',
    description: 'Create or edit document',
    execute: async (params) => {
      const result = await tools.writeDocument(
        String(params.title ?? 'Untitled'),
        String(params.content ?? ''),
        params.docId ? String(params.docId) : undefined,
      );
      return JSON.parse(result);
    },
  });

  runtime.registerAction('calendar_create_event', {
    risk: 'high',
    description: 'Create calendar event',
    execute: async (params) => {
      const result = await tools.createEvent(
        String(params.title ?? ''),
        String(params.start ?? ''),
        String(params.end ?? ''),
        Array.isArray(params.attendees) ? params.attendees.map(String) : [],
        params.description ? String(params.description) : undefined,
      );
      return JSON.parse(result);
    },
    rollback: async (params, result) => ({
      note: `Event ${result?.eventId ?? 'unknown'} would be deleted`,
    }),
  });

  runtime.registerAction('calendar_check_availability', {
    risk: 'low',
    description: 'Check calendar availability',
    execute: async (params) => {
      const result = await tools.checkAvailability(
        String(params.start ?? new Date().toISOString()),
        String(params.end ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
      );
      return JSON.parse(result);
    },
  });

  runtime.registerAction('web_search', {
    risk: 'low',
    description: 'Search the web',
    execute: async (params) => {
      const result = await tools.webSearch(
        String(params.query ?? ''),
        Number(params.limit ?? 5),
      );
      return JSON.parse(result);
    },
  });

  return runtime;
}

// ── SSE helper ──
function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── POST handler ──
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    goal?: string;
    userId?: string;
    planId?: string;
    actionId?: string;
    decision?: 'approved' | 'rejected';
    stream?: boolean;
  };

  const { goal, userId = 'default', planId, actionId, decision, stream = true } = body;

  // ── Resume an approval decision ──
  if (planId && actionId && decision) {
    const key = `${planId}:${actionId}`;
    const pending = pendingApprovals.get(key);
    if (!pending) {
      return NextResponse.json({ error: `No pending approval for ${key}` }, { status: 404 });
    }
    pending.resolve(decision);
    pendingApprovals.delete(key);
    return NextResponse.json({ ok: true, decision });
  }

  // ── New goal ──
  if (!goal) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 });
  }

  // Non-streaming fallback
  if (!stream) {
    const agentRuntime = buildAgentRuntime(userId);
    const plan = await agentRuntime.plan(goal, { userId, timestamp: new Date().toISOString() });
    agentPlans.set(plan.id, plan);
    const executed = await agentRuntime.execute(plan.id);
    return NextResponse.json({ plan: executed });
  }

  // ── SSE streaming execution ──
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      try {
        const agentRuntime = buildAgentRuntime(userId);

        // Plan the actions
        const plan = await agentRuntime.plan(goal, { userId, timestamp: new Date().toISOString() });
        agentPlans.set(plan.id, plan);
        send({ type: 'plan_created', plan });

        // Track action state via approval callback override approach:
        // We wrap execute and poll for approval_required status
        const executeWithStreaming = async () => {
          const checkInterval = 200; // ms
          const maxWait = 60_000; // 60s per action max

          // Start execution (non-blocking)
          const execPromise = agentRuntime.execute(plan.id);

          // Poll plan state to emit action events
          let lastActionStates = new Map<string, string>();
          const pollTimer = setInterval(() => {
            const currentPlan = agentPlans.get(plan.id);
            if (!currentPlan) return;

            for (const action of currentPlan.actions) {
              const prev = lastActionStates.get(action.id);
              if (prev !== action.status) {
                lastActionStates.set(action.id, action.status);
                if (action.status === 'executing') {
                  send({ type: 'action_start', planId: plan.id, actionId: action.id, action });
                } else if (action.status === 'completed') {
                  send({ type: 'action_complete', planId: plan.id, actionId: action.id, result: action.result });
                } else if (action.status === 'failed') {
                  send({ type: 'action_failed', planId: plan.id, actionId: action.id, error: action.error });
                }
              }
            }

            // Check for pending approvals
            for (const [key, pending] of pendingApprovals.entries()) {
              if (key.startsWith(plan.id)) {
                send({ type: 'approval_required', planId: plan.id, actionId: pending.action.id, action: pending.action });
              }
            }
          }, checkInterval);

          const finalPlan = await execPromise;
          clearInterval(pollTimer);

          // Emit final plan
          if (finalPlan.status === 'completed') {
            send({ type: 'plan_complete', plan: finalPlan });
          } else {
            send({ type: 'plan_failed', plan: finalPlan, error: 'One or more actions failed' });
          }
        };

        await executeWithStreaming();
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── GET: retrieve plan status ──
export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get('planId');
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });
  const plan = agentPlans.get(planId);
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  return NextResponse.json({ plan });
}
