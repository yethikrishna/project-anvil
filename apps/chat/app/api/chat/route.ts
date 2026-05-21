/**
 * POST /api/chat — Main chat endpoint with streaming + tool use.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { conversationId, message, history, context } = body as {
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
  };

  if (!conversationId || !message) {
    return NextResponse.json({ error: 'Missing conversationId or message' }, { status: 400 });
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
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
          (toolCall) => send('tool', toolCall)
        );

        send('done', {
          message: result.message,
          toolCalls: result.toolCalls,
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
