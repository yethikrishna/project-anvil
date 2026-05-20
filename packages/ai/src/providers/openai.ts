/**
 * OpenAI-compatible provider — works with OpenAI, Azure OpenAI, and any
 * API that follows the OpenAI chat completions format.
 */

import type {
  AIProvider,
  Message,
  GenerationOptions,
  GenerationResult,
  StreamCallback,
  StreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  ModelInfo,
  OpenAIConfig,
  ToolCall,
} from '../types.js';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private organization?: string;
  private defaultModel: string;
  private embeddingModel: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.organization = config.organization;
    this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
    this.embeddingModel = config.embeddingModel ?? 'text-embedding-3-small';
  }

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

  private serializeMessages(messages: Message[], systemPrompt?: string): unknown[] {
    const result: unknown[] = [];

    if (systemPrompt) {
      result.push({role: 'system', content: systemPrompt});
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = msg.images?.length
          ? [
              ...msg.images.map(img => ({
                type: 'image_url',
                image_url: {url: img},
              })),
              {type: 'text', text: msg.content},
            ]
          : msg.content;
        result.push({role: 'user', content});
      } else if (msg.role === 'assistant') {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          ...(msg.toolCalls?.length
            ? {
                tool_calls: msg.toolCalls.map(tc => ({
                  id: tc.id,
                  type: 'function',
                  function: {name: tc.name, arguments: tc.arguments},
                })),
              }
            : {}),
        });
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else {
        result.push({role: msg.role, content: msg.content});
      }
    }

    return result;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
      });
      const data = (await resp.json()) as {data: {id: string}[]};
      return data.data.map(m => ({
        id: m.id,
        name: m.id,
        provider: this.name,
        contextLength: 128000,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: m.id.includes('embed'),
      }));
    } catch {
      return [];
    }
  }

  async generate(messages: Message[], options?: GenerationOptions): Promise<GenerationResult> {
    const model = options?.model ?? this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: this.serializeMessages(messages, options?.systemPrompt),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: false,
    };

    if (options?.stopSequences) {
      body.stop = options.stopSequences;
    }

    if (options?.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
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
      choices: {
        message: {
          content: string | null;
          tool_calls?: {
            id: string;
            function: {name: string; arguments: string};
          }[];
        };
        finish_reason: string;
      }[];
      model: string;
      usage: {prompt_tokens: number; completion_tokens: number; total_tokens: number};
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })) ?? [];

    return {
      text: choice.message.content ?? '',
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: choice.finish_reason,
    };
  }

  async generateStream(
    messages: Message[],
    onChunk: StreamCallback,
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const model = options?.model ?? this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: this.serializeMessages(messages, options?.systemPrompt),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      stream: true,
    };

    if (options?.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
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
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
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

          const text = delta.content ?? '';
          if (text) {
            fullText += text;
            onChunk({delta: text, done: false});
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

    onChunk({delta: '', done: true, usage});

    return {
      text: fullText,
      model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
    };
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options?.model ?? this.embeddingModel;
    const resp = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({model, input: text}),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI embedding error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      data: {embedding: number[]}[];
      model: string;
      usage: {prompt_tokens: number};
    };

    return {
      embedding: data.data[0].embedding,
      model: data.model,
      tokenCount: data.usage.prompt_tokens,
    };
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    const model = options?.model ?? this.embeddingModel;
    const resp = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({model, input: texts}),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI batch embedding error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      data: {embedding: number[]}[];
      model: string;
      usage: {prompt_tokens: number};
    };

    const tokensPerText = Math.ceil(data.usage.prompt_tokens / texts.length);

    return data.data.map(d => ({
      embedding: d.embedding,
      model: data.model,
      tokenCount: tokensPerText,
    }));
  }
}
