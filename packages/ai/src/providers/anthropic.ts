/**
 * Anthropic Claude provider for @anvil/ai
 *
 * Supports:
 * - Claude 3.5 Sonnet / Haiku / Opus
 * - Streaming with extended thinking (claude-3-7-sonnet+)
 * - Tool use (function calling)
 * - Vision (image input)
 *
 * API Docs: https://docs.anthropic.com/en/api
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
  ToolCall,
} from '../types.js';

// ── Anthropic API types ──

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicThinkingBlock | AnthropicToolUseBlock;

interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: 'text_delta' | 'thinking_delta' | 'input_json_delta';
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
  content_block?: AnthropicContentBlock;
  message?: Partial<AnthropicMessage>;
  usage?: { input_tokens: number; output_tokens: number };
}

// ── Config ──

export interface AnthropicConfig {
  type: 'anthropic';
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  /** Beta header for extended thinking */
  betaFeatures?: string[];
}

// ── Provider ──

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private betaFeatures: string[];

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.defaultModel = config.defaultModel ?? 'claude-3-5-sonnet-20241022';
    this.betaFeatures = config.betaFeatures ?? [];
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (this.betaFeatures.length > 0) {
      h['anthropic-beta'] = this.betaFeatures.join(',');
    }
    return h;
  }

  // ── Message serialization ──

  private serializeMessages(
    messages: Message[],
    systemPrompt?: string,
  ): { system?: string; messages: unknown[] } {
    const result: unknown[] = [];
    let system: string | undefined = systemPrompt;

    // Anthropic wants system as top-level param, not as a message
    // Merge multiple system messages into one
    const systemMessages: string[] = [];
    if (systemPrompt) systemMessages.push(systemPrompt);

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content as string);
        continue;
      }

      if (msg.role === 'user') {
        const contentParts: unknown[] = [];

        // Images
        if (msg.images?.length) {
          for (const img of msg.images) {
            if (img.startsWith('data:')) {
              const [header, data] = img.split(',');
              const mediaType = header.split(';')[0].split(':')[1];
              contentParts.push({
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data },
              });
            } else {
              contentParts.push({
                type: 'image',
                source: { type: 'url', url: img },
              });
            }
          }
        }

        contentParts.push({ type: 'text', text: msg.content as string });
        result.push({ role: 'user', content: contentParts });

      } else if (msg.role === 'assistant') {
        const content: unknown[] = [];

        // Tool calls in assistant message
        if (msg.toolCalls?.length) {
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            let parsedInput: unknown = {};
            try { parsedInput = JSON.parse(tc.arguments ?? '{}'); } catch { /* keep empty */ }
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: parsedInput,
            });
          }
        } else {
          content.push({ type: 'text', text: msg.content as string ?? '' });
        }

        result.push({ role: 'assistant', content });

      } else if (msg.role === 'tool') {
        // Tool result — Anthropic wraps these in a user message
        const prev = result[result.length - 1] as { role: string; content: unknown[] } | undefined;
        const toolResult = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content as string,
        };
        if (prev?.role === 'user' && Array.isArray(prev.content)) {
          // Append to existing user message
          prev.content.push(toolResult);
        } else {
          result.push({ role: 'user', content: [toolResult] });
        }
      }
    }

    if (systemMessages.length > 0) {
      system = systemMessages.join('\n\n');
    }

    return { system, messages: result };
  }

  private serializeTools(tools?: GenerationOptions['tools']): unknown[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  private buildBody(
    messages: Message[],
    options: GenerationOptions,
    stream: boolean,
  ): Record<string, unknown> {
    const model = options.model ?? this.defaultModel;
    const { system, messages: serialized } = this.serializeMessages(messages, options.systemPrompt);
    const tools = this.serializeTools(options.tools);

    const body: Record<string, unknown> = {
      model,
      messages: serialized,
      max_tokens: options.maxTokens ?? 4096,
      stream,
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = { type: 'auto' };
    }

    // Extended thinking (claude-3-7-sonnet and newer)
    if (options.enableThinking) {
      body.thinking = { type: 'enabled', budget_tokens: options.thinkingBudget ?? 10000 };
    }

    return body;
  }

  // ── Generate (non-streaming) ──

  async generate(messages: Message[], options: GenerationOptions = {}): Promise<GenerationResult> {
    const body = this.buildBody(messages, options, false);

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json() as AnthropicMessage;

    let text = '';
    let thinking = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'thinking') thinking += block.thinking;
      else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    return {
      content: text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      thinking: thinking || undefined,
      model: data.model,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: data.stop_reason === 'end_turn' ? 'stop'
        : data.stop_reason === 'max_tokens' ? 'length'
        : data.stop_reason === 'tool_use' ? 'tool_calls'
        : 'stop',
    };
  }

  // ── Streaming ──

  async generateStream(
    messages: Message[],
    onChunk: StreamCallback,
    options: GenerationOptions = {},
  ): Promise<GenerationResult> {
    const body = this.buildBody(messages, options, true);

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error('No response body from Anthropic');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let fullText = '';
    let fullThinking = '';
    const toolCalls: ToolCall[] = [];
    // Track partial tool input JSON per content block index
    const toolInputBuffers = new Map<number, { id: string; name: string; json: string }>();
    let usage = { input_tokens: 0, output_tokens: 0 };
    let stopReason: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]' || !raw) continue;

          let event: AnthropicStreamEvent;
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          switch (event.type) {
            case 'content_block_start': {
              const block = event.content_block;
              if (block?.type === 'tool_use' && event.index !== undefined) {
                toolInputBuffers.set(event.index, {
                  id: block.id ?? '',
                  name: block.name ?? '',
                  json: '',
                });
              }
              break;
            }

            case 'content_block_delta': {
              const delta = event.delta;
              if (!delta) break;

              if (delta.type === 'text_delta' && delta.text) {
                fullText += delta.text;
                const chunk: StreamChunk = { delta: delta.text };
                onChunk(chunk);
              } else if (delta.type === 'thinking_delta' && delta.thinking) {
                fullThinking += delta.thinking;
                const chunk: StreamChunk = { thinkingDelta: delta.thinking };
                onChunk(chunk);
              } else if (delta.type === 'input_json_delta' && event.index !== undefined) {
                const buf = toolInputBuffers.get(event.index);
                if (buf) buf.json += delta.partial_json ?? '';
              }
              break;
            }

            case 'content_block_stop': {
              if (event.index !== undefined) {
                const buf = toolInputBuffers.get(event.index);
                if (buf) {
                  toolCalls.push({
                    id: buf.id,
                    name: buf.name,
                    arguments: buf.json || '{}',
                  });
                  toolInputBuffers.delete(event.index);
                }
              }
              break;
            }

            case 'message_delta': {
              if (event.delta && 'stop_reason' in event.delta) {
                stopReason = (event.delta as { stop_reason?: string }).stop_reason ?? null;
              }
              if (event.usage) {
                usage.output_tokens = event.usage.output_tokens ?? 0;
              }
              break;
            }

            case 'message_start': {
              if (event.message?.usage) {
                usage.input_tokens = event.message.usage.input_tokens ?? 0;
              }
              break;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Emit accumulated tool calls as a final chunk
    if (toolCalls.length > 0) {
      onChunk({ toolCallDeltas: toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments })) });
    }

    return {
      content: fullText,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      thinking: fullThinking || undefined,
      model: options.model ?? this.defaultModel,
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      },
      finishReason: stopReason === 'end_turn' ? 'stop'
        : stopReason === 'max_tokens' ? 'length'
        : stopReason === 'tool_use' ? 'tool_calls'
        : 'stop',
    };
  }

  // ── Embeddings (Anthropic doesn't have native embeddings) ──
  // Falls back to a stub that throws — callers should use a dedicated embedding provider.

  async embed(_text: string, _options?: EmbeddingOptions): Promise<EmbeddingResult> {
    throw new Error(
      'AnthropicProvider does not support embeddings. Use OpenAIProvider or a dedicated embedding provider.',
    );
  }

  async embedBatch(_texts: string[], _options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    throw new Error(
      'AnthropicProvider does not support embeddings. Use OpenAIProvider or a dedicated embedding provider.',
    );
  }

  getModels(): ModelInfo[] {
    return [
      {
        id: 'claude-opus-4-5',
        name: 'Claude Opus 4.5',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
      },
    ];
  }
}
