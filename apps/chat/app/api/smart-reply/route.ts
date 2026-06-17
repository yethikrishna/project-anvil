/**
 * POST /api/smart-reply — Generate 3 smart reply options for an email thread.
 *
 * Given a thread (subject + body chain), generates:
 * - Short acknowledge reply ("Got it, will follow up")
 * - Standard reply (complete professional response)
 * - Detailed reply (full context + reasoning)
 *
 * Designed for the in-chat "Smart Reply" chips that surface after
 * email_read_thread tool results.
 *
 * Body: { subject, thread, tone?, context? }
 * Returns: { replies: SmartReply[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface SmartReply {
  id: string;
  label: string;          // Short chip label ("Acknowledge", "Accept", "Decline", "Follow up")
  length: 'short' | 'medium' | 'long';
  body: string;           // Full reply text, ready to send
  tone: string;           // "professional", "friendly", "firm"
  sentiment: 'positive' | 'neutral' | 'negative' | 'question';
}

export async function POST(req: NextRequest) {
  const { subject, thread, tone, context: emailContext, senderName } = await req.json() as {
    subject: string;
    thread: string;
    tone?: string;
    context?: string;
    senderName?: string;
  };

  if (!thread) {
    return NextResponse.json({ error: 'Thread content required' }, { status: 400 });
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  const desiredTone = tone ?? 'professional';
  const sender = senderName ? `from ${senderName}` : '';
  const contextNote = emailContext ? `\n\nContext: ${emailContext}` : '';
  const maxThreadLength = 4000;
  const trimmedThread = thread.length > maxThreadLength
    ? thread.slice(0, maxThreadLength) + '\n...[earlier messages truncated]'
    : thread;

  const prompt = `You are an expert email assistant. Generate exactly 3 smart reply options for this email thread.

SUBJECT: ${subject || '(no subject)'}
THREAD ${sender}:
${trimmedThread}
${contextNote}

DESIRED TONE: ${desiredTone}

Generate 3 distinct reply options:
1. A SHORT acknowledge/quick reply (1-2 sentences, conversational)
2. A MEDIUM professional reply (2-4 sentences, complete response)  
3. A LONG detailed reply (full context, thorough, with any required action items)

Each reply should feel natural and be ready to send as-is.
Vary the sentiment/approach when it makes sense (e.g., accepting, declining, asking clarifying question).

Return ONLY a JSON array of exactly 3 objects with this structure:
[
  {
    "id": "reply_1",
    "label": "Quick Acknowledge",
    "length": "short",
    "body": "...",
    "tone": "professional",
    "sentiment": "neutral"
  },
  ...
]

Valid sentiment values: positive, neutral, negative, question
Valid length values: short, medium, long
Make the "label" field short (2-3 words) — it will appear as a clickable chip.`;

  try {
    const raw = await engine.quickGenerate('', prompt);

    // Extract JSON from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array in response');
    }

    const replies = JSON.parse(jsonMatch[0]) as SmartReply[];

    if (!Array.isArray(replies) || replies.length === 0) {
      throw new Error('Invalid reply format');
    }

    // Ensure IDs are unique and present
    const normalized = replies.slice(0, 3).map((r, i) => ({
      ...r,
      id: r.id ?? `reply_${i + 1}`,
      label: r.label ?? ['Quick Reply', 'Professional Reply', 'Detailed Reply'][i],
      length: r.length ?? (['short', 'medium', 'long'][i] as 'short' | 'medium' | 'long'),
      sentiment: r.sentiment ?? 'neutral',
    }));

    return NextResponse.json({ replies: normalized });
  } catch (err) {
    console.error('[smart-reply] Error:', err);
    // Fallback: return minimal stub replies so UI doesn't break
    return NextResponse.json({
      replies: [
        {
          id: 'reply_1',
          label: 'Acknowledge',
          length: 'short',
          body: 'Thanks for reaching out. I\'ll look into this and get back to you shortly.',
          tone: desiredTone,
          sentiment: 'neutral',
        },
        {
          id: 'reply_2',
          label: 'Follow Up',
          length: 'medium',
          body: `Thank you for your email regarding "${subject || 'this matter'}". I've reviewed your message and will respond with more detail soon. Please let me know if you need anything in the meantime.`,
          tone: desiredTone,
          sentiment: 'positive',
        },
      ] satisfies SmartReply[],
    });
  }
}
