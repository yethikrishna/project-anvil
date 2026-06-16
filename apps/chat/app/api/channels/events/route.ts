/**
 * GET /api/channels/events — SSE stream for real-time channel events.
 *
 * Query params:
 * - userId: string (optional, for presence tracking)
 * - channelIds: comma-separated channel ids to subscribe to (optional, all if omitted)
 *
 * Events sent:
 * - message: new message posted
 * - message_edited: message content changed
 * - message_deleted: message soft-deleted
 * - reaction: emoji reaction toggled
 * - typing: user typing indicator
 * - presence: user online/away/offline
 * - ping: heartbeat every 20s
 */

import { NextRequest } from 'next/server';
import { presenceSubscribe, type BusEvent } from '@/lib/presence-bus';
import { dbSetPresence } from '@/lib/channels-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? 'default';
  const channelIdsParam = searchParams.get('channelIds');
  const channelIds = channelIdsParam ? channelIdsParam.split(',').filter(Boolean) : undefined;

  // Mark user as online
  dbSetPresence(userId, 'online');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (event: BusEvent) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        );
      };

      // Send initial connection confirmation
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`));

      // Subscribe to bus
      const unsub = presenceSubscribe(enqueue, channelIds);

      // Heartbeat ping every 20s
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
          // Refresh presence on ping
          dbSetPresence(userId, 'online');
        } catch {
          clearInterval(ping);
        }
      }, 20_000);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
        // Mark offline after brief delay (allow reconnect)
        setTimeout(() => dbSetPresence(userId, 'offline'), 5000);
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
