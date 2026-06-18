/**
 * POST /api/smart-search — Unified cross-app search.
 *
 * Searches Mail + Drive + Calendar simultaneously for a given query.
 * Ranks results by relevance and returns a combined list.
 *
 * Used by:
 * - smart_search tool (via tool-executor)
 * - SearchModal (directly)
 * - Future: global search bar
 *
 * Body: { query, sources?, limit?, time_range?, userId? }
 * Response: { results: SmartSearchResult[], total: number, sources: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 20;

export interface SmartSearchResult {
  id: string;
  source: 'mail' | 'drive' | 'calendar';
  type: string;
  title: string;
  subtitle: string;
  snippet?: string;
  timestamp?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  relevance: number;
  actionPrompt: string;
}

export interface SmartSearchResponse {
  query: string;
  results: SmartSearchResult[];
  total: number;
  sources: string[];
  took_ms: number;
}

function timeRangeToDateFilter(range: string): { after?: string; before?: string } {
  const now = new Date();
  switch (range) {
    case 'today': {
      const today = now.toISOString().split('T')[0];
      return { after: today };
    }
    case 'this_week':
    case 'last_7_days': {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { after: d.toISOString().split('T')[0] };
    }
    case 'this_month':
    case 'last_30_days': {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { after: d.toISOString().split('T')[0] };
    }
    default:
      return {};
  }
}

function scoreRelevance(
  item: Record<string, unknown>,
  query: string,
  index: number,
  total: number,
): number {
  // Base score: position-weighted (earlier = more relevant assuming API sorts by relevance)
  let score = Math.max(0, total - index) * 10;

  // Boost for title/subject match
  const title = String(item.subject ?? item.title ?? item.name ?? '').toLowerCase();
  const q = query.toLowerCase();
  if (title.includes(q)) score += 50;
  else if (title.split(' ').some(w => q.includes(w) || w.includes(q))) score += 20;

  // Boost for recent items (mail/calendar)
  const dateStr = String(item.date ?? item.start_time ?? item.modifiedTime ?? item.createdTime ?? '');
  if (dateStr) {
    try {
      const age = Date.now() - new Date(dateStr).getTime();
      const ageHours = age / (1000 * 60 * 60);
      if (ageHours < 24) score += 30;
      else if (ageHours < 168) score += 15;
      else if (ageHours < 720) score += 5;
    } catch { /* ignore */ }
  }

  return score;
}

function normalizeMailResult(item: Record<string, unknown>, query: string, idx: number, total: number): SmartSearchResult {
  const id = String(item.id ?? item.threadId ?? crypto.randomUUID());
  const subject = String(item.subject ?? '(No subject)');
  const from = String(item.from ?? item.sender ?? 'Unknown');
  const snippet = String(item.snippet ?? item.body ?? '').slice(0, 120);
  const date = String(item.date ?? item.timestamp ?? '');

  let relDate = '';
  if (date) {
    try {
      const d = new Date(date);
      const ageMs = Date.now() - d.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 24) relDate = `${Math.round(ageHours)}h ago`;
      else if (ageHours < 168) relDate = `${Math.round(ageHours / 24)}d ago`;
      else relDate = d.toLocaleDateString();
    } catch { relDate = date; }
  }

  return {
    id,
    source: 'mail',
    type: 'email',
    title: subject,
    subtitle: `From ${from}${relDate ? ` · ${relDate}` : ''}`,
    snippet,
    timestamp: date,
    relevance: scoreRelevance(item, query, idx, total),
    actionPrompt: `Read the email thread with subject "${subject}" from ${from} and summarize it. Then ask me how to respond.`,
    metadata: { from, threadId: item.threadId ?? id },
  };
}

function normalizeDriveResult(item: Record<string, unknown>, query: string, idx: number, total: number): SmartSearchResult {
  const id = String(item.id ?? crypto.randomUUID());
  const name = String(item.name ?? item.title ?? 'Untitled');
  const type = String(item.mimeType ?? item.type ?? 'document').split('/').pop() ?? 'file';
  const owner = String(item.owner ?? item.createdBy ?? '');
  const modified = String(item.modifiedTime ?? item.modified ?? item.updatedAt ?? '');

  let relDate = '';
  if (modified) {
    try {
      const d = new Date(modified);
      const ageMs = Date.now() - d.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 1) relDate = 'today';
      else if (ageDays < 7) relDate = `${Math.round(ageDays)}d ago`;
      else relDate = d.toLocaleDateString();
    } catch { relDate = modified; }
  }

  return {
    id,
    source: 'drive',
    type,
    title: name,
    subtitle: [owner ? `by ${owner}` : '', relDate].filter(Boolean).join(' · '),
    timestamp: modified,
    relevance: scoreRelevance(item, query, idx, total),
    actionPrompt: `Read the file "${name}" from Drive and give me a summary.`,
    metadata: { mimeType: item.mimeType, webViewLink: item.webViewLink, fileId: id },
  };
}

