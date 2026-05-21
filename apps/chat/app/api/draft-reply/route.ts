/**
 * POST /api/draft-reply — Reads an email thread and generates a reply draft.
 *
 * Flow:
 * 1. Fetch email thread by ID
 * 2. AI analyzes thread context, tone, and intent
 * 3. Generate reply with matching tone
 * 4. Save to Mail drafts
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export async function POST(req: NextRequest) {
  const { threadId, tone = 'professional', instructions, userId } = await req.json();

  if (!threadId) {
    return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  // Fetch the email thread
  const threadData = await tools.getEmailThread(threadId);

  // Generate reply with detailed instructions
  const reply = await engine.quickGenerate(
    `You are an executive assistant drafting an email reply.

Read the thread carefully and write an appropriate reply.

TONE: ${tone}
${instructions ? `ADDITIONAL INSTRUCTIONS: ${instructions}` : ''}

GUIDELINES:
- Match the formality level of the original thread
- Reference specific points from the thread
- Be concise but thorough
- If there are action items, address them clearly
- Include a clear next step or call-to-action

Return a JSON object with EXACTLY these fields:
{
  "to": "recipient email address",
  "subject": "reply subject (Re: ... format)",
  "body": "email body as plain text, well-formatted with paragraphs",
  "cc": "CC recipients if any, or empty string",
  "summary": "1 sentence summary of what your reply says"
}

Return ONLY the JSON object. No markdown, no code fences.`,
    `EMAIL THREAD:\n${threadData}`,
  );

  try {
    // Try to extract JSON from response
    let draft;
    try {
      draft = JSON.parse(reply);
    } catch {
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) {
        draft = JSON.parse(match[0]);
      } else {
        return NextResponse.json({
          draft: { to: '', subject: '', body: reply, summary: 'AI-generated reply' },
        });
      }
    }

    // Save as draft in mail
    if (draft.to && draft.subject && draft.body) {
      await tools.saveDraft(draft.to, draft.subject, draft.body);
    }

    return NextResponse.json({
      draft: {
        to: draft.to ?? '',
        subject: draft.subject ?? '',
        body: draft.body ?? '',
        cc: draft.cc ?? '',
        summary: draft.summary ?? '',
      },
    });
  } catch {
    return NextResponse.json({
      draft: { to: '', subject: '', body: reply, summary: '' },
    });
  }
}
