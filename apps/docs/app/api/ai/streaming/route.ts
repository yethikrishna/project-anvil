/**
 * Docs AI Streaming API — Server-Sent Events endpoint for real-time AI output.
 *
 * POST /api/ai/streaming
 * Body: { action: string, payload: any }
 *
 * Returns text/event-stream with chunks as they're generated.
 * Supports: rewrite, draft, suggest, continue, improve, translate, compose
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
    case 'rewrite': {
      const modeInstructions: Record<string, string> = {
        'shorter': 'Make more concise while preserving all key information. Reduce word count by ~40%.',
        'formal': 'Rewrite in a formal, professional tone suitable for business communication.',
        'casual': 'Rewrite in a casual, friendly tone. Keep it natural and conversational.',
        'fix-grammar': 'Fix any grammar, spelling, punctuation, or style errors. Preserve meaning and tone.',
        'longer': 'Expand with more detail, examples, and explanation. Add ~50% more content.',
        'bullet-points': 'Convert into clear, well-structured bullet points.',
      };
      const mode = (payload.mode as string) || 'fix-grammar';
      return {
        system: 'You are an expert writing assistant. Output ONLY the rewritten text. No commentary, no markdown fences.',
        user: `${modeInstructions[mode] || modeInstructions['fix-grammar']}\n\nText to rewrite:\n${payload.text}`,
      };
    }
    case 'draft': {
      return {
        system: `Generate well-structured HTML content (h1-h3, p, ul, ol, li, strong, em, blockquote).
Match the requested tone: ${(payload.tone as string) || 'professional'}.
Be substantive — real content, not placeholders. No CSS, no body/html tags.`,
        user: `Write a ${(payload.documentType as string) || 'general'} document based on this description:\n\n${payload.description}`,
      };
    }
    case 'suggest': {
      const before = ((payload.textBefore as string) || '').slice(-200);
      const after = ((payload.textAfter as string) || '').slice(0, 200);
      return {
        system: 'Suggest what comes next. Output ONLY the continuation text, 1-3 sentences. Match tone/style of surrounding text. Do not repeat existing text.',
        user: `Context: ${((payload.documentContext as string) || '').slice(-500)}\n\nBefore cursor: "${before}"\nAfter cursor: "${after}"`,
      };
    }
    case 'continue': {
      return {
        system: 'Continue the text naturally. Output ONLY the continuation, 2-4 sentences. Match style and tone. Do not repeat what was written.',
        user: `Context: ${((payload.documentContext as string) || '').slice(-500)}\n\nContinue from: "${((payload.textBefore as string) || '').slice(-400)}"`,
      };
    }
    case 'improve': {
      return {
        system: 'Improve clarity, readability, sentence structure, flow, and word choice. Remove redundancy. Maintain original meaning and tone. Output ONLY the improved text.',
        user: `Improve this text:\n\n${payload.text}`,
      };
    }
    case 'translate': {
      const source = payload.sourceLanguage ? ` from ${payload.sourceLanguage}` : '';
      const fmt = payload.preserveFormatting ? ' Preserve all HTML formatting tags.' : '';
      return {
        system: `Translate the following text${source} into ${payload.targetLanguage}.${fmt} Output ONLY the translated text.`,
        user: payload.text as string,
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
            (chunk) => {
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
