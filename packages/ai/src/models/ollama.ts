/**
 * @anvil/ai/models — Enhanced Ollama Client
 *
 * Full-featured Ollama API client with model management,
 * conversation persistence, and structured output support.
 */

import type {
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

// ── Extended Types ─────────────────────────────────────

export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaChatOptions extends GenerationOptions {
  /** Keep model loaded in memory after generation (default: false) */
  keepAlive?: boolean;
  /** GPU layers (default: -1 = auto) */
  numGpu?: number;
  /** Number of threads */
  numThread?: number;
  /** Repeat penalty (default: 1.1) */
  repeatPenalty?: number;
  /** Top-K sampling (default: 40) */
  topK?: number;
  /** Top-P sampling (default: 0.9) */
  topP?: number;
  /** Min-P sampling */
  minP?: number;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

// ── Ollama Client ──────────────────────────────────────

export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;
  private embeddingModel: string;

  constructor(config: OllamaConfig = { type: 'ollama' }) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.defaultModel = config.defaultModel ?? 'llama3.2';
    this.embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
  }

  // ── Health & Model Management ───────────────────

  /**
   * Check if Ollama is running.
   */
  async isAlive(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * List locally available models.
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    const resp = await fetch(`${this.baseUrl}/api/tags`);
    if (!resp.ok) throw new Error(`Failed to list models: ${resp.status}`);
    const data = (await resp.json()) as { models: OllamaModelInfo[] };
    return data.models ?? [];
  }

  /**
   * Pull a model from Ollama Hub.
   */
  async pullModel(
    name: string,
    onProgress?: (progress: OllamaPullProgress) => void,
  ): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
    });

    if (!resp.ok) throw new Error(`Failed to pull model: ${resp.status}`);
    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line) as OllamaPullProgress;
          onProgress?.(data);
          if (data.status === 'success') return;
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  /**
   * Delete a model.
   */
  async deleteModel(name: string): Promise<boolean> {
    const resp = await fetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return resp.ok;
  }

  /**
   * Show model info.
   */
  async showModel(name: string): Promise<{
    license?: string;
    modelfile?: string;
    parameters?: string;
    template?: string;
    system?: string;
    details: OllamaModelInfo['details'];
  }> {
    const resp = await fetch(`${this.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!resp.ok) throw new Error(`Failed to show model: ${resp.status}`);
    return resp.json() as any;
  }

  // ── Chat Completion ─────────────────────────────

  /**
   * Chat completion with full Ollama API options.
   */
  async chat(
    messages: Message[],
    options: OllamaChatOptions = {},
  ): Promise<GenerationResult> {
    const model = options.model ?? this.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: this.serializeMessages(messages, options.systemPrompt),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
        repeat_penalty: options.repeatPenalty ?? 1.1,
        top_k: options.topK ?? 40,
        top_p: options.topP ?? 0.9,
        min_p: options.minP,
        num_gpu: options.numGpu,
        num_thread: options.numThread,
      },
    };

    if (options.keepAlive !== undefined) {
      body.keep_alive = options.keepAlive ? -1 : 0;
    }

    if (options.stopSequences) body.stop = options.stopSequences;
    if (options.tools?.length) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama chat error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      message: { content: string; tool_calls?: { function: { name: string; arguments: string } }[] };
      model: string;
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
      load_duration?: number;
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

  /**
   * Streaming chat completion.
   */
  async chatStream(
    messages: Message[],
    onChunk: StreamCallback,
    options: OllamaChatOptions = {},
  ): Promise<GenerationResult> {
    const model = options.model ?? this.defaultModel;

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: this.serializeMessages(messages, options.systemPrompt),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
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
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullText += data.message.content;
            onChunk({ delta: data.message.content, done: false });
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
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    });

    return {
      text: fullText,
      model,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      finishReason: 'stop',
    };
  }

  // ── Text Generation (non-chat) ──────────────────

  /**
   * Simple text generation (no conversation history).
   */
  async generate(
    prompt: string,
    options?: GenerationOptions,
  ): Promise<GenerationResult> {
    const model = options?.model ?? this.defaultModel;

    const resp = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama generate error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      response: string;
      model: string;
      done: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: data.response,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? 'stop' : 'max_tokens',
    };
  }

  // ── Embeddings ──────────────────────────────────

  /**
   * Generate embeddings.
   */
  async embed(text: string | string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    const model = options?.model ?? this.embeddingModel;
    const input = Array.isArray(text) ? text : [text];

    const resp = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ollama embed error (${resp.status}): ${error}`);
    }

    const data = (await resp.json()) as {
      embeddings: number[][];
      model: string;
      prompt_eval_count?: number;
    };

    const tokensPerText = Math.ceil((data.prompt_eval_count ?? 0) / input.length);

    return data.embeddings.map(embedding => ({
      embedding,
      model: data.model,
      tokenCount: tokensPerText,
    }));
  }

  // ── Private ─────────────────────────────────────

  private serializeMessages(messages: Message[], systemPrompt?: string): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of messages) {
      result.push({ role: msg.role, content: 'content' in msg ? msg.content : '' });
    }
    return result;
  }
}
