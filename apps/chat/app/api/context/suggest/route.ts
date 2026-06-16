/**
 * POST /api/context/suggest — suggest relevant context chips for the user's draft.
 *
 * Given a partial user message, this route:
 * 1. Uses a fast LLM call to detect intent + entities (topic, names, files)
 * 2. Runs parallel fetches: email search + file search + calendar check
 * 3. Returns ContextChip[] ranked by relevance
 *
 * Used by SmartContextBar to proactively surface context before the user sends.
 * Fast path: single short LLM call + 2-3 parallel tool calls, all under 2s.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';

interface ContextChip {
  id: string;
  type: 'email' | 'file' | 'event' | 'person' | 'memory';
  label: string;
  detail?: string;
  ref?: string;
  injectionText: string;
}

interface IntentResult {
  topic: string;         // main topic/subject keyword
  names: string[];       // people mentioned
  fileHint: string;      // likely file name keyword
  timeFrame?: string;    // "this week", "last month", etc.
  needsEmail: boolean;
  needsFile: boolean;
  needsCalendar: boolean;
}

const INTENT_SYSTEM = `You are a fast intent extractor. Given a partial chat message, extract:
- topic: 1-3 word keyword capturing the main subject
- names: array of person names or emails mentioned (empty if none)
- fileHint: best keyword to search Drive for a relevant doc (empty string if none)
- timeFrame: time reference if any ("this week", "last month", etc.), else null
- needsEmail: true if the message is about emails, inbox, communications, or a person
- needsFile: true if the message mentions a document, file, report, or anything that might be in Drive
- needsCalendar: true if the message mentions a meeting, event, schedule, calendar, availability

Return ONLY valid JSON with these 6 fields. No explanation.
Example: {"topic":"Q3 budget","names":["Alice"],"fileHint":"budget","timeFrame":"this quarter","needsEmail":true,"needsFile":true,"needsCalendar":false}`;

export async function POST(req: NextRequest) {
  const { draft, userId = 'default' } = await req.json() as { draft: string; userId?: string };

  if (!draft || draft.trim().length < 8) {
    return NextResponse.json({ chips: [] });
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o-mini', // fast model for intent detection
  });

  // Step 1: Fast intent detection
  let intent: IntentResult;
  try {
    const raw = await engine.quickGenerate(INTENT_SYSTEM, draft.slice(0, 400));
    const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    intent = JSON.parse(cleaned) as IntentResult;
  } catch {
    return NextResponse.json({ chips: [] });
  }

  const tools = getToolExecutor({ userId });
  const chips: ContextChip[] = [];

  // Step 2: Parallel fetches based on intent
  const fetches: Promise<void>[] = [];

  if (intent.needsEmail && intent.topic) {
    fetches.push((async () => {
      try {
        const raw = await tools.searchEmails(intent.topic, 'inbox', 3);
        const emails = JSON.parse(raw) as Array<{ id?: string; threadId?: string; subject?: string; from?: string; snippet?: string }>;
        if (Array.isArray(emails) && emails.length > 0) {
          const count = emails.length;
          const subjects = emails.slice(0, 2).map(e => e.subject ?? 'Email').join(', ');
          chips.push({
            id: `email-${intent.topic}`,
            type: 'email',
            label: `${count} email${count !== 1 ? 's' : ''} about "${intent.topic}"`,
            detail: subjects,
            ref: emails[0]?.threadId ?? emails[0]?.id,
            injectionText: `[Relevant emails: ${subjects}]`,
          });
        }
      } catch { /* skip */ }
    })());
  }

  if (intent.needsFile && intent.fileHint) {
    fetches.push((async () => {
      try {
        const raw = await tools.searchFiles(intent.fileHint, 'any', 3);
        const files = JSON.parse(raw) as Array<{ id?: string; name?: string; mimeType?: string; modifiedTime?: string }>;
        if (Array.isArray(files) && files.length > 0) {
          const top = files[0];
          const name = top.name ?? 'Document';
          chips.push({
            id: `file-${top.id ?? intent.fileHint}`,
            type: 'file',
            label: name.length > 30 ? name.slice(0, 27) + '…' : name,
            detail: `Last modified: ${top.modifiedTime ? new Date(top.modifiedTime).toLocaleDateString() : 'unknown'}`,
            ref: top.id,
            injectionText: `[Relevant file: "${name}" (ID: ${top.id})]`,
          });
          if (files.length > 1) {
            chips.push({
              id: `file-more-${intent.fileHint}`,
              type: 'file',
              label: `+${files.length - 1} more files`,
              detail: files.slice(1).map(f => f.name).join(', '),
              injectionText: `[Also found: ${files.slice(1).map(f => `"${f.name}"`).join(', ')}]`,
            });
          }
        }
      } catch { /* skip */ }
    })());
  }

  if (intent.needsCalendar) {
    fetches.push((async () => {
      try {
        const now = new Date();
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const raw = await tools.getCalendarEvents(now.toISOString(), weekEnd.toISOString());
        const events = JSON.parse(raw) as Array<{ id?: string; summary?: string; start?: { dateTime?: string }; attendees?: Array<{ email: string }> }>;
        if (Array.isArray(events) && events.length > 0) {
          // Find relevant events (matching topic or names)
          const relevant = events.filter(e => {
            const title = (e.summary ?? '').toLowerCase();
            return title.includes(intent.topic.toLowerCase()) ||
              intent.names.some(n => title.includes(n.toLowerCase()));
          });
          const toShow = relevant.length > 0 ? relevant : events.slice(0, 2);
          for (const ev of toShow.slice(0, 2)) {
            const title = ev.summary ?? 'Event';
            const when = ev.start?.dateTime
              ? new Date(ev.start.dateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : 'Upcoming';
            chips.push({
              id: `event-${ev.id ?? title}`,
              type: 'event',
              label: `${title.length > 25 ? title.slice(0, 22) + '…' : title}`,
              detail: when,
              ref: ev.id,
              injectionText: `[Relevant event: "${title}" on ${when}]`,
            });
          }
        }
      } catch { /* skip */ }
    })());
  }

  // Person chips
  for (const name of intent.names.slice(0, 2)) {
    chips.push({
      id: `person-${name}`,
      type: 'person',
      label: name,
      detail: `Search emails and calendar for ${name}`,
      injectionText: `[Context: looking for info about ${name}]`,
    });
  }

  await Promise.allSettled(fetches);

  // Deduplicate and limit
  const unique = chips.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i).slice(0, 6);

  return NextResponse.json({ chips: unique });
}
