/**
 * POST /api/attention — Priority attention scan across Mail + Calendar.
 *
 * Fetches unread emails and upcoming calendar events in parallel,
 * then uses AI to prioritize and suggest actions.
 *
 * Integrates @anvil/ai for:
 * - Model routing (uses appropriate tier for summarization)
 * - Tool definitions for suggested actions
 */

import { NextRequest, NextResponse } from 'next/server';

// Uses Node.js runtime (AbortSignal.timeout + parallel fetch)

// ── Priority levels ──

interface AttentionItem {
  id: string;
  type: 'email' | 'calendar' | 'action';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  source: string;
  timestamp: string;
  sender?: string;
  threadId?: string;
  attendees?: string[];
  location?: string;
  duration?: string;
  actions: Array<{
    label: string;
    tool: string;
    args: Record<string, unknown>;
  }>;
}

// ── Helpers ──

async function fetchUnreadEmails(authToken?: string): Promise<AttentionItem[]> {
  const gmailApi = process.env.ANVIL_GMAIL_API ?? 'http://localhost:3006/api';

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${gmailApi}/messages/search?q=is:unread&folder=inbox&limit=20`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const emails = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];

    return emails.map((email: Record<string, unknown>) => {
      const from = String(email.from ?? email.sender ?? 'Unknown');
      const subject = String(email.subject ?? '(No subject)');
      const snippet = String(email.snippet ?? email.body ?? '');
      const date = String(email.date ?? email.timestamp ?? new Date().toISOString());
      const threadId = email.threadId ?? email.thread_id ?? email.id;

      // Priority heuristics
      let priority: AttentionItem['priority'] = 'medium';
      const subjectLower = subject.toLowerCase();
      const fromLower = from.toLowerCase();

      if (/urgent|asap|critical|emergency/i.test(subject) ||
          /urgent|asap|critical|emergency/i.test(snippet)) {
        priority = 'urgent';
      } else if (/important|priority|action required|please review|deadline/i.test(subject)) {
        priority = 'high';
      } else if (/ceo|cto|vp|director|boss|manager/i.test(fromLower)) {
        priority = 'high';
      } else if (/newsletter|digest|notification|noreply|no-reply/i.test(fromLower)) {
        priority = 'low';
      } else if (/fwd:/i.test(subject)) {
        priority = 'low';
      }

      return {
        id: String(email.id ?? crypto.randomUUID()),
        type: 'email',
        priority,
        title: subject,
        summary: snippet.slice(0, 200),
        source: `Email from ${from}`,
        timestamp: date,
        sender: from,
        threadId: String(threadId),
        actions: [
          { label: 'Reply', tool: 'email_save_draft', args: { thread_id: threadId } },
          { label: 'Read thread', tool: 'email_read_thread', args: { thread_id: threadId } },
          { label: 'Archive', tool: 'email_archive', args: { thread_id: threadId } },
        ],
      } satisfies AttentionItem;
    });
  } catch {
    return [];
  }
}

async function fetchUpcomingEvents(authToken?: string): Promise<AttentionItem[]> {
  const calendarApi = process.env.ANVIL_CALENDAR_API ?? 'http://localhost:3007/api';

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const res = await fetch(
      `${calendarApi}/events?from=${now.toISOString()}&to=${in24h.toISOString()}`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) return [];

    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : [];

    return events.map((event: Record<string, unknown>) => {
      const title = String(event.title ?? event.summary ?? 'Untitled event');
      const start = String(event.start ?? event.startTime ?? '');
      const end = String(event.end ?? event.endTime ?? '');
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const location = String(event.location ?? '');

      const startTime = start ? new Date(start) : new Date();
      const endTime = end ? new Date(end) : new Date();
      const durationMin = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      const isNow = startTime <= new Date();
      const isSoon = !isNow && (startTime.getTime() - Date.now()) < 60 * 60 * 1000;

      let priority: AttentionItem['priority'] = 'medium';
      if (isNow) priority = 'urgent';
      else if (isSoon) priority = 'high';
      else if (/1:1|standup|daily|weekly/i.test(title)) priority = 'low';

      return {
        id: String(event.id ?? crypto.randomUUID()),
        type: 'calendar',
        priority,
        title,
        summary: `${isNow ? 'Happening now' : isSoon ? 'Starting soon' : 'Upcoming'} · ${durationMin}min${location ? ` · ${location}` : ''}`,
        source: 'Calendar',
        timestamp: start,
        attendees: attendees.map((a: unknown) =>
          typeof a === 'string' ? a : String((a as Record<string, unknown>)?.email ?? ''),
        ),
        location,
        duration: `${durationMin} min`,
        actions: [
          { label: 'Reschedule', tool: 'calendar_create_event', args: { title, attendees } },
          { label: 'Join meeting', tool: 'web_search', args: { query: `${title} meeting link` } },
        ],
      } satisfies AttentionItem;
    });
  } catch {
    return [];
  }
}

// ── AI prioritization ──

async function prioritizeWithAI(items: AttentionItem[]): Promise<AttentionItem[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions';

  if (!apiKey || items.length === 0) {
    // Fallback: sort by priority weight
    const weight = { urgent: 0, high: 1, medium: 2, low: 3 };
    return items.sort((a, b) => weight[a.priority] - weight[b.priority]);
  }

  try {
    const itemsSummary = items.map((item, i) =>
      `[${i}] ${item.priority.toUpperCase()} | ${item.type} | "${item.title}" | ${item.summary.slice(0, 100)}`
    ).join('\n');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an executive assistant prioritizing a user's attention items.
Given a list of emails and calendar events, return a JSON array of indices (0-based) in priority order.
Most important first. Consider: urgency keywords, sender importance, meeting proximity, deadlines.
Return ONLY a JSON array of numbers, nothing else.`,
          },
          { role: 'user', content: itemsSummary },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!res.ok) return items;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? '[]';

    const indices: number[] = JSON.parse(content);
    if (!Array.isArray(indices)) return items;

    return indices
      .filter(i => i >= 0 && i < items.length)
      .map(i => items[i]);
  } catch {
    return items;
  }
}

// ── Route Handler ──

export async function GET(req: NextRequest) {
  const authToken = req.headers.get('Authorization')?.replace('Bearer ', '') ?? undefined;
  return handleScan(authToken);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const authToken = body.authToken as string | undefined;
  return handleScan(authToken);
}

async function handleScan(authToken?: string): Promise<Response> {
  try {
    // Fetch in parallel
    const [emails, events] = await Promise.all([
      fetchUnreadEmails(authToken),
      fetchUpcomingEvents(authToken),
    ]);

    const allItems = [...emails, ...events];

    // AI prioritization
    const prioritized = await prioritizeWithAI(allItems);

    // Generate summary stats
    const stats = {
      total: prioritized.length,
      urgent: prioritized.filter(i => i.priority === 'urgent').length,
      high: prioritized.filter(i => i.priority === 'high').length,
      emails: emails.length,
      events: events.length,
    };

    return NextResponse.json({
      items: prioritized.slice(0, 15),
      stats,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Attention scan failed',
      message: err instanceof Error ? err.message : 'Unknown error',
      items: [],
      stats: { total: 0, urgent: 0, high: 0, emails: 0, events: 0 },
    }, { status: 500 });
  }
}
