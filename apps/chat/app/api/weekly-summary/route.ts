/**
 * Weekly Summary Generator — comprehensive weekly digest.
 *
 * Fetches Mail + Docs + Calendar data in parallel, then uses AI to:
 * 1. Analyze activity patterns and trends
 * 2. Surface top threads needing attention
 * 3. Summarize meetings and decisions
 * 4. Generate next-week recommendations
 * 5. Identify pending action items
 *
 * GET  /api/weekly-summary          — Current week
 * GET  /api/weekly-summary?mode=next — Preview next week
 * GET  /api/weekly-summary?format=md — Markdown format
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';
import { dbGetPreferences } from '@/lib/db';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') ?? 'current';
  const format = searchParams.get('format') ?? 'json';
  const userId = searchParams.get('userId') ?? 'default';

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  const tools = getToolExecutor({ userId });
  const prefs = await safeGetPrefs(userId);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Fetch all data sources in parallel
  const [
    inboxEmails,
    sentEmails,
    recentDocs,
    pastEvents,
    upcomingEvents,
    unreadEmails,
  ] = await Promise.all([
    tools.searchEmails(`after:${weekAgo.toISOString().split('T')[0]}`, 'inbox', 40).catch(() => '[]'),
    tools.searchEmails(`after:${weekAgo.toISOString().split('T')[0]}`, 'sent', 20).catch(() => '[]'),
    tools.searchFiles('*', 'document', 15).catch(() => '[]'),
    tools.getCalendarEvents(weekAgo.toISOString(), now.toISOString()).catch(() => '[]'),
    tools.getCalendarEvents(now.toISOString(), weekFromNow.toISOString()).catch(() => '[]'),
    tools.searchEmails('is:unread', 'inbox', 30).catch(() => '[]'),
  ]);

  // Build user context string for AI
  const userContext = Object.entries(prefs)
    .filter(([k]) => !['comm_tone', 'comm_length', 'profile_name'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');

  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const summary = await engine.quickGenerate(
    `You are an executive assistant generating a detailed weekly summary report.
Today is ${today}.
${userContext ? `USER PREFERENCES: ${userContext}` : ''}

Analyze the data and return a JSON object with this EXACT structure. Be specific — use real subjects, names, and details from the data, not generic placeholders.

{
  "weekRange": "Mon Jun 9 – Sun Jun 15, 2025",
  "generatedAt": "${now.toISOString()}",

  "headline": "One powerful sentence summarizing the week (what mattered most)",

  "email": {
    "totalReceived": <number>,
    "totalSent": <number>,
    "unread": <number>,
    "urgentUnread": <number — count with urgent/action-required signals>,
    "topSenders": [{ "name": "string", "count": <number> }] — top 3,
    "hotThreads": [
      {
        "subject": "actual subject from data",
        "from": "sender name",
        "status": "needs-reply" | "in-progress" | "resolved" | "waiting",
        "urgency": "high" | "medium" | "low",
        "summary": "one sentence describing what this is about"
      }
    ] — up to 5 most important threads
  },

  "calendar": {
    "meetingsLastWeek": <number>,
    "meetingHoursLastWeek": <number — estimated>,
    "meetingsNextWeek": <number>,
    "upcomingHighlights": [
      {
        "title": "actual event title",
        "time": "human-readable time",
        "type": "meeting" | "deadline" | "event",
        "attendees": <number>
      }
    ] — up to 5
  },

  "documents": {
    "recentlyAccessed": [
      { "title": "document title", "type": "doc | sheet | slide", "relevance": "why it matters" }
    ] — up to 4
  },

  "actionItems": [
    {
      "item": "specific action with context",
      "priority": "urgent" | "high" | "normal",
      "source": "email | calendar | doc",
      "due": "today | this-week | next-week | ongoing" 
    }
  ] — up to 8 items sorted by priority,

  "insights": [
    "Specific observation about your week — e.g. 'Email response time improved: avg 2h vs 4h last week'"
  ] — 2-3 insights,

  "nextWeekPrep": [
    "Concrete suggestion for next week"
  ] — 2-3 items

}

Return ONLY the JSON object. No markdown, no code fences. Be specific and use real data from the provided inputs.`,
    `=== INBOX (LAST 7 DAYS) ===\n${inboxEmails}\n\n=== SENT (LAST 7 DAYS) ===\n${sentEmails}\n\n=== RECENT DOCUMENTS ===\n${recentDocs}\n\n=== PAST WEEK CALENDAR EVENTS ===\n${pastEvents}\n\n=== NEXT 7 DAYS EVENTS ===\n${upcomingEvents}\n\n=== UNREAD EMAILS ===\n${unreadEmails}`,
  );

  // Parse and validate
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(summary);
  } catch {
    const match = summary.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        data = JSON.parse(match[0]);
      } catch {
        data = buildFallback(now, weekAgo, summary);
      }
    } else {
      data = buildFallback(now, weekAgo, summary);
    }
  }

  // Markdown format option
  if (format === 'md') {
    return new Response(toMarkdown(data), {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  return NextResponse.json(data);
}

// ── Helpers ──

async function safeGetPrefs(userId: string): Promise<Record<string, string>> {
  try {
    return dbGetPreferences(userId);
  } catch {
    return {};
  }
}

function buildFallback(now: Date, weekAgo: Date, raw?: string): Record<string, unknown> {
  return {
    weekRange: `${weekAgo.toLocaleDateString()} – ${now.toLocaleDateString()}`,
    generatedAt: now.toISOString(),
    headline: 'Weekly summary generated',
    raw: raw?.slice(0, 500),
    email: { totalReceived: 0, totalSent: 0, unread: 0, urgentUnread: 0, topSenders: [], hotThreads: [] },
    calendar: { meetingsLastWeek: 0, meetingHoursLastWeek: 0, meetingsNextWeek: 0, upcomingHighlights: [] },
    documents: { recentlyAccessed: [] },
    actionItems: [],
    insights: [],
    nextWeekPrep: [],
  };
}

function toMarkdown(data: Record<string, unknown>): string {
  const lines: string[] = [
    `# Weekly Summary — ${String(data['weekRange'] ?? '')}`,
    '',
    `> ${String(data['headline'] ?? '')}`,
    '',
    '## 📧 Email',
    '',
  ];

  const email = data['email'] as Record<string, unknown> | undefined;
  if (email) {
    lines.push(`- **Received:** ${email['totalReceived']}  **Sent:** ${email['totalSent']}  **Unread:** ${email['unread']} (${email['urgentUnread']} urgent)`);
    lines.push('');

    const threads = email['hotThreads'] as Array<Record<string, unknown>> | undefined;
    if (threads?.length) {
      lines.push('### Top Threads');
      for (const t of threads) {
        lines.push(`- **[${t['urgency']}]** ${t['subject']} — ${t['summary']}`);
      }
      lines.push('');
    }
  }

  lines.push('## 📅 Calendar', '');
  const cal = data['calendar'] as Record<string, unknown> | undefined;
  if (cal) {
    lines.push(`- **Meetings last week:** ${cal['meetingsLastWeek']} (~${cal['meetingHoursLastWeek']}h)`);
    lines.push(`- **Meetings next week:** ${cal['meetingsNextWeek']}`);
    const upcoming = cal['upcomingHighlights'] as Array<Record<string, unknown>> | undefined;
    if (upcoming?.length) {
      lines.push('');
      lines.push('### Upcoming');
      for (const e of upcoming) {
        lines.push(`- **${e['title']}** — ${e['time']}`);
      }
    }
    lines.push('');
  }

  lines.push('## ✅ Action Items', '');
  const actions = data['actionItems'] as Array<Record<string, unknown>> | undefined;
  if (actions?.length) {
    for (const a of actions) {
      const priority = a['priority'] === 'urgent' ? '🔴' : a['priority'] === 'high' ? '🟡' : '⚪';
      lines.push(`- ${priority} **${a['item']}** _(${a['due']})_`);
    }
    lines.push('');
  }

  lines.push('## 💡 Insights', '');
  const insights = data['insights'] as string[] | undefined;
  if (insights?.length) {
    for (const i of insights) lines.push(`- ${i}`);
    lines.push('');
  }

  lines.push('## 📌 Next Week Prep', '');
  const prep = data['nextWeekPrep'] as string[] | undefined;
  if (prep?.length) {
    for (const p of prep) lines.push(`- ${p}`);
    lines.push('');
  }

  lines.push(`---`, `*Generated ${new Date(String(data['generatedAt'] ?? '')).toLocaleString()}*`);

  return lines.join('\n');
}
