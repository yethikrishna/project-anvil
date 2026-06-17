/**
 * POST /api/conversation/summarize — summarize a conversation for context injection.
 *
 * Given a list of messages, produces:
 * 1. A brief narrative summary (2-3 sentences, what was discussed)
 * 2. Key decisions made
 * 3. Pending items / what was left unresolved
 * 4. Important facts extracted (names, dates, files, actions taken)
 *
 * The summary can be:
 * a) Shown to the user as a "catch me up" card
 * b) Injected as compressed context for a new conversation turn
 *    (reduces token usage on very long threads)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';

export const runtime = 'nodejs';

export interface ConversationSummary {
  narrative: string;         // 2-3 sentence human-readable summary
  decisions: string[];       // concrete decisions made
  pending: string[];         // unresolved items / next steps
  facts: string[];           // key facts: names, dates, files, actions completed
  compressedContext: string; // single string for system prompt injection
  messageCount: number;
  generatedAt: string;
}

const SUMMARY_SYSTEM = `You are a conversation analyst. Summarize a chat conversation between a user and an AI assistant.

Return valid JSON with this exact structure:
{
  "narrative": "2-3 sentence summary of what was discussed and accomplished",
  "decisions": ["Decision 1", "Decision 2"],
  "pending": ["Unresolved item 1", "Pending task 1"],
  "facts": ["Alice manages the Q3 project", "Budget meeting is Friday 3pm", "Doc: 'Strategy v2.docx' was shared"]
}

Be concise and factual. Focus on what's actionable. Do not repeat obvious pleasantries.
Return ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  const { messages, mode = 'full' } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    mode?: 'full' | 'compressed';
  };

  if (!messages || messages.length < 3) {
    return NextResponse.json({
      narrative: 'Conversation is too short to summarize.',
      decisions: [],
      pending: [],
      facts: [],
      compressedContext: '',
      messageCount: messages?.length ?? 0,
      generatedAt: new Date().toISOString(),
    } as ConversationSummary);
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // Trim messages to avoid huge contexts (keep last 30)
  const trimmed = messages
    .filter(m => m.role !== 'system')
    .slice(-30)
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 600)}`)
    .join('\n\n');

  const raw = await engine.quickGenerate(SUMMARY_SYSTEM, `CONVERSATION:\n\n${trimmed}`);

  let summary: Omit<ConversationSummary, 'compressedContext' | 'messageCount' | 'generatedAt'>;

  try {
    const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    summary = JSON.parse(cleaned);
  } catch {
    // Fallback: use raw text as narrative
    summary = {
      narrative: raw.slice(0, 400),
      decisions: [],
      pending: [],
      facts: [],
    };
  }

  // Build compressed context string for system prompt injection
  const parts: string[] = [`CONVERSATION SUMMARY: ${summary.narrative}`];
  if (summary.decisions?.length) parts.push(`DECISIONS: ${summary.decisions.join('; ')}`);
  if (summary.pending?.length) parts.push(`PENDING: ${summary.pending.join('; ')}`);
  if (summary.facts?.length) parts.push(`KEY FACTS: ${summary.facts.join('; ')}`);

  const compressedContext = parts.join('\n');

  return NextResponse.json({
    ...summary,
    decisions: summary.decisions ?? [],
    pending: summary.pending ?? [],
    facts: summary.facts ?? [],
    compressedContext,
    messageCount: messages.filter(m => m.role !== 'system').length,
    generatedAt: new Date().toISOString(),
  } as ConversationSummary);
}
