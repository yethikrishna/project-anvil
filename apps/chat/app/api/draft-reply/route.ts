/**
 * POST /api/draft-reply — Reads an email thread and generates a reply draft.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export async function POST(req: NextRequest) {
  const { threadId, tone = 'professional', instructions } = await req.json();

  if (!threadId) {
    return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
  }

  const tools = getToolExecutor();
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // Fetch the email thread
  const threadData = await tools.getEmailThread(threadId);

  // Generate reply
  const reply = await engine.quickGenerate(
    `You are drafting an email reply. Read the thread and write a reply.

Tone: ${tone}
${instructions ? `Additional instructions: ${instructions}` : ''}

Return a JSON object with:
- to: recipient email
- subject: reply subject (Re: ...)
- body: the email body text (plain text, well-formatted)

Return ONLY the JSON object.`,
    `Email thread: ${threadData}`
  );

  try {
    const draft = JSON.parse(reply);
    // Save as draft in mail
    if (draft.to && draft.subject && draft.body) {
      await tools.saveDraft(draft.to, draft.subject, draft.body);
    }
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ draft: { to: '', subject: '', body: reply } });
  }
}
