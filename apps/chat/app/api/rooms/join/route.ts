/**
 * POST /api/rooms/join    — join a room
 * POST /api/rooms/leave   — leave a room
 * POST /api/rooms/produce — announce a new producer (track)
 * GET  /api/rooms/events  — SSE stream of room events
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  joinRoom, leaveRoom, addProducer, subscribeRoomEvents,
  type ProducerInfo,
} from '@/lib/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, roomId, userId = 'default', displayName, producer } = body as {
    action: 'join' | 'leave' | 'produce';
    roomId: string;
    userId?: string;
    displayName?: string;
    producer?: ProducerInfo;
  };

  if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 });

  if (action === 'join') {
    const result = joinRoom(roomId, userId, displayName ?? userId);
    if (!result) return NextResponse.json({ error: 'Room full or not found' }, { status: 409 });
    return NextResponse.json(result);
  }

  if (action === 'leave') {
    leaveRoom(roomId, userId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'produce' && producer) {
    addProducer(roomId, userId, producer);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const userId = searchParams.get('userId') ?? 'default';

  if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ roomId, userId })}\n\n`)
      );

      const unsub = subscribeRoomEvents(roomId, (event) => {
        try {
          controller.enqueue(
            encoder.encode(`event: room-event\ndata: ${JSON.stringify(event)}\n\n`)
          );
        } catch { /* closed */ }
      });

      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); }
        catch { clearInterval(ping); }
      }, 15_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        unsub();
        leaveRoom(roomId, userId);
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
