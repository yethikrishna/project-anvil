/**
 * Ollama provider — local LLM inference for privacy-first deployments.
 *
 * Supports any model available in Ollama (llama3, mistral, codellama, etc.)
 * and provides OpenAI-compatible chat completions + embeddings.
 */

import type {
  AIProvider,
  Message,
  GenerationOptions,
  GenerationResult,
  StreamCallback,
  EmbeddingOptions,
  EmbeddingResult,
  ModelInfo,
  OllamaConfig,
  ToolCall,
} from '../types.js';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;
  private embeddingModel: string;

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.defaultModel = config.defaultModel ?? 'llama3.2';
    this.embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      const data = (await resp.json()) as {
        models: {name: string; size: number; details: {family: string}}[];
      };
      return data.models.map(m => ({
        id: m.name,
        name: m.name,
        provider: this.name,
        contextLength: 8192,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: m.name.includes('embed'),
      }));
    } catch {
      return [];
    }
  }

  private serializeMessages(messages: Message[], systemPrompt?: string): {role: string; content: string}[] {
    const result: {role: string; content: string}[] = [];
    if (systemPrompt) {
      result.push({role: 'system', content: systemPrompt});
    }
    for (const msg of messages) {
      result.push({role: msg.role, content: 'content' in msg ? msg.content : ''});
    }
    return result;
  }

  async generate(messages: Message[], options?: GenerationOptions): Promise<GenerationResult> {
    const model = options?.model ?? this.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: this.serializeMessages(messages, options?.systemPrompt),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
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

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama API error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      message: {content: string; tool_calls?: {function: {name: string; arguments: string}}[]};
      model: string;
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const toolCalls: ToolCall[] = data.message.tool_calls?.map((tc, i) => ({
      id: `tc_${i}`,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string'
        ? tc.function.arguments
        : JSON.stringify(tc.function.arguments),
    })) ?? [];

    return {
      text: data.message.content,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: data.done ? 'stop' : 'max_tokens',
    };
  }

  async generateStream(
    messages: Message[],
    onChunk: StreamCallback,
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const model = options?.model ?? this.defaultModel;

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model,
        messages: this.serializeMessages(messages, options?.systemPrompt),
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama streaming error (${resp.status}): ${error}`);
    }

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, {stream: true});
      const lines = chunk.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullText += data.message.content;
            onChunk({delta: data.message.content, done: false});
          }
          if (data.prompt_eval_count) promptTokens = data.prompt_eval_count;
          if (data.eval_count) completionTokens = data.eval_count;
        } catch {
          // Skip malformed chunks
        }
      }
    }

    onChunk({
      delta: '',
      done: true,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    });

    return {
      text: fullText,
      model,
      usage: {promptTokens, completionTokens, totalTokens: promptTokens + completionTokens},
      finishReason: 'stop',
    };
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options?.model ?? this.embeddingModel;
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model, input: text}),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama embedding error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      embeddings: number[][];
      model: string;
      prompt_eval_count?: number;
    };

    return {
      embedding: data.embeddings[0],
      model: data.model,
      tokenCount: data.prompt_eval_count ?? 0,
    };
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    const model = options?.model ?? this.embeddingModel;
    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model, input: texts}),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama batch embedding error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      embeddings: number[][];
      model: string;
      prompt_eval_count?: number;
    };

    const tokensPerText = Math.ceil((data.prompt_eval_count ?? 0) / texts.length);

    return data.embeddings.map(embedding => ({
      embedding,
      model: data.model,
      tokenCount: tokensPerText,
    }));
  }
}
