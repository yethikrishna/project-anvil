/**
 * Weekly Summary Generator — searches Mail + Docs + Calendar, generates report.
 *
 * Produces a comprehensive weekly digest with:
 * - Email activity metrics and top threads
 * - Document creation/editing activity
 * - Calendar meeting summary
 * - Action items and follow-ups
 * - Productivity insights
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export async function GET(req: NextRequest) {
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  const tools = getToolExecutor();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Fetch data from all sources in parallel
  const [emails, docs, events, recentEmails] = await Promise.all([
    tools.searchEmails(
      `after:${weekAgo.toISOString().split('T')[0]}`,
      'all', 50,
    ),
    tools.searchFiles('*', 'document', 20),
    tools.getCalendarEvents(weekAgo.toISOString(), weekFromNow.toISOString()),
    tools.searchEmails(
      'is:unread newer_than:7d',
      'inbox', 20,
    ),
  ]);

  const summary = await engine.quickGenerate(
    `You are an executive assistant generating a weekly summary report.

Analyze the user's activity across Mail, Drive, and Calendar for the past week.

Return a JSON object with these fields:
{
  "weekRange": "Mon DD – Sun DD" format,
  "emailsProcessed": number (estimated from email data),
  "unreadEmails": number (estimated from unread data),
  "docsCreated": number (estimated from docs data),
  "meetingsAttended": number (estimated from past events),
  "meetingsUpcoming": number (estimated from future events),
  "filesShared": number (estimated),
  "topTopics": [3-5 key topics/themes as strings],
  "topThreads": [array of { subject: string, participants: string[], status: "needs-reply" | "resolved" | "waiting" }],
  "actionItems": [3-5 follow-up items for next week as strings],
  "highlights": [2-3 notable achievements or events as strings],
  "productivity": {
    "avgResponseTimeHours": number (estimated),
    "meetingsPerDay": number (estimated),
    "emailsPerDay": number (estimated)
  },
  "recommendations": [1-2 actionable suggestions as strings]
}

Keep it concise and actionable. Return ONLY the JSON object.`,
    `PAST WEEK EMAILS: ${emails}\n\nRECENT DOCUMENTS: ${docs}\n\nCALENDAR EVENTS: ${events}\n\nUNREAD EMAILS: ${recentEmails}`,
  );

  try {
    const data = JSON.parse(summary);
    return NextResponse.json(data);
  } catch {
    // If AI didn't return valid JSON, try to extract JSON from response
    const jsonMatch = summary.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return NextResponse.json(JSON.parse(jsonMatch[0]));
      } catch {}
    }

    return NextResponse.json({
      weekRange: `${weekAgo.toLocaleDateString()} – ${now.toLocaleDateString()}`,
      raw: summary,
      emailsProcessed: 0,
      unreadEmails: 0,
      docsCreated: 0,
      meetingsAttended: 0,
      meetingsUpcoming: 0,
      filesShared: 0,
      topTopics: [],
      topThreads: [],
      actionItems: [],
      highlights: [],
      productivity: { avgResponseTimeHours: 0, meetingsPerDay: 0, emailsPerDay: 0 },
      recommendations: [],
    });
  }
}
