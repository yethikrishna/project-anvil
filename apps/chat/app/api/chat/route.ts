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

// Use Node.js runtime for full async support with tool execution

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { conversationId, message, history, context, userPatterns, settings, approvedToolIds } = body as {
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
    settings?: { requireApprovalForEmail?: boolean; requireApprovalForCalendar?: boolean; communicationStyle?: string; emailTone?: string };
    approvedToolIds?: string[];
  };

  if (!conversationId || !message) {
    return NextResponse.json({ error: 'Missing conversationId or message' }, { status: 400 });
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
    userPatterns,
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
          message,
          history.map(m => ({
            id: '',
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: Date.now(),
          })),
          context,
          // Stream handler
          (chunk) => send('delta', { content: chunk }),
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
