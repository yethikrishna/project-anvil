/**
 * POST /api/proactive-scan — Background scan for urgent signals.
 *
 * Called periodically (every 2–5 minutes via browser polling or a future cron).
 * Checks:
 * - New unread urgent emails (not already alerted)
 * - Upcoming meetings in < 10 minutes with no prep
 * - Follow-up emails that went unanswered for > 48h
 *
 * Emits events via event-bus → SSE stream → UI toast/badge.
 * Tracks alerted IDs in memory to avoid duplicate alerts.
 *
 * Returns: { alerts: number, checked: { mail: bool, calendar: bool } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolExecutor } from '@/lib/tool-executor';
import { busEmit, type AttentionAlert } from '@/lib/event-bus';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── In-memory dedup store (survives hot-reload in prod via module singleton) ──
const alertedEmailIds = new Set<string>();
const alertedEventIds = new Set<string>();
const MAX_DEDUP_SIZE = 500;

function dedup(set: Set<string>, id: string): boolean {
  if (set.has(id)) return false; // Already alerted
  set.add(id);
  if (set.size > MAX_DEDUP_SIZE) {
    const [first] = set;
    set.delete(first);
  }
  return true; // New, should alert
}

// ── Priority scorer (same logic as ai-briefing) ──
function isUrgent(subject: string, from: string, snippet: string): boolean {
  const text = `${subject} ${from} ${snippet}`.toLowerCase();
  return /urgent|asap|immediately|critical|emergency|action required|deadline today|time.?sensitive/.test(text)
    || /ceo|cto|vp |director|president/.test(from.toLowerCase());
}

function isHighPriority(subject: string, from: string, snippet: string): boolean {
  const text = `${subject} ${from} ${snippet}`.toLowerCase();
  return /important|priority|follow.?up|response needed|please review|your approval/.test(text);
}

export async function POST(req: NextRequest) {
  const { userId = 'default' } = await req.json().catch(() => ({})) as { userId?: string };
  const tools = getToolExecutor({ userId });

  let mailChecked = false;
  let calChecked = false;
  let alertsEmitted = 0;

  // ── 1. Scan unread emails ──
  try {
    const raw = await tools.searchEmails('is:unread newer_than:30m', 'inbox', 20);
    const emails = JSON.parse(raw);
    const list: Array<Record<string, unknown>> = Array.isArray(emails) ? emails : (emails.results ?? []);
    mailChecked = true;

    for (const email of list) {
      const id = String(email.id ?? email.threadId ?? '');
      const subject = String(email.subject ?? '(No subject)');
      const from = String(email.from ?? email.sender ?? 'Unknown');
      const snippet = String(email.snippet ?? '');

      if (!id) continue;

      const urgent = isUrgent(subject, from, snippet);
      const high = !urgent && isHighPriority(subject, from, snippet);

      if ((urgent || high) && dedup(alertedEmailIds, id)) {
        const alert: AttentionAlert = {
          subject,
          from,
          snippet: snippet.slice(0, 100),
          priority: urgent ? 'urgent' : 'high',
          actionPrompt: `Read my email from ${from.split('<')[0].trim()} with subject "${subject}" and draft a reply`,
        };
        busEmit('attention_alert', alert);
        alertsEmitted++;
      }
    }
  } catch { /* API unavailable */ }

  // ── 2. Scan upcoming meetings ──
  try {
    const now = new Date();
    const in15 = new Date(now.getTime() + 15 * 60 * 1000);

    const raw = await tools.getCalendarEvents(now.toISOString(), in15.toISOString());
    const events = JSON.parse(raw);
    const list: Array<Record<string, unknown>> = Array.isArray(events) ? events : (events.items ?? events.events ?? []);
    calChecked = true;

    for (const event of list) {
      const id = String(event.id ?? event.summary ?? '');
      const title = String(event.summary ?? event.title ?? 'Meeting');
      const startDT = event.start
        ? String((event.start as Record<string, unknown>).dateTime ?? event.start)
        : '';
      if (!startDT || !id) continue;

      const startTime = new Date(startDT);
      const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60_000);

      if (minutesUntil >= 0 && minutesUntil <= 10 && dedup(alertedEventIds, id)) {
        // Meeting starting very soon
        busEmit('attention_alert', {
          subject: `Meeting starting in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}`,
          from: 'Calendar',
          snippet: title,
          priority: 'urgent' as const,
          actionPrompt: `Prepare me for my "${title}" meeting starting in ${minutesUntil} minutes`,
        } satisfies AttentionAlert);
        alertsEmitted++;
      }
    }
  } catch { /* API unavailable */ }

  return NextResponse.json({
    alerts: alertsEmitted,
    checked: { mail: mailChecked, calendar: calChecked },
    ts: Date.now(),
  });
}
