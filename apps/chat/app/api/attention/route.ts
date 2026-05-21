/**
 * GET /api/attention — Priority digest from Mail + Calendar.
 *
 * Scans unread emails + upcoming events, uses AI to prioritize,
 * returns ranked items with suggested actions.
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

  // Fetch data in parallel
  const [emailsResult, urgentEmails, eventsResult] = await Promise.all([
    tools.searchEmails('is:unread newer_than:1d', 'inbox', 20),
    tools.searchEmails('is:unread newer_than:1d is:important OR is:starred', 'inbox', 10),
    tools.getCalendarEvents(
      now.toISOString(),
      new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    ),
  ]);

  const digest = await engine.quickGenerate(
    `You are an executive assistant analyzing a user's unread emails and upcoming calendar events for urgency.

Return a JSON array of priority items. Each item:
{
  "id": "unique-id",
  "type": "email" | "calendar" | "action",
  "priority": "urgent" | "high" | "medium" | "low",
  "title": "short description (max 60 chars)",
  "summary": "1-2 sentence summary",
  "source": "where this came from",
  "timestamp": "ISO 8601 date",
  "actions": [
    { "label": "Action button text", "tool": "tool_name", "args": { ... } }
  ]
}

PRIORITY RULES:
- "urgent": emails from boss/CEO/leadership, deadlines today, meetings starting in <1 hour, system alerts
- "high": emails needing response today, meetings tomorrow, customer/urgent issues
- "medium": relevant newsletters, meetings this week, FYI emails worth reading
- "low": optional events, marketing emails, social notifications

SUGGESTED ACTIONS per item (max 2 each):
- For emails: "Reply" (email_send), "Archive" (mark read), "Draft reply" (email_save_draft)
- For calendar: "Join" (link), "Reschedule" (calendar_create_event), "Decline"
- For actions: "Complete" (appropriate tool)

Max 12 items. Return ONLY the JSON array.`,
    `UNREAD EMAILS (last 24h): ${emailsResult}\n\nIMPORTANT/STARRED EMAILS: ${urgentEmails}\n\nCALENDAR (next 48h): ${eventsResult}`,
  );

  try {
    // Try to parse the full response as JSON
    let items;
    try {
      items = JSON.parse(digest);
    } catch {
      // Try to extract JSON array from response
      const match = digest.match(/\[[\s\S]*\]/);
      if (match) {
        items = JSON.parse(match[0]);
      } else {
        items = [];
      }
    }

    return NextResponse.json({
      items: Array.isArray(items) ? items.slice(0, 12) : [],
      generatedAt: new Date().toISOString(),
      stats: {
        totalUnread: Array.isArray(items) ? items.filter((i: any) => i.type === 'email').length : 0,
        urgentCount: Array.isArray(items) ? items.filter((i: any) => i.priority === 'urgent').length : 0,
        upcomingMeetings: Array.isArray(items) ? items.filter((i: any) => i.type === 'calendar').length : 0,
      },
    });
  } catch {
    return NextResponse.json({
      items: [],
      raw: digest,
      generatedAt: new Date().toISOString(),
      stats: { totalUnread: 0, urgentCount: 0, upcomingMeetings: 0 },
    });
  }
}
