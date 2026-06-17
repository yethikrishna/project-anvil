/**
 * POST /api/quick-actions — Execute common one-click actions.
 *
 * Provides a fast path for frequent tasks that don't need a full chat turn:
 * - summarize_inbox: Quick inbox digest (top 5 items)
 * - next_meeting: Next calendar event details
 * - recent_files: Last 5 modified Drive files
 * - pending_replies: Emails awaiting a reply from me
 * - today_events: All events today
 *
 * Returns structured data fast (< 3s) by reading directly from APIs,
 * without going through the full chat engine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 30;

type QuickAction =
  | 'summarize_inbox'
  | 'next_meeting'
  | 'recent_files'
  | 'pending_replies'
  | 'today_events'
  | 'unread_count';

interface QuickActionResult {
  action: QuickAction;
  title: string;
  summary: string;
  items?: Array<{
    id?: string;
    title: string;
    subtitle?: string;
    timestamp?: string;
    badge?: string;
    action?: string;
  }>;
  count?: number;
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { action, userId } = await req.json() as { action: QuickAction; userId?: string };

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId: userId ?? 'default' });

  try {
    switch (action) {
      case 'summarize_inbox': {
        const raw = await tools.searchEmails('is:unread', 'inbox', 10);
        let emails: Array<Record<string, unknown>> = [];
        try {
          const parsed = JSON.parse(raw);
          emails = Array.isArray(parsed.results) ? parsed.results : Array.isArray(parsed) ? parsed : [];
        } catch { emails = []; }

        const result: QuickActionResult = {
          action,
          title: `${emails.length} unread`,
          summary: emails.length === 0
            ? 'Inbox is clear 🎉'
            : `${emails.length} unread email${emails.length !== 1 ? 's' : ''} waiting`,
          count: emails.length,
          items: emails.slice(0, 5).map(e => ({
            id: String(e.id ?? e.threadId ?? ''),
            title: String(e.subject ?? '(No subject)'),
            subtitle: String(e.from ?? e.sender ?? 'Unknown'),
            timestamp: e.date ? String(e.date) : undefined,
            badge: e.hasAttachment ? '📎' : undefined,
            action: `Read the email from ${String(e.from ?? '')} about "${String(e.subject ?? '')}"`,
          })),
        };
        return NextResponse.json(result);
      }

      case 'next_meeting': {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const raw = await tools.getCalendarEvents(now.toISOString(), tomorrow.toISOString());
        let events: Array<Record<string, unknown>> = [];
        try {
          const parsed = JSON.parse(raw);
          events = Array.isArray(parsed.results) ? parsed.results
            : Array.isArray(parsed.events) ? parsed.events
            : Array.isArray(parsed) ? parsed : [];
        } catch { events = []; }

        // Filter to future events, sort by start
        const futureEvents = events
          .filter(e => {
            const start = e.start ?? e.startTime;
            return start && new Date(String(start)) > now;
          })
          .sort((a, b) => {
            const aTime = new Date(String(a.start ?? a.startTime ?? 0)).getTime();
            const bTime = new Date(String(b.start ?? b.startTime ?? 0)).getTime();
            return aTime - bTime;
          });

        const next = futureEvents[0];
        if (!next) {
          return NextResponse.json({
            action,
            title: 'No upcoming meetings',
            summary: 'Nothing on the calendar in the next 24 hours.',
            items: [],
          } as QuickActionResult);
        }

        const startTime = new Date(String(next.start ?? next.startTime ?? ''));
        const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const attendeeCount = Array.isArray(next.attendees) ? next.attendees.length : 0;

        return NextResponse.json({
          action,
          title: String(next.title ?? next.summary ?? 'Untitled meeting'),
          summary: `Today at ${timeStr}${attendeeCount > 0 ? ` · ${attendeeCount} attendee${attendeeCount !== 1 ? 's' : ''}` : ''}`,
          items: futureEvents.slice(0, 3).map(e => {
            const st = new Date(String(e.start ?? e.startTime ?? ''));
            return {
              title: String(e.title ?? e.summary ?? 'Untitled'),
              subtitle: st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: (e.start ?? e.startTime) ? String(e.start ?? e.startTime) : undefined,
              action: `Tell me about the "${String(e.title ?? e.summary ?? '')}" meeting`,
            };
          }),
          metadata: {
            startTime: next.start ?? next.startTime,
            location: next.location,
            attendees: next.attendees,
          },
        } as QuickActionResult);
      }

      case 'recent_files': {
        const raw = await tools.searchFiles('*', 'any', 8);
        let files: Array<Record<string, unknown>> = [];
        try {
          const parsed = JSON.parse(raw);
          files = Array.isArray(parsed.results) ? parsed.results
            : Array.isArray(parsed.files) ? parsed.files
            : Array.isArray(parsed) ? parsed : [];
        } catch { files = []; }

        return NextResponse.json({
          action,
          title: `${files.length} recent files`,
          summary: files.length === 0 ? 'No recent files' : `${files.length} recently modified files`,
          count: files.length,
          items: files.slice(0, 5).map(f => ({
            id: String(f.id ?? f.fileId ?? ''),
            title: String(f.name ?? f.title ?? f.filename ?? 'Unknown'),
            subtitle: String(f.type ?? f.mimeType ?? 'file'),
            timestamp: f.modified ? String(f.modified) : undefined,
            action: `Read and summarize "${String(f.name ?? f.title ?? '')}"`,
          })),
        } as QuickActionResult);
      }

      case 'pending_replies': {
        // Look for emails from others where we haven't replied
        const raw = await tools.searchEmails('is:unread has:noreply', 'inbox', 10);
        let emails: Array<Record<string, unknown>> = [];
        try {
          const parsed = JSON.parse(raw);
          emails = Array.isArray(parsed.results) ? parsed.results : Array.isArray(parsed) ? parsed : [];
        } catch { emails = []; }

        // Fallback to unread if no specific filter supported
        if (emails.length === 0) {
          const raw2 = await tools.searchEmails('is:unread', 'inbox', 10);
          try {
            const parsed = JSON.parse(raw2);
            emails = Array.isArray(parsed.results) ? parsed.results : Array.isArray(parsed) ? parsed : [];
          } catch { emails = []; }
        }

        return NextResponse.json({
          action,
          title: `${emails.length} need replies`,
          summary: emails.length === 0 ? 'All caught up! 🎉' : `${emails.length} email${emails.length !== 1 ? 's' : ''} need${emails.length === 1 ? 's' : ''} a reply`,
          count: emails.length,
          items: emails.slice(0, 5).map(e => ({
            id: String(e.id ?? ''),
            title: String(e.subject ?? '(No subject)'),
            subtitle: `From: ${String(e.from ?? e.sender ?? 'Unknown')}`,
            timestamp: e.date ? String(e.date) : undefined,
            action: `Draft a reply to "${String(e.subject ?? '')}" from ${String(e.from ?? '')}`,
          })),
        } as QuickActionResult);
      }

      case 'today_events': {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const raw = await tools.getCalendarEvents(startOfDay.toISOString(), endOfDay.toISOString());
        let events: Array<Record<string, unknown>> = [];
        try {
          const parsed = JSON.parse(raw);
          events = Array.isArray(parsed.results) ? parsed.results
            : Array.isArray(parsed.events) ? parsed.events
            : Array.isArray(parsed) ? parsed : [];
        } catch { events = []; }

        return NextResponse.json({
          action,
          title: `${events.length} today`,
          summary: events.length === 0 ? 'Free day!' : `${events.length} event${events.length !== 1 ? 's' : ''} today`,
          count: events.length,
          items: events.map(e => {
            const st = new Date(String(e.start ?? e.startTime ?? ''));
            return {
              title: String(e.title ?? e.summary ?? 'Untitled'),
              subtitle: st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              action: `Tell me about the "${String(e.title ?? e.summary ?? '')}" event`,
            };
          }),
        } as QuickActionResult);
      }

      case 'unread_count': {
        const raw = await tools.searchEmails('is:unread', 'inbox', 50);
        let count = 0;
        try {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed.results) ? parsed.results : Array.isArray(parsed) ? parsed : [];
          count = items.length;
        } catch { count = 0; }
        return NextResponse.json({ action, title: `${count} unread`, summary: `${count} unread emails`, count } as QuickActionResult);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
