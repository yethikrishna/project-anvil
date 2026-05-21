/**
 * GET /api/weekly-summary — Searches Mail + Docs + Calendar, generates report.
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
  const [emails, docs, events] = await Promise.all([
    tools.searchEmails(`after:${weekAgo.toISOString().split('T')[0]}`, 'all', 50),
    tools.searchFiles('*', 'document', 20),
    tools.getCalendarEvents(weekAgo.toISOString(), weekFromNow.toISOString()),
  ]);

  const summary = await engine.quickGenerate(
    `Generate a concise weekly summary for the user.
Return a JSON object with:
- weekRange: "Mon DD – Sun DD" format
- emailsProcessed: estimated count
- docsCreated: estimated count from recent docs
- meetingsAttended: estimated count from calendar
- filesShared: estimated count
- topTopics: array of 3-5 key topics/themes
- actionItems: array of 3-5 follow-up items for next week
- highlights: array of 2-3 notable achievements or events

Keep it concise and actionable. Return ONLY the JSON object.`,
    `Recent emails: ${emails}\n\nRecent documents: ${docs}\n\nCalendar events: ${events}`
  );

  try {
    const data = JSON.parse(summary);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      weekRange: `${weekAgo.toLocaleDateString()} – ${now.toLocaleDateString()}`,
      raw: summary,
      emailsProcessed: 0,
      docsCreated: 0,
      meetingsAttended: 0,
      filesShared: 0,
      topTopics: [],
      actionItems: [],
      highlights: [],
    });
  }
}
