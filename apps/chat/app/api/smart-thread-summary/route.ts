/**
 * POST /api/smart-thread-summary — AI-powered email thread summarizer.
 *
 * Given a thread ID, fetches the full thread, analyzes it, and returns:
 * - One-line TLDR
 * - Key decisions made
 * - Open questions / items needing response
 * - Recommended reply (optional)
 * - Sentiment: positive/neutral/tense/urgent
 * - Participants and their roles in the conversation
 *
 * Used by: inline email previews, draft-reply acceleration, inbox triage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface ThreadSummary {
  tldr: string;
  keyPoints: string[];
  openItems: string[];
  sentiment: 'positive' | 'neutral' | 'tense' | 'urgent';
  recommendedAction: 'reply' | 'archive' | 'forward' | 'wait' | 'urgent_reply';
  actionReason: string;
  participants: Array<{
    name: string;
    email: string;
    role: 'sender' | 'recipient' | 'cc';
    lastMessage?: string;
  }>;
  suggestedReply?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export async function POST(req: NextRequest) {
  const { threadId, includeReply = false, userId = 'default' } = await req.json() as {
    threadId: string;
    includeReply?: boolean;
    userId?: string;
  };

  if (!threadId) {
    return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });

  // Fetch thread
  let threadContent: string;
  try {
    threadContent = await tools.getEmailThread(threadId);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 });
  }

  // Parse thread content (our tool returns JSON)
  let threadData: Record<string, unknown> = {};
  try {
    threadData = JSON.parse(threadContent) as Record<string, unknown>;
  } catch {
    // Raw text fallback
    threadData = { raw: threadContent };
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  });

  const systemPrompt = `You are an executive assistant AI analyzing email threads.
Analyze the thread and return a JSON object with exactly these fields:
- tldr: string (one sentence, max 100 chars)
- keyPoints: string[] (2-4 bullet points of what was decided/discussed)
- openItems: string[] (items needing response or follow-up, may be empty)
- sentiment: "positive" | "neutral" | "tense" | "urgent"
- recommendedAction: "reply" | "archive" | "forward" | "wait" | "urgent_reply"
- actionReason: string (one sentence why)
- participants: Array<{name: string, email: string, role: "sender"|"recipient"|"cc"}>
- urgency: "low" | "medium" | "high" | "critical"
${includeReply ? '- suggestedReply: string (a concise, professional draft reply)' : ''}

Return ONLY valid JSON, no markdown, no explanation.`;

  const userPrompt = `Email thread:\n${JSON.stringify(threadData, null, 2).slice(0, 8000)}`;

  try {
    const raw = await engine.quickGenerate(systemPrompt, userPrompt);
    const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const summary = JSON.parse(cleaned) as ThreadSummary;

    return NextResponse.json(summary);
  } catch {
    // Fallback summary
    const fallback: ThreadSummary = {
      tldr: 'Email thread (AI summary unavailable)',
      keyPoints: [],
      openItems: [],
      sentiment: 'neutral',
      recommendedAction: 'reply',
      actionReason: 'Review and respond as appropriate.',
      participants: [],
      urgency: 'medium',
    };
    return NextResponse.json(fallback);
  }
}
