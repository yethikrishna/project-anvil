/**
 * POST /api/conversations/auto-title
 *
 * Generates a short, punchy title for a conversation based on
 * the first user message + AI response.
 *
 * Uses a fast small model call (~200ms) to create titles like:
 * - "Q3 budget review email draft"
 * - "Meet with Sarah — availability check"
 * - "Find Q2 strategy doc + share"
 *
 * Called automatically after the first assistant reply.
 * Falls back to truncated first message if AI call fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';

export const runtime = 'nodejs';

const TITLE_SYSTEM = `Generate a very short title for this conversation.

Rules:
- Max 6 words
- No quotes, no punctuation at end
- Use action verbs when possible (Draft, Find, Schedule, Review, Search...)
- Be specific about what was discussed
- No "User asked about" — just describe the topic/action directly

Examples:
- "Draft reply to investor email"
- "Q3 strategy doc search"  
- "Schedule meeting with Sarah"
- "Weekly inbox triage"
- "Find Q2 budget spreadsheet"
- "Summarize project status"

Return ONLY the title. Nothing else.`;

export async function POST(req: NextRequest) {
  const { firstUserMessage, firstAssistantMessage } = await req.json() as {
    firstUserMessage: string;
    firstAssistantMessage?: string;
  };

  if (!firstUserMessage) {
    return NextResponse.json({ title: 'New conversation' });
  }

  // Fast fallback: truncate the first message
  const fallback = firstUserMessage.slice(0, 50).replace(/\n/g, ' ').trim();
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_URL) {
    return NextResponse.json({ title: fallback });
  }

  try {
    const engine = new ChatEngine({
      aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.AI_FAST_MODEL ?? process.env.AI_MODEL ?? 'gpt-4o-mini',
    });

    const context = firstAssistantMessage
      ? `User: ${firstUserMessage.slice(0, 400)}\n\nAssistant: ${firstAssistantMessage.slice(0, 200)}`
      : `User: ${firstUserMessage.slice(0, 400)}`;

    const title = await engine.quickGenerate(TITLE_SYSTEM, context);

    // Sanitize
    const clean = title
      .trim()
      .replace(/^["']|["']$/g, '')   // remove surrounding quotes
      .replace(/\.$/, '')              // remove trailing period
      .slice(0, 70);                   // hard cap

    return NextResponse.json({ title: clean || fallback });
  } catch {
    return NextResponse.json({ title: fallback });
  }
}
