/**
 * POST /api/cross-reference — Parallel search across Mail + Calendar + Drive.
 *
 * Answers: "Find everything related to [topic/person/project]"
 * Returns a unified result set sorted by relevance.
 *
 * This is a pure data endpoint — it doesn't call the AI. It's called by:
 * 1. The chat tool chain when the user asks to "find everything about X"
 * 2. The meeting prep endpoint to build context
 * 3. Directly from the UI for quick-reference lookups
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface CrossRefResult {
  source: 'email' | 'calendar' | 'drive';
  type: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  id?: string;
  timestamp?: string;
  relevanceScore: number;
  metadata?: Record<string, unknown>;
}

export interface CrossRefResponse {
  query: string;
  results: CrossRefResult[];
  counts: { email: number; calendar: number; drive: number };
  totalMs: number;
}

// ── Simple relevance scorer ──

function scoreRelevance(query: string, text: string): number {
  const q = query.toLowerCase().split(/\s+/);
  const t = text.toLowerCase();
  let score = 0;
  for (const term of q) {
    if (t.includes(term)) {
      score += term.length > 4 ? 2 : 1;
      if (t.startsWith(term)) score += 2;
    }
  }
  return score;
}

export async function POST(req: NextRequest) {
  const { query, userId = 'default', limit = 5 } = await req.json() as {
    query: string;
    userId?: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });
  const start = Date.now();

  // Run all three searches in parallel
  const [emailRaw, calRaw, driveRaw] = await Promise.allSettled([
    tools.searchEmails(query, 'inbox', limit),
    tools.getCalendarEvents(
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ),
    tools.searchFiles(query, 'any', limit),
  ]);

  const results: CrossRefResult[] = [];

  // ── Email results ──
  if (emailRaw.status === 'fulfilled') {
    try {
      const emails = JSON.parse(emailRaw.value);
      const list: Array<Record<string, unknown>> = Array.isArray(emails) ? emails : (emails.results ?? []);

      for (const e of list.slice(0, limit)) {
        const subject = String(e.subject ?? '(No subject)');
        const from = String(e.from ?? e.sender ?? 'Unknown');
        const snippet = String(e.snippet ?? '');
        const ts = String(e.date ?? e.timestamp ?? '');

        results.push({
          source: 'email',
          type: 'email',
          title: subject,
          subtitle: from.split('<')[0].trim(),
          snippet: snippet.slice(0, 120),
          id: String(e.id ?? e.threadId ?? ''),
          timestamp: ts,
          relevanceScore: scoreRelevance(query, `${subject} ${from} ${snippet}`),
          metadata: { from, threadId: e.threadId ?? e.id },
        });
      }
    } catch { /* parse error */ }
  }

  // ── Calendar results ──
  if (calRaw.status === 'fulfilled') {
    try {
      const events = JSON.parse(calRaw.value);
      const list: Array<Record<string, unknown>> = Array.isArray(events) ? events : (events.items ?? events.events ?? []);

      const filtered = list.filter(e => {
        const title = String(e.summary ?? e.title ?? '');
        const desc = String(e.description ?? '');
        return scoreRelevance(query, `${title} ${desc}`) > 0;
      });

      for (const e of filtered.slice(0, limit)) {
        const title = String(e.summary ?? e.title ?? 'Event');
        const startDT = e.start ? String((e.start as Record<string, unknown>).dateTime ?? e.start) : '';
        const attendees = Array.isArray(e.attendees)
          ? e.attendees.map((a: Record<string, unknown>) => String(a.email ?? a.displayName ?? '')).join(', ')
          : '';

        results.push({
          source: 'calendar',
          type: 'event',
          title,
          subtitle: startDT ? new Date(startDT).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined,
          snippet: attendees ? `With: ${attendees.slice(0, 80)}` : undefined,
          id: String(e.id ?? ''),
          timestamp: startDT,
          relevanceScore: scoreRelevance(query, `${title} ${attendees}`),
          metadata: { startDT, attendees, location: e.location },
        });
      }
    } catch { /* parse error */ }
  }

  // ── Drive results ──
  if (driveRaw.status === 'fulfilled') {
    try {
      const files = JSON.parse(driveRaw.value);
      const list: Array<Record<string, unknown>> = Array.isArray(files) ? files : (files.results ?? files.files ?? []);

      for (const f of list.slice(0, limit)) {
        const name = String(f.name ?? f.title ?? 'File');
        const mimeType = String(f.mimeType ?? f.type ?? '');
        const modifiedTime = String(f.modifiedTime ?? f.modifiedAt ?? f.updatedAt ?? '');

        results.push({
          source: 'drive',
          type: mimeType.includes('sheet') ? 'spreadsheet' : mimeType.includes('slide') ? 'presentation' : 'document',
          title: name,
          subtitle: modifiedTime ? `Modified ${new Date(modifiedTime).toLocaleDateString()}` : undefined,
          id: String(f.id ?? ''),
          timestamp: modifiedTime,
          relevanceScore: scoreRelevance(query, name),
          metadata: { mimeType, id: f.id },
        });
      }
    } catch { /* parse error */ }
  }

  // Sort by relevance, then by recency
  results.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tsB - tsA;
  });

  const emailCount = results.filter(r => r.source === 'email').length;
  const calCount = results.filter(r => r.source === 'calendar').length;
  const driveCount = results.filter(r => r.source === 'drive').length;

  const response: CrossRefResponse = {
    query,
    results: results.slice(0, limit * 2),
    counts: { email: emailCount, calendar: calCount, drive: driveCount },
    totalMs: Date.now() - start,
  };

  return NextResponse.json(response);
}
