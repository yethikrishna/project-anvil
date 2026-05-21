/**
 * GET /api/attention — Priority digest from Mail + Calendar.
 * Scans for urgent items and returns a ranked list.
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

  // Fetch recent emails and calendar events in parallel
  const [emailsResult, eventsResult] = await Promise.all([
    tools.searchEmails('is:unread newer_than:1d', 'inbox', 20),
    tools.getCalendarEvents(
      new Date().toISOString(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    ),
  ]);

  // Use AI to analyze and prioritize
  const digest = await engine.quickGenerate(
    `You are an executive assistant. Analyze the user's unread emails and upcoming calendar events.
Return a JSON array of priority items. Each item has:
- type: "email" | "calendar" | "action"
- priority: "urgent" | "high" | "medium" | "low"
- title: short description
- summary: 1-2 sentence summary
- source: where this came from (email subject, event name, etc.)
- timestamp: ISO date string

Rules:
- Mark as "urgent" if: email from boss/CEO, deadline today, meeting in <1hr
- Mark as "high" if: email requiring response today, meeting tomorrow
- Mark as "medium" if: newsletter with relevant content, meeting this week
- Mark as "low" if: FYI emails, optional events
- Max 10 items total
- Return ONLY the JSON array, no other text`,
    `Unread emails: ${emailsResult}\n\nUpcoming calendar events: ${eventsResult}`
  );

  try {
    const items = JSON.parse(digest);
    return NextResponse.json({ items, generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({
      items: [],
      raw: digest,
      generatedAt: new Date().toISOString(),
    });
  }
}
