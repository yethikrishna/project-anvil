/**
 * POST /api/attention/triage — AI-scored email triage.
 *
 * Unlike the basic /api/attention route that does a broad scan,
 * this endpoint:
 * 1. Fetches recent emails
 * 2. Scores each for urgency, sender importance, required action
 * 3. Returns a priority-ranked list with suggested actions
 * 4. Optionally generates one-line reply starters for top items
 *
 * This is the "smart inbox" — not just what's unread, but what matters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';

interface TriagedEmail {
  threadId: string;
  subject: string;
  from: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  urgencyScore: number;       // 1-10
  actionRequired: string;     // 'reply' | 'review' | 'forward' | 'schedule' | 'none'
  suggestedReply?: string;    // one-liner to start the reply
  whyItMatters: string;       // AI explanation (brief)
  tags: string[];             // ['awaiting-response', 'has-deadline', 'from-boss', ...]
  estimatedReadMinutes: number;
}

interface TriageResponse {
  triaged: TriagedEmail[];
  summary: string;           // 1-2 sentence inbox summary
  totalUnread: number;
  generatedAt: string;
}

const TRIAGE_SYSTEM_PROMPT = `You are an expert inbox triage assistant for busy executives.

You receive a list of emails and must score and prioritize them ruthlessly.

URGENCY SCORE (1-10):
10 = Requires immediate action (someone blocking on you, legal/compliance, deadline today)
8-9 = High urgency (deadline this week, manager/client waiting, direct question to you)
6-7 = Should handle today (colleague needs something, follow-up needed)
4-5 = This week (FYI threads, non-blocking requests)
2-3 = Low priority (newsletters with useful content, delayed follow-ups)
1 = Noise (marketing, auto-notifications, bulk mail)

ACTION TYPES:
- reply: You need to write back
- review: Read and decide something
- forward: Pass to someone else
- schedule: Book a meeting or call
- none: No action needed (FYI or noise)

TAGS (apply all that fit):
- awaiting-response: you're waiting on someone else
- has-deadline: explicit or implied deadline
- decision-required: you need to make a call
- from-vip: from manager, C-suite, important client
- thread-long: complex multi-person thread
- has-attachment: document attached
- can-delegate: could be handled by someone else
- recurring: part of a regular cadence (weekly update, etc)

IMPORTANT:
- suggestedReply: Only for actionRequired='reply'. One short phrase to start the response.
  Example: "Thanks for the update — I'll review and get back to you by Thursday."
- whyItMatters: 1 sentence. Be specific. Not "this requires attention" but "Sarah is blocked on your approval."
- estimatedReadMinutes: realistic read + response time estimate

Return a JSON array of scored email objects. For each:
{
  "threadId": "thread ID from input",
  "subject": "subject line",
  "from": "display name",
  "fromEmail": "email@example.com",
  "date": "original date string",
  "snippet": "brief snippet",
  "urgencyScore": 7,
  "actionRequired": "reply",
  "suggestedReply": "Thanks for sending this over — I'll...",
  "whyItMatters": "Your approval is blocking the team's Q3 kickoff.",
  "tags": ["has-deadline", "from-vip"],
  "estimatedReadMinutes": 3
}

Sort the array by urgencyScore descending.
Return ONLY the JSON array.`;

export async function POST(req: NextRequest) {
  const { userId = 'default', limit = 15, generateReplies = true } = await req.json() as {
    userId?: string;
    limit?: number;
    generateReplies?: boolean;
  };

  const tools = getToolExecutor({ userId });
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // Fetch recent emails
  let emailsRaw = '';
  let totalUnread = 0;

  try {
    emailsRaw = await tools.searchEmails('is:unread newer_than:3d', 'inbox', limit * 2);
  } catch {
    // Fallback to generic search
    try {
      emailsRaw = await tools.searchEmails('', 'inbox', limit * 2);
    } catch {
      return NextResponse.json({
        triaged: [],
        summary: 'Unable to access inbox right now.',
        totalUnread: 0,
        generatedAt: new Date().toISOString(),
      } as TriageResponse);
    }
  }

  if (!emailsRaw || emailsRaw.trim() === '[]' || emailsRaw.trim() === '') {
    return NextResponse.json({
      triaged: [],
      summary: 'Your inbox is clear — no unread emails in the last 3 days.',
      totalUnread: 0,
      generatedAt: new Date().toISOString(),
    } as TriageResponse);
  }

  // Parse email count
  try {
    const parsed = JSON.parse(emailsRaw);
    if (Array.isArray(parsed)) totalUnread = parsed.length;
  } catch { /* ignore */ }

  // Score and triage
  const suffix = generateReplies
    ? '\n\nFor high-urgency emails (score >= 7), include a suggestedReply.'
    : '\n\nDo not include suggestedReply in output.';

  const raw = await engine.quickGenerate(
    TRIAGE_SYSTEM_PROMPT + suffix,
    `EMAILS TO TRIAGE:\n\n${emailsRaw.slice(0, 14000)}`,
  );

  let triaged: TriagedEmail[] = [];

  try {
    const cleaned = raw.trim();
    const arr = JSON.parse(cleaned.startsWith('[') ? cleaned : (cleaned.match(/\[[\s\S]*\]/) ?? ['[]'])[0]);
    triaged = arr.slice(0, limit).map((e: Record<string, unknown>) => ({
      threadId: String(e.threadId ?? e.id ?? ''),
      subject: String(e.subject ?? 'No subject').slice(0, 100),
      from: String(e.from ?? 'Unknown').slice(0, 60),
      fromEmail: e.fromEmail ? String(e.fromEmail) : undefined,
      date: String(e.date ?? ''),
      snippet: String(e.snippet ?? '').slice(0, 200),
      urgencyScore: Math.max(1, Math.min(10, Number(e.urgencyScore ?? 5))),
      actionRequired: (['reply','review','forward','schedule','none'].includes(String(e.actionRequired))
        ? e.actionRequired : 'review') as TriagedEmail['actionRequired'],
      suggestedReply: e.suggestedReply ? String(e.suggestedReply).slice(0, 200) : undefined,
      whyItMatters: String(e.whyItMatters ?? '').slice(0, 150),
      tags: Array.isArray(e.tags) ? e.tags.map(String).slice(0, 6) : [],
      estimatedReadMinutes: Math.max(1, Math.min(60, Number(e.estimatedReadMinutes ?? 2))),
    }));
  } catch { /* return empty on parse failure */ }

  // Generate inbox summary
  const highPriority = triaged.filter(e => e.urgencyScore >= 7);
  let summary = '';
  if (triaged.length === 0) {
    summary = 'Nothing urgent in your inbox.';
  } else if (highPriority.length === 0) {
    summary = `${triaged.length} emails, none urgent. Estimated ${triaged.reduce((s, e) => s + e.estimatedReadMinutes, 0)} min to clear.`;
  } else {
    const actions = highPriority.slice(0, 3).map(e => {
      const name = e.from.split(' ')[0];
      return `${name}: ${e.subject.slice(0, 40)}`;
    }).join('; ');
    summary = `${highPriority.length} urgent item${highPriority.length !== 1 ? 's' : ''} — ${actions}`;
  }

  return NextResponse.json({
    triaged,
    summary,
    totalUnread,
    generatedAt: new Date().toISOString(),
  } as TriageResponse);
}
