/**
 * POST /api/follow-up — AI-powered follow-up tracker.
 *
 * Scans emails you've sent (or are currently viewing) and identifies:
 * - Emails you sent but haven't heard back on (> N days)
 * - Action items others promised but haven't delivered
 * - Replies you need to send
 *
 * Returns structured follow-up items with priority and suggested action.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 45;

export interface FollowUpItem {
  id: string;
  type: 'awaiting-reply' | 'promised-by-them' | 'need-to-reply' | 'overdue-task';
  priority: 'high' | 'medium' | 'low';
  subject: string;
  contact: string;
  contactEmail?: string;
  daysSince: number;
  context: string;
  suggestedAction: string;
  suggestedDraft?: string;
}

export async function POST(req: NextRequest) {
  const { userId, lookbackDays = 14 } = await req.json() as {
    userId?: string;
    lookbackDays?: number;
  };

  const tools = getToolExecutor({ userId });
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // Fetch sent emails from the past N days
  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const sentEmailsRaw = await tools.searchEmails(
    `after:${cutoffDate.toISOString().split('T')[0]}`,
    'sent',
    30,
  );

  const unreadRaw = await tools.searchEmails('is:unread', 'inbox', 20);

  const aiPrompt = `You are an executive follow-up tracker. Analyze email data to identify follow-ups needed.

SENT EMAILS (last ${lookbackDays} days):
${sentEmailsRaw.slice(0, 2500)}

CURRENT UNREAD INBOX:
${unreadRaw.slice(0, 2000)}

TODAY: ${new Date().toISOString()}

Identify follow-up items across these categories:
1. "awaiting-reply" — emails you sent that haven't received a reply in 3+ days
2. "promised-by-them" — emails where someone promised to do something and hasn't followed through
3. "need-to-reply" — unread emails that need a response from you
4. "overdue-task" — action items from email threads that are overdue

Return ONLY valid JSON array (no markdown fences):
[
  {
    "id": "unique-id",
    "type": "awaiting-reply|promised-by-them|need-to-reply|overdue-task",
    "priority": "high|medium|low",
    "subject": "email subject",
    "contact": "person's name",
    "contactEmail": "email@example.com",
    "daysSince": <number>,
    "context": "brief context about what this is about",
    "suggestedAction": "specific action to take"
  }
]

Max 8 items. Prioritize HIGH items first. Be ruthlessly specific — vague follow-ups are useless.
If data is insufficient, return an empty array [].`;

  try {
    const response = await engine.quickGenerate(
      'You are a follow-up tracker. Return only valid JSON array.',
      aiPrompt,
    );

    const cleaned = response.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const items: FollowUpItem[] = JSON.parse(cleaned);

    // Ensure IDs are unique
    items.forEach((item, i) => {
      if (!item.id) item.id = `fu-${Date.now()}-${i}`;
    });

    return NextResponse.json({ items, generatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({
      items: [],
      error: err instanceof Error ? err.message : 'Failed to analyze follow-ups',
      generatedAt: new Date().toISOString(),
    });
  }
}
