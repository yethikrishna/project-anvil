/**
 * @anvil/ai/models — Enhanced OpenAI-Compatible Client
 *
 * Full-featured client for OpenAI, Azure OpenAI, and compatible APIs
 * (LiteLLM, Together, Groq, Mistral, etc.) with structured outputs,
 * function calling, and response streaming.
 */

import type {
  Message,
  GenerationOptions,
  GenerationResult,
  StreamCallback,
  EmbeddingOptions,
  EmbeddingResult,
  OpenAIConfig,
  ToolCall,
} from '../types.js';

// ── Extended Types ─────────────────────────────────────

export interface OpenAIChatOptions extends GenerationOptions {
  /** Frequency penalty (-2 to 2) */
  frequencyPenalty?: number;
  /** Presence penalty (-2 to 2) */
  presencePenalty?: number;
  /** Response format: 'text' | 'json_object' | { type: 'json_schema', json_schema: ... } */
  responseFormat?: 'text' | 'json_object' | Record<string, unknown>;
  /** Seed for deterministic sampling */
  seed?: number;
  /** User ID for abuse monitoring */
  user?: string;
  /** Enable log probabilities */
  logProbs?: boolean;
  /** Number of top log probabilities to return */
  topLogProbs?: number;
  /** Number of completions to generate (default: 1) */
  n?: number;
}

export interface OpenAIModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

export interface OpenAITokenCount {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cost estimate in USD */
  estimatedCost?: number;
}

// ── Pricing (per 1M tokens, approximate) ───────────────

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

// ── OpenAI Client ──────────────────────────────────────

export class OpenAIClient {
  private apiKey: string;
  private baseUrl: string;
  private organization?: string;
  private defaultModel: string;
  private embeddingModel: string;
  private tokenUsage: OpenAITokenCount = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.organization = config.organization;
    this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
    this.embeddingModel = config.embeddingModel ?? 'text-embedding-3-small';
  }

  // ── Headers ─────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.organization) {
      h['OpenAI-Organization'] = this.organization;
    }
    return h;
  }

  // ── Chat Completions ────────────────────────────

  /**
   * Full-featured chat completion.
   */
  async chat(
    messages: Message[],
    options: OpenAIChatOptions = {},
  ): Promise<GenerationResult & { usage: NonNullable<GenerationResult['usage']> }> {
    const model = options.model ?? this.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: this.serializeMessages(messages, options.systemPrompt),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: false,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      seed: options.seed,
      user: options.user,
    };

    // Remove undefined values
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);

    if (options.stopSequences) body.stop = options.stopSequences;
    if (options.responseFormat) body.response_format = options.responseFormat;
    if (options.logProbs) {
      body.logprobs = true;
      body.top_logprobs = options.topLogProbs ?? 5;
    }
    if (options.n) body.n = options.n;

    if (options.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI API error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason: string;
      }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })) ?? [];

    const usage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };

    // Track usage
    this.tokenUsage.promptTokens += usage.promptTokens;
    this.tokenUsage.completionTokens += usage.completionTokens;
    this.tokenUsage.totalTokens += usage.totalTokens;

    // Estimate cost
    const pricing = PRICING[model] ?? PRICING['gpt-4o-mini'];
    const estimatedCost = (usage.promptTokens / 1_000_000) * pricing.input + (usage.completionTokens / 1_000_000) * pricing.output;
    this.tokenUsage.estimatedCost = (this.tokenUsage.estimatedCost ?? 0) + estimatedCost;

    return {
      text: choice.message.content ?? '',
      model: data.model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: choice.finish_reason,
    };
  }

  /**
   * Streaming chat completion.
   */
  async chatStream(
    messages: Message[],
    onChunk: StreamCallback,
    options: OpenAIChatOptions = {},
  ): Promise<GenerationResult> {
    const model = options.model ?? this.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: this.serializeMessages(messages, options.systemPrompt),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI streaming error (${resp.status}): ${error}`);
    }

    let fullText = '';
    let finishReason = 'stop';
    let usage: GenerationResult['usage'];
    const toolCalls: ToolCall[] = [];

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6));
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            onChunk({ delta: delta.content, done: false });
          }

          // Accumulate tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCalls.find(t => t.id === tc.id);
              if (existing) {
                existing.arguments += tc.function?.arguments ?? '';
              } else if (tc.id) {
                toolCalls.push({
                  id: tc.id,
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                });
              }
            }
          }

          if (chunk.choices?.[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason;
          }
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    onChunk({ delta: '', done: true, usage });

    return {
      text: fullText,
      model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }

  // ── Embeddings ──────────────────────────────────

  /**
   * Generate embedding(s) with dimension control.
   */
  async embed(
    text: string | string[],
    options?: EmbeddingOptions & { dimensions?: number },
  ): Promise<EmbeddingResult[]> {
    const model = options?.model ?? this.embeddingModel;
    const input = Array.isArray(text) ? text : [text];

    const body: Record<string, unknown> = { model, input };
    if (options?.dimensions) body.dimensions = options.dimensions;

    const resp = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI embed error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      model: string;
      usage: { prompt_tokens: number };
    };

    const tokensPerText = Math.ceil(data.usage.prompt_tokens / input.length);

    return data.data.map(d => ({
      embedding: d.embedding,
      model: data.model,
      tokenCount: tokensPerText,
    }));
  }

  // ── Moderation ──────────────────────────────────

  /**
   * Check text for policy violations.
   */
  async moderate(text: string): Promise<OpenAIModerationResult> {
    const resp = await fetch(`${this.baseUrl}/moderations`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ input: text }),
    });

    if (!resp.ok) {
      // If moderation fails, assume safe
      return { flagged: false, categories: {}, category_scores: {} };
    }

    const data = (await resp.json()) as {
      results: Array<{
        flagged: boolean;
        categories: Record<string, boolean>;
        category_scores: Record<string, number>;
      }>;
    };

    return data.results[0] ?? { flagged: false, categories: {}, category_scores: {} };
  }

  // ── Token Counting ──────────────────────────────

  /**
   * Estimate token count for text (rough: ~4 chars per token).
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get accumulated token usage and cost.
   */
  getTokenUsage(): OpenAITokenCount {
    return { ...this.tokenUsage };
  }

  /**
   * Reset token usage tracking.
   */
  resetTokenUsage(): void {
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  // ── Private ─────────────────────────────────────

  private serializeMessages(messages: Message[], systemPrompt?: string): unknown[] {
    const result: unknown[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = msg.images?.length
          ? [
              ...msg.images.map(img => ({ type: 'image_url', image_url: { url: img } })),
              { type: 'text', text: msg.content },
            ]
          : msg.content;
        result.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          ...(msg.toolCalls?.length
            ? { tool_calls: msg.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })) }
            : {}),
        });
      } else if (msg.role === 'tool') {
        result.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }
}
