/**
 * POST /api/meeting-prep — Auto-generate a meeting briefing.
 *
 * Given an event ID or title + start time, produces:
 * - Attendee profiles (recent email history, relationship context)
 * - Relevant documents from Drive
 * - Previous meeting notes
 * - Suggested agenda
 * - Key talking points
 * - Open action items from prior threads
 *
 * This is the "Anthropic killer" feature: proactive intelligence
 * that makes users feel like they have an EA who already did the legwork.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AttendeeProfile {
  email: string;
  name?: string;
  recentTopics: string[];
  sentiment: 'positive' | 'neutral' | 'needs-attention';
  lastContact?: string;
  openItems: string[];
}

interface MeetingBrief {
  title: string;
  startTime: string;
  duration: number;
  attendees: AttendeeProfile[];
  relevantFiles: Array<{ name: string; id: string; snippet: string }>;
  suggestedAgenda: string[];
  talkingPoints: string[];
  openActionItems: string[];
  previousMeetingNotes?: string;
  risks: string[];
  summary: string;
}

export async function POST(req: NextRequest) {
  const { eventId, title, startTime, attendees: rawAttendees, userId } = await req.json() as {
    eventId?: string;
    title?: string;
    startTime?: string;
    attendees?: string[];
    userId?: string;
  };

  if (!title && !eventId) {
    return NextResponse.json({ error: 'Provide eventId or title' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // ── 1. Get event details if we have an ID ──
  let eventTitle = title ?? '';
  let eventStart = startTime ?? new Date().toISOString();
  let attendeeEmails = rawAttendees ?? [];

  if (eventId) {
    try {
      const raw = await tools.getCalendarEvents(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      );
      const events = JSON.parse(raw);
      const list = Array.isArray(events) ? events : (events.results ?? events.events ?? []);
      const found = list.find((e: Record<string, unknown>) =>
        String(e.id ?? e.eventId ?? '') === eventId ||
        String(e.title ?? e.summary ?? '').toLowerCase() === (title ?? '').toLowerCase()
      );
      if (found) {
        eventTitle = String(found.title ?? found.summary ?? eventTitle);
        eventStart = String(found.start ?? found.startTime ?? eventStart);
        if (Array.isArray(found.attendees)) {
          attendeeEmails = found.attendees
            .map((a: unknown) => typeof a === 'string' ? a : String((a as Record<string, unknown>).email ?? ''))
            .filter(Boolean);
        }
      }
    } catch { /* continue with what we have */ }
  }

  // ── 2. Parallel intelligence gathering ──
  const [emailDataRaw, driveDataRaw, previousMeetingsRaw] = await Promise.allSettled([
    // Search emails mentioning these attendees / meeting topic
    tools.searchEmails(
      `${eventTitle} ${attendeeEmails.slice(0, 3).join(' ')}`.trim() || eventTitle,
      'inbox', 20,
    ),
    // Search Drive for relevant files
    tools.searchFiles(eventTitle, 'any', 8),
    // Look for previous meeting notes/docs
    tools.searchFiles(`meeting ${eventTitle} notes`, 'any', 4),
  ]);

  const emailRaw = emailDataRaw.status === 'fulfilled' ? emailDataRaw.value : '{"results":[]}';
  const driveRaw = driveDataRaw.status === 'fulfilled' ? driveDataRaw.value : '{"results":[]}';
  const prevRaw = previousMeetingsRaw.status === 'fulfilled' ? previousMeetingsRaw.value : '{"results":[]}';

  // ── 3. AI synthesis ──
  const briefingPrompt = `You are an executive assistant preparing a meeting brief.

MEETING: "${eventTitle}"
SCHEDULED: ${eventStart}
ATTENDEES: ${attendeeEmails.join(', ') || 'Not specified'}

EMAIL CONTEXT (recent threads):
${emailRaw.slice(0, 3000)}

RELEVANT FILES FROM DRIVE:
${driveRaw.slice(0, 2000)}

PREVIOUS MEETING NOTES:
${prevRaw.slice(0, 1500)}

Generate a comprehensive meeting brief. Return ONLY valid JSON matching this schema:
{
  "summary": "2-3 sentence executive overview",
  "suggestedAgenda": ["agenda item 1", "agenda item 2", ...],
  "talkingPoints": ["key point 1", "key point 2", ...],
  "openActionItems": ["action item from email context 1", ...],
  "risks": ["risk or concern 1", ...],
  "attendeeInsights": [
    {
      "email": "person@example.com",
      "recentTopics": ["topic 1", "topic 2"],
      "sentiment": "positive|neutral|needs-attention",
      "openItems": ["item 1"]
    }
  ],
  "relevantFiles": [
    {"name": "filename", "id": "", "snippet": "why this is relevant"}
  ]
}

Focus on actionable intelligence. Be concise but thorough. Max 5 items per array.`;

  let brief: Partial<MeetingBrief> = {};
  try {
    const aiResponse = await engine.quickGenerate(
      'You are a precision executive assistant. Return only valid JSON, no markdown fences.',
      briefingPrompt,
    );

    // Strip any markdown fences if present
    const cleaned = aiResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    // Build structured brief
    const attendeeProfiles: AttendeeProfile[] = (parsed.attendeeInsights ?? []).map(
      (a: Record<string, unknown>) => ({
        email: String(a.email ?? ''),
        recentTopics: Array.isArray(a.recentTopics) ? a.recentTopics.map(String) : [],
        sentiment: ['positive', 'neutral', 'needs-attention'].includes(String(a.sentiment))
          ? (a.sentiment as AttendeeProfile['sentiment'])
          : 'neutral',
        openItems: Array.isArray(a.openItems) ? a.openItems.map(String) : [],
      })
    );

    // Add any attendees not in AI response
    for (const email of attendeeEmails) {
      if (!attendeeProfiles.find(p => p.email === email)) {
        attendeeProfiles.push({ email, recentTopics: [], sentiment: 'neutral', openItems: [] });
      }
    }

    const relevantFiles = (parsed.relevantFiles ?? []).map((f: Record<string, unknown>) => ({
      name: String(f.name ?? 'Unknown'),
      id: String(f.id ?? ''),
      snippet: String(f.snippet ?? ''),
    }));

    // Also pull real file IDs from Drive search
    try {
      const driveItems = JSON.parse(driveRaw);
      const files = Array.isArray(driveItems) ? driveItems
        : (driveItems.results ?? driveItems.files ?? []);
      for (const f of files.slice(0, 3)) {
        const fname = String(f.name ?? f.title ?? '');
        if (fname && !relevantFiles.find((rf: {name: string}) => rf.name === fname)) {
          relevantFiles.push({
            name: fname,
            id: String(f.id ?? f.fileId ?? ''),
            snippet: `Modified: ${f.modified ?? 'recently'}`,
          });
        }
      }
    } catch { /* ignore */ }

    brief = {
      title: eventTitle,
      startTime: eventStart,
      duration: 30, // default; would be from event data
      attendees: attendeeProfiles,
      relevantFiles: relevantFiles.slice(0, 5),
      suggestedAgenda: Array.isArray(parsed.suggestedAgenda) ? parsed.suggestedAgenda.map(String).slice(0, 6) : [],
      talkingPoints: Array.isArray(parsed.talkingPoints) ? parsed.talkingPoints.map(String).slice(0, 5) : [],
      openActionItems: Array.isArray(parsed.openActionItems) ? parsed.openActionItems.map(String).slice(0, 5) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 3) : [],
      summary: String(parsed.summary ?? ''),
    };
  } catch (err) {
    // Fallback brief with raw data
    brief = {
      title: eventTitle,
      startTime: eventStart,
      duration: 30,
      attendees: attendeeEmails.map(email => ({
        email, recentTopics: [], sentiment: 'neutral' as const, openItems: [],
      })),
      relevantFiles: [],
      suggestedAgenda: ['Review agenda', 'Discuss open items', 'Next steps'],
      talkingPoints: ['Check recent email history for context'],
      openActionItems: [],
      risks: [],
      summary: `Briefing for "${eventTitle}" meeting. AI synthesis unavailable: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  return NextResponse.json(brief);
}
