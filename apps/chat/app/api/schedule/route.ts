/**
 * POST /api/schedule — Checks calendars, proposes times, creates event.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export async function POST(req: NextRequest) {
  const { title, duration, attendees, timeRange, description } = await req.json();

  if (!title) {
    return NextResponse.json({ error: 'Missing meeting title' }, { status: 400 });
  }

  const tools = getToolExecutor();
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // Get upcoming calendar events to find free slots
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const events = await tools.getCalendarEvents(now.toISOString(), weekFromNow.toISOString());

  const durationMin = duration ?? 30;
  const rangeStart = timeRange?.start ?? now.toISOString();
  const rangeEnd = timeRange?.end ?? weekFromNow.toISOString();

  // Use AI to find the best time
  const proposal = await engine.quickGenerate(
    `You are a scheduling assistant. Find the best meeting time based on existing calendar events.
Return a JSON object with:
- title: meeting title
- start: ISO 8601 start time
- end: ISO 8601 end time (start + ${durationMin} minutes)
- attendees: array of email strings
- description: optional description
- reasoning: 1 sentence why this time works

Rules:
- Prefer mornings (9-11am) in the user's timezone
- Avoid back-to-back meetings (leave 15 min buffer)
- Prefer Tuesday-Thursday over Monday/Friday
- Return ONLY the JSON object`,
    `Meeting: "${title}" for ${durationMin} minutes
Attendees: ${attendees?.join(', ') ?? 'none specified'}
Time range: ${rangeStart} to ${rangeEnd}
Existing events: ${events}`
  );

  try {
    const meeting = JSON.parse(proposal);
    return NextResponse.json({ proposal: meeting });
  } catch {
    return NextResponse.json({ proposal: null, raw: proposal });
  }
}

/**
 * PUT — Confirm and create the event.
 */
export async function PUT(req: NextRequest) {
  const { title, start, end, attendees, description } = await req.json();

  const tools = getToolExecutor();
  const result = await tools.createEvent(title, start, end, attendees, description);

  return NextResponse.json({ created: true, event: JSON.parse(result) });
}
