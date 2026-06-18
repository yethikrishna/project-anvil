/**
 * POST /api/chat — Main chat endpoint with streaming + tool use.
 *
 * Accepts:
 * - conversationId: string
 * - message: string
 * - history: message array
 * - context: ConversationContext
 * - userPatterns: string (optional, from context manager)
 *
 * Returns SSE stream with events:
 * - start: { conversationId }
 * - delta: { content } — streaming text chunk
 * - tool: { tool call result } — tool execution update
 * - done: { message, toolCalls } — final result
 * - error: { message } — error
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { learnFromTurn, buildContextAdditions } from '@/lib/context-accumulator';
import { extractTurnIntelligence } from '@/lib/conversation-intelligence';

// Use Node.js runtime for full async support with tool execution

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { conversationId, message, history, context, userPatterns, settings, approvedToolIds, attachments, userId } = body as {
    conversationId: string;
    message: string;
    history: Array<{ role: string; content: string }>;
    context: {
      files: Array<{ id: string; name: string; type: string; lastAccessed: number }>;
      people: string[];
      topics: string[];
      preferences: string[];
      actions: Array<{ tool: string; action: string; timestamp: number; success: boolean }>;
    };
    userPatterns?: string;
    settings?: { requireApprovalForEmail?: boolean; requireApprovalForCalendar?: boolean; communicationStyle?: string; emailTone?: string; agentMode?: boolean };
    approvedToolIds?: string[];
    attachments?: Array<{ name: string; type: string; size: number; content: string }>;
    userId?: string;
  };

  if (!conversationId || (!message && !attachments?.length)) {
    return NextResponse.json({ error: 'Missing conversationId or message' }, { status: 400 });
  }

  // Build enriched message with attachment context injected
  let effectiveMessage = message || '(See attached files)';
  if (attachments?.length) {
    const attachmentContext = attachments.map(att => {
      const isImage = att.type.startsWith('image/');
      const isText = att.type.startsWith('text/') || att.type === 'application/json';
      if (isImage) {
        return `[Attached image: ${att.name} (${(att.size / 1024).toFixed(0)}KB)]`;
      } else if (isText) {
        return `[Attached file: ${att.name}]\n\`\`\`\n${att.content.slice(0, 30_000)}\n\`\`\``;
      } else {
        return `[Attached file: ${att.name}, type: ${att.type}, size: ${(att.size / 1024).toFixed(0)}KB]`;
      }
    }).join('\n\n');
    effectiveMessage = `${effectiveMessage}\n\n${attachmentContext}`;
  }

  const effectiveUserId = userId ?? 'default';

  // Build context additions from accumulated user knowledge
  const contextAdditions = buildContextAdditions(effectiveUserId, context, history.map(m => ({
    id: '',
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
    timestamp: Date.now(),
  })));

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
    userPatterns: (userPatterns ?? '') + contextAdditions,
    settings,
  });

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send('start', { conversationId });

        const result = await engine.processMessage(
          conversationId,
          effectiveMessage,
          history.map(m => ({
            id: '',
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: Date.now(),
          })),
          context,
          // Stream handler
          (chunk) => send('delta', { content: chunk }),
          // Thinking handler
          (thinking) => send('thinking', { text: thinking }),
          // Tool call handler
          (toolCall) => send('tool', toolCall),
          // Pending approval handler
          (toolId, toolName, args) => send('pending_approval', { toolId, toolName, args }),
          // Approved tool IDs
          approvedToolIds ? new Set(approvedToolIds) : undefined,
        );

        send('done', {
          message: result.message,
          toolCalls: result.toolCalls,
          contextUpdates: result.contextUpdates,
        });

        // Learn from this turn — update context accumulator for next time
        try {
          learnFromTurn(
            effectiveUserId,
            effectiveMessage,
            typeof result.message === 'string' ? result.message : result.message.content,
            result.toolCalls?.map(tc => tc.tool) ?? [],
            context,
          );
        } catch {
          // Never let learning crash the response
        }

        // Extract conversation intelligence (tasks, decisions, commitments)
        // Run async without blocking the response
        const aiText = typeof result.message === 'string'
          ? result.message
          : (result.message as { content: string }).content ?? '';
        extractTurnIntelligence(
          effectiveUserId,
          conversationId,
          effectiveMessage,
          aiText,
        ).catch(() => { /* never crash the response */ });
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
