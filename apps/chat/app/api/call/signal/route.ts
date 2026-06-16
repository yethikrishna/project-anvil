/**
 * POST /api/call/signal — send a WebRTC signal
 * GET  /api/call/signal?userId=xxx — SSE stream of incoming signals
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  publishSignal, subscribeCallSignals, type CallSignal,
} from '@/lib/call-signaling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, from, to, payload } = body as {
    type: CallSignal['type'];
    from: string;
    to: string;
    payload: unknown;
  };

  if (!type || !from || !to) {
    return NextResponse.json({ error: 'type, from, to required' }, { status: 400 });
  }

  const signal = publishSignal({ type, from, to, payload });
  return NextResponse.json(signal, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`)
      );

      const unsub = subscribeCallSignals(userId, (signal) => {
        try {
          controller.enqueue(
            encoder.encode(`event: signal\ndata: ${JSON.stringify(signal)}\n\n`)
          );
        } catch { /* closed */ }
      });

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        unsub();
        try { controller.close(); } catch { /* ok */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
