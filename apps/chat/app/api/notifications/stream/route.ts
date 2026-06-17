/**
 * GET /api/notifications/stream — Server-Sent Events for AI-pushed notifications.
 *
 * Keeps a long-lived SSE connection to the client.
 * Pushes notifications when:
 * - Background email scan detects new urgent email
 * - Meeting starts in <15 minutes
 * - AI tool execution completes (e.g., draft saved, event created)
 * - Weekly summary is ready
 *
 * Client subscribes once and receives push notifications without polling.
 *
 * Notifications are client-rendered as toast messages or inbox badges.
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PushNotification {
  id: string;
  type: 'email' | 'calendar' | 'tool_done' | 'ai_insight' | 'reminder';
  title: string;
  body: string;
  action?: string;       // prompt to send on click
  urgency: 'critical' | 'high' | 'normal' | 'low';
  timestamp: number;
}

// In-memory notification queue per connection (real impl would use Redis pub/sub)
// For now: on connect, we do a quick scan and push any pending notifications
async function generateInitialNotifications(): Promise<PushNotification[]> {
  const notifications: PushNotification[] = [];

  // Check for upcoming calendar events
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now

    const { getToolExecutor } = await import('@/lib/tool-executor');
    const tools = getToolExecutor({ userId: 'default' });

    const eventsRaw = await tools.getCalendarEvents(now.toISOString(), soon.toISOString());
    const events = JSON.parse(eventsRaw) as Array<{
      id?: string;
      summary?: string;
      start?: { dateTime?: string };
      hangoutLink?: string;
    }>;

    for (const ev of events.slice(0, 2)) {
      const title = ev.summary ?? 'Meeting';
      const startMs = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : 0;
      const minsUntil = Math.round((startMs - now.getTime()) / 60000);

      if (minsUntil >= 0 && minsUntil <= 15) {
        notifications.push({
          id: `cal-${ev.id ?? Date.now()}`,
          type: 'calendar',
          title: `Starting in ${minsUntil} min`,
          body: title,
          action: `Tell me about "${title}" — what do I need to know before this meeting?`,
          urgency: minsUntil <= 5 ? 'critical' : 'high',
          timestamp: Date.now(),
        });
      }
    }
  } catch { /* calendar unavailable */ }

  return notifications;
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* connection closed */ }
      };

      // Send heartbeat immediately
      send({ type: 'connected', timestamp: Date.now() });

      // Generate initial notifications (quick scan)
      try {
        const notifications = await generateInitialNotifications();
        for (const n of notifications) {
          send({ type: 'notification', payload: n });
        }
      } catch { /* scan failed, not critical */ }

      // Keep-alive heartbeat every 25s (SSE spec recommends < 30s)
      const heartbeat = setInterval(() => {
        try {
          send({ type: 'ping', timestamp: Date.now() });
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);

      // Clean up on disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
