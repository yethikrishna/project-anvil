/**
 * @anvil/ai — Core types for the AI provider abstraction layer.
 *
 * Supports multiple backends (OpenAI, Ollama, custom) with a unified API:
 * - Text generation (chat completions)
 * - Streaming responses (SSE)
 * - Tool/function calling
 * - Embeddings (for semantic search)
 */

// ── Message Types ──

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
  /** Optional image attachments (base64 data URIs or URLs) */
  images?: string[];
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  /** Tool calls made by the assistant */
  toolCalls?: ToolCall[];
}

export interface ToolResultMessage {
  role: 'tool';
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;

// ── Tool Definitions ──

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  required?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

// ── Generation Options ──

export interface GenerationOptions {
  /** Model identifier (provider-specific) */
  model?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Temperature (0 = deterministic, 1 = creative) */
  temperature?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Available tools */
  tools?: ToolDefinition[];
  /** Tool executor function */
  toolExecutor?: ToolExecutor;
  /** Max tool call rounds before forcing a text response */
  maxToolRounds?: number;
}

// ── Generation Result ──

export interface GenerationResult {
  /** The generated text */
  text: string;
  /** Model used */
  model: string;
  /** Token usage */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Tool calls made (if any) */
  toolCalls?: ToolCall[];
  /** Finish reason: 'stop' | 'tool_use' | 'max_tokens' | 'error' */
  finishReason: string;
}

// ── Streaming ──

export interface StreamChunk {
  /** Delta text content */
  delta: string;
  /** Is this the final chunk? */
  done: boolean;
  /** Tool call deltas (partial) */
  toolCallDeltas?: ToolCall[];
  /** Usage (only on final chunk) */
  usage?: GenerationResult['usage'];
}

export type StreamCallback = (chunk: StreamChunk) => void;

// ── Embeddings ──

export interface EmbeddingOptions {
  model?: string;
}

export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Model used */
  model: string;
  /** Token count */
  tokenCount: number;
}

// ── Provider Interface ──

export interface AIProvider {
  /** Provider name */
  readonly name: string;

  /** List available models */
  listModels(): Promise<ModelInfo[]>;

  /** Generate a completion */
  generate(messages: Message[], options?: GenerationOptions): Promise<GenerationResult>;

  /** Generate a streaming completion */
  generateStream(
    messages: Message[],
    onChunk: StreamCallback,
    options?: GenerationOptions
  ): Promise<GenerationResult>;

  /** Generate an embedding */
  embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;

  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]>;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  /** Maximum context window */
  contextLength: number;
  /** Supports tool/function calling */
  supportsTools: boolean;
  /** Supports streaming */
  supportsStreaming: boolean;
  /** Supports embeddings */
  supportsEmbeddings: boolean;
}

// ── Provider Configuration ──

export interface OpenAIConfig {
  type: 'openai';
  apiKey: string;
  baseUrl?: string; // Custom endpoint (e.g. Azure OpenAI)
  organization?: string;
  defaultModel?: string;
  embeddingModel?: string;
}

export interface OllamaConfig {
  type: 'ollama';
  baseUrl?: string; // Default: http://localhost:11434
  defaultModel?: string;
  embeddingModel?: string;
}

export interface CustomProviderConfig {
  type: 'custom';
  name: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
  /** Custom request transformer */
  transformRequest?: (messages: Message[], options?: GenerationOptions) => unknown;
  /** Custom response transformer */
  transformResponse?: (response: unknown) => GenerationResult;
}

export type ProviderConfig = OpenAIConfig | OllamaConfig | CustomProviderConfig;
