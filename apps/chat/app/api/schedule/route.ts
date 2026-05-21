/**
 * POST /api/schedule — Checks calendars, proposes times, creates event.
 * PUT  /api/schedule — Confirm and create the event.
 *
 * Flow:
 * 1. Check calendar availability for the time range
 * 2. AI finds the best meeting slot
 * 3. Returns proposal for user confirmation
 * 4. PUT confirms and creates the event
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export async function POST(req: NextRequest) {
  const { title, duration, attendees, timeRange, description, userId } = await req.json();

  if (!title) {
    return NextResponse.json({ error: 'Missing meeting title' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const durationMin = duration ?? 30;
  const rangeStart = timeRange?.start ?? now.toISOString();
  const rangeEnd = timeRange?.end ?? weekFromNow.toISOString();

  // Get busy slots
  const [events, availability] = await Promise.all([
    tools.getCalendarEvents(rangeStart, rangeEnd),
    tools.checkAvailability(rangeStart, rangeEnd),
  ]);

  // Use AI to find optimal time
  const proposal = await engine.quickGenerate(
    `You are a scheduling assistant. Find the BEST meeting time based on calendar data.

MEETING: "${title}" for ${durationMin} minutes
ATTENDEES: ${attendees?.join(', ') ?? 'none specified'}
RANGE: ${rangeStart} to ${rangeEnd}
${description ? `DESCRIPTION: ${description}` : ''}

SCHEDULING RULES:
- Prefer mornings (9-11am) on Tue-Thu
- Avoid back-to-back meetings (leave 15 min buffer)
- Avoid first/last hour of workday (8am, 5-6pm)
- Prefer times that don't split lunch (12-1pm)
- If no perfect slot, suggest the least-bad option

Return a JSON object with:
{
  "title": "meeting title",
  "start": "ISO 8601 start time",
  "end": "ISO 8601 end time",
  "attendees": ["email1", "email2"],
  "description": "optional description",
  "reasoning": "1 sentence why this time works",
  "alternatives": [
    { "start": "ISO 8601", "end": "ISO 8601", "reasoning": "why this is also good" }
  ]
}

Return ONLY the JSON object.`,
    `EXISTING EVENTS: ${events}\n\nAVAILABILITY: ${availability}`,
  );

  try {
    let meeting;
    try {
      meeting = JSON.parse(proposal);
    } catch {
      const match = proposal.match(/\{[\s\S]*\}/);
      if (match) {
        meeting = JSON.parse(match[0]);
      } else {
        return NextResponse.json({ proposal: null, raw: proposal });
      }
    }

    // Ensure end time = start + duration
    if (meeting.start && !meeting.end) {
      const startDate = new Date(meeting.start);
      meeting.end = new Date(startDate.getTime() + durationMin * 60 * 1000).toISOString();
    }

    return NextResponse.json({ proposal: meeting });
  } catch {
    return NextResponse.json({ proposal: null, raw: proposal });
  }
}

/**
 * PUT — Confirm and create the event.
 */
export async function PUT(req: NextRequest) {
  const { title, start, end, attendees, description, userId } = await req.json();

  if (!title || !start || !end) {
    return NextResponse.json({ error: 'Missing required fields: title, start, end' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });
  const result = await tools.createEvent(title, start, end, attendees, description);

  try {
    return NextResponse.json({ created: true, event: JSON.parse(result) });
  } catch {
    return NextResponse.json({ created: true, raw: result });
  }
}