function normalizeCalendarResult(item: Record<string, unknown>, query: string, idx: number, total: number): SmartSearchResult {
  const id = String(item.id ?? crypto.randomUUID());
  const title = String(item.title ?? item.summary ?? '(Untitled event)');
  const startObj = item.start as Record<string, unknown> | undefined;
  const start = String(item.start_time ?? startObj?.dateTime ?? startObj?.date ?? '');
  const attendeeCount = Array.isArray(item.attendees) ? item.attendees.length : 0;
  const location = String(item.location ?? '');

  let relDate = '';
  if (start) {
    try {
      const d = new Date(start);
      const diffMs = d.getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < 0) relDate = `${Math.abs(Math.round(diffHours / 24))}d ago`;
      else if (diffHours < 1) relDate = 'in < 1h';
      else if (diffHours < 24) relDate = `in ${Math.round(diffHours)}h`;
      else relDate = `in ${Math.round(diffHours / 24)}d`;
    } catch { relDate = start; }
  }

  return {
    id,
    source: 'calendar',
    type: 'event',
    title,
    subtitle: [relDate, location, attendeeCount > 0 ? `${attendeeCount} attendees` : ''].filter(Boolean).join(' · '),
    timestamp: start,
    relevance: scoreRelevance(item, query, idx, total),
    actionPrompt: `Get me ready for the meeting "${title}". Pull relevant emails and docs and give me a briefing.`,
    metadata: { start, attendees: item.attendees, location, eventId: id },
  };
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const {
    query,
    sources = ['mail', 'drive', 'calendar'],
    limit = 5,
    time_range,
    userId = 'default',
  } = await req.json() as {
    query: string;
    sources?: string[];
    limit?: number;
    time_range?: string;
    userId?: string;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const executor = getToolExecutor({ userId });
  const effectiveLimit = Math.min(Number(limit) || 5, 10);
  const dateFilter = time_range ? timeRangeToDateFilter(time_range) : {};

  const searches: Array<Promise<SmartSearchResult[]>> = [];

  // ── Mail search ──
  if (sources.includes('mail')) {
    const mailQuery = dateFilter.after
      ? `${query} after:${dateFilter.after}`
      : query;
    searches.push(
      executor.searchEmails(mailQuery, 'inbox', effectiveLimit)
        .then(raw => {
          const data = JSON.parse(raw) as unknown;
          const items: Record<string, unknown>[] = Array.isArray(data) ? data : ((data as Record<string, unknown>).results as Record<string, unknown>[] ?? []);
          return items.slice(0, effectiveLimit).map((item, i) => normalizeMailResult(item, query, i, items.length));
        })
        .catch(() => []),
    );
  }

  // ── Drive search ──
  if (sources.includes('drive')) {
    searches.push(
      executor.searchFiles(query, 'any', effectiveLimit)
        .then(raw => {
          const data = JSON.parse(raw) as unknown;
          const items: Record<string, unknown>[] = Array.isArray(data) ? data : ((data as Record<string, unknown>).results as Record<string, unknown>[] ?? data as Record<string, unknown>[] ?? []);
          return items.slice(0, effectiveLimit).map((item, i) => normalizeDriveResult(item, query, i, items.length));
        })
        .catch(() => []),
    );
  }

  // ── Calendar search ──
  if (sources.includes('calendar')) {
    const calFrom = dateFilter.after
      ? new Date(dateFilter.after).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const calTo = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    searches.push(
      executor.getCalendarEvents(calFrom, calTo)
        .then(raw => {
          const data = JSON.parse(raw) as unknown;
          const events: Record<string, unknown>[] = Array.isArray(data) ? data : ((data as Record<string, unknown>).events as Record<string, unknown>[] ?? []);
          // Client-side filter by query
          const q = query.toLowerCase();
          const filtered = events.filter(e => {
            const text = JSON.stringify(e).toLowerCase();
            return text.includes(q);
          });
          return filtered.slice(0, effectiveLimit).map((item, i) => normalizeCalendarResult(item, query, i, filtered.length));
        })
        .catch(() => []),
    );
  }

  const resultGroups = await Promise.all(searches);
  const allResults: SmartSearchResult[] = resultGroups.flat();

  // Sort by relevance descending
  allResults.sort((a, b) => b.relevance - a.relevance);

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = allResults.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const response: SmartSearchResponse = {
    query,
    results: deduped.slice(0, effectiveLimit * sources.length),
    total: deduped.length,
    sources: sources.filter(s => ['mail', 'drive', 'calendar'].includes(s)),
    took_ms: Date.now() - start,
  };

  return NextResponse.json(response);
}
