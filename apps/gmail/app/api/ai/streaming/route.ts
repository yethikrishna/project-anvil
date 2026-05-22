/**
 * Mail AI Streaming API — Server-Sent Events for real-time AI output.
 *
 * POST /api/ai/streaming
 * Body: { action: string, payload: any }
 *
 * Returns text/event-stream with chunks as they're generated.
 * Supports: compose, summarize-thread, smart-reply, digest, translate-draft
 */

import {createAI} from '@anvil/ai';

function getAI() {
  return createAI({
    provider: (process.env.AI_PROVIDER as 'openai' | 'ollama') || 'ollama',
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3',
  });
}

function buildPrompt(action: string, payload: Record<string, unknown>): {system: string; user: string} {
  switch (action) {
    case 'compose': {
      const threadMessages = (payload.threadMessages as Array<{from: string; body: string; date: string}>) || [];
      const intent = (payload.intent as string) || 'new';
      const tone = (payload.tone as string) || 'professional';
      const length = (payload.length as string) || 'medium';
      const style = (payload.writingStyle as string) || 'professional, moderate length';
      const userDescription = (payload.description as string) || '';

      const lengthGuide = length === 'brief' ? 'Keep it to 2-3 sentences.'
        : length === 'detailed' ? 'Write a thorough, detailed response with multiple paragraphs.'
        : 'Write 1-2 paragraphs.';

      const threadContext = threadMessages.length > 0
        ? `\n\nThread context:\n${threadMessages.slice(-5).map((m, i) => `[${i + 1}] From: ${m.from}\n${m.body.slice(0, 400)}`).join('\n\n')}`
        : '';

      return {
        system: `You are an AI email writing assistant. Write emails that match the user's style: ${style}.
Tone: ${tone}. ${lengthGuide}
${intent === 'reply' ? 'This is a reply to an existing thread. Address the latest message.' : 'This is a new email.'}
Output ONLY the email body text — no subject line, no metadata, no commentary.`,
        user: threadContext
          ? `${userDescription ? `What to write: ${userDescription}\n\n` : ''}${threadContext}`
          : `Write an email${userDescription ? `: ${userDescription}` : ` to ${payload.to || 'recipient'}`}`,
      };
    }

    case 'summarize-thread': {
      const messages = (payload.messages as Array<{from: string; body: string; date: string}>) || [];
      const subject = (payload.subject as string) || 'No Subject';
      const threadText = messages.map((m, i) =>
        `[Message ${i + 1}] From: ${m.from} (${m.date})\n${m.body.slice(0, 600)}`
      ).join('\n\n');

      return {
        system: `Analyze this email thread. Provide:
1. A 2-3 sentence summary
2. Key points (JSON array)
3. Action items (JSON array)
4. Sentiment: positive|neutral|negative|urgent
5. Deadlines mentioned (JSON array)

Output JSON only: {"summary":"...","keyPoints":["..."],"actionItems":["..."],"sentiment":"...","deadlines":["..."]}`,
        user: `Subject: ${subject}\n\n${threadText}`,
      };
    }

    case 'smart-reply': {
      const msgFrom = (payload.from as string) || '';
      const msgBody = (payload.body as string) || '';
      const msgSubject = (payload.subject as string) || '';
      const tone = (payload.tone as string) || 'professional';

      return {
        system: `Generate 3 smart reply options for this email.
Tone: ${tone}. Each reply should be 1-3 sentences, distinct in approach.
Output JSON array only: [{"text":"...","tone":"professional|casual|brief","label":"short label"}]`,
        user: `From: ${msgFrom}\nSubject: ${msgSubject}\n\n${msgBody.slice(0, 800)}`,
      };
    }

    case 'digest': {
      const emails = (payload.emails as Array<{from: string; subject: string; body: string; date: string}>) || [];
      const emailList = emails.slice(0, 30).map((e, i) =>
        `[${i + 1}] From: ${e.from} | ${e.subject}\n${e.body.slice(0, 200)}`
      ).join('\n\n');

      return {
        system: `Summarize these unread emails into a concise daily digest.
Group by category (Action Needed, FYI, Updates, Personal).
Highlight anything urgent or requiring response.
Use bullet points. Be brief but informative.`,
        user: emailList,
      };
    }

    case 'translate-draft': {
      const text = (payload.text as string) || '';
      const targetLang = (payload.targetLanguage as string) || 'English';

      return {
        system: `Translate the following email draft into ${targetLang}. Preserve the tone and formatting. Output ONLY the translated text.`,
        user: text,
      };
    }

    default:
      throw new Error(`Unsupported streaming action: ${action}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {action: string; payload: Record<string, unknown>};
    const ai = getAI();
    const {system, user} = buildPrompt(body.action, body.payload);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await ai.stream(
            [
              {role: 'system', content: system},
              {role: 'user', content: user},
            ],
            (chunk: {delta: string}) => {
              const data = JSON.stringify({
                type: 'delta',
                text: chunk.delta,
                done: false,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            },
            {temperature: 0.3, maxTokens: 2000},
          );

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({type: 'done', done: true})}\n\n`));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({type: 'error', error: msg})}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI streaming failed';
    return Response.json({error: message}, {status: 500});
  }
}
