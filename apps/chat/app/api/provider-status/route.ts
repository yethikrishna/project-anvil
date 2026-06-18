/**
 * GET /api/provider-status — AI provider configuration status.
 *
 * Returns which AI providers are configured and what the active routing
 * strategy is. Used by the chat UI to show model indicators.
 *
 * Does NOT expose API keys — only whether they are configured.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const hasOpenAI = !!(process.env.OPENAI_API_KEY);
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY);
  const hasOllama = !!(process.env.OLLAMA_URL || process.env.OLLAMA_API_URL);

  const openaiModel = process.env.AI_MODEL ?? 'gpt-4o';
  const anthropicModel = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
  const fastModel = process.env.AI_FAST_MODEL ?? 'gpt-4o-mini';

  const useSmartRouter = hasOpenAI && hasAnthropic;

  return NextResponse.json({
    configured: {
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      ollama: hasOllama,
    },
    routing: useSmartRouter ? 'smart' : (hasAnthropic ? 'anthropic' : 'openai'),
    models: {
      primary: useSmartRouter ? `${anthropicModel} + ${openaiModel}` : (hasAnthropic ? anthropicModel : openaiModel),
      writing: hasAnthropic ? anthropicModel : openaiModel,
      tools: hasOpenAI ? openaiModel : (hasAnthropic ? anthropicModel : 'none'),
      fast: hasOpenAI ? fastModel : (hasAnthropic ? 'claude-3-5-haiku-20241022' : 'none'),
    },
    smartRouting: useSmartRouter,
    description: useSmartRouter
      ? `Smart routing: Claude for writing/analysis, ${openaiModel} for tool use`
      : hasAnthropic
        ? `Anthropic Claude: ${anthropicModel}`
        : hasOpenAI
          ? `OpenAI: ${openaiModel}`
          : 'No AI provider configured',
  });
}
