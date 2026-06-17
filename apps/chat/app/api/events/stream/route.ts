/**
 * GET /api/events/stream — SSE endpoint for real-time UI push events.
 *
 * The frontend connects once on page load and receives:
 * - attention_alert: urgent mail just arrived / about to miss a meeting
 * - ai_suggestion: proactive suggestion based on context
 * - briefing_refresh: background briefing data updated
 * - heartbeat: keep-alive every 20s
 *
 * Reconnect: browser auto-reconnects on drop (SSE spec).
 * Last-Event-ID header is used to catch missed events.
 */

import { NextRequest } from 'next/server';
import { busSubscribe, busGetRecent } from '@/lib/event-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const lastEventId = req.headers.get('last-event-id');
  const since = lastEventId ? parseInt(lastEventId, 10) : 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      function send(id: string, event: string, data: unknown) {
        if (closed) return;
        const chunk = [
          `id: ${id}`,
          `event: ${event}`,
          `data: ${JSON.stringify(data)}`,
          '',
          '',
        ].join('\n');
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }

      // Replay missed events
      const missed = busGetRecent(since);
      for (const evt of missed) {
        send(String(evt.ts), evt.type, evt.payload);
      }

      // Subscribe to new events
      const unsubscribe = busSubscribe((evt) => {
        send(String(evt.ts), evt.type, evt.payload);
      });

      // Heartbeat every 20s
      const heartbeatInterval = setInterval(() => {
        if (closed) {
          clearInterval(heartbeatInterval);
          return;
        }
        send(String(Date.now()), 'heartbeat', { ts: Date.now() });
      }, 20_000);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeatInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
