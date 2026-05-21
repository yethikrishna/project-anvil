/**
 * @anvil/ai — AI provider abstraction layer for the Anvil ecosystem.
 *
 * Usage:
 * ```ts
 * import {createAI} from '@anvil/ai';
 *
 * const ai = createAI({
 *   provider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * // Simple generation
 * const result = await ai.generate('Summarize this document');
 *
 * // Streaming
 * await ai.stream('Write a poem', chunk => process.stdout.write(chunk.delta));
 *
 * // Embeddings for semantic search
 * const embedding = await ai.embed('Hello world');
 * ```
 */

export type {AIProvider, ProviderConfig, OpenAIConfig, OllamaConfig, CustomProviderConfig} from './types.js';
export type {
  Message, SystemMessage, UserMessage, AssistantMessage, ToolResultMessage,
  ToolDefinition, ToolCall, ToolExecutor,
  GenerationOptions, GenerationResult,
  StreamChunk, StreamCallback,
  EmbeddingOptions, EmbeddingResult,
  ModelInfo,
} from './types.js';

export {OpenAIProvider} from './providers/openai.js';
export {OllamaProvider} from './providers/ollama.js';
export {LocalEmbeddingService} from './local-embeddings.js';
export type {LocalEmbeddingConfig, LocalEmbeddingModel, EmbeddingCacheEntry} from './local-embeddings.js';
export {WebGPUEmbedding, isWebGPUAvailable, embedClientSide} from './webgpu-embeddings.js';
export type {WebGPUEmbeddingConfig, WebGPUEmbeddingResult} from './webgpu-embeddings.js';
export {AgentRuntime, createEmailTriageAgent, createFileOrganizationAgent, createScheduleAgent} from './agents.js';
export type {AgentStatus, ActionRisk, ApprovalDecision, AgentAction, AgentPlan, ApprovalRequest, AgentConfig} from './agents.js';

// React hooks — import from '@anvil/ai/react' instead of '@anvil/ai' to avoid
// pulling React into server-side bundles.
// export {useChat, useCompletion} from './react/index.js';
// export type {UseChatOptions, UseChatReturn, UseCompletionOptions, UseCompletionReturn} from './react/index.js';

export {
  ANVIL_TOOLS,
  FILE_SEARCH_TOOL, FILE_READ_TOOL, DOCUMENT_WRITE_TOOL,
  EMAIL_SEARCH_TOOL, EMAIL_SEND_TOOL,
  WEB_SEARCH_TOOL, CALENDAR_CREATE_TOOL,
} from './tools/index.js';

import {OpenAIProvider} from './providers/openai.js';
import {OllamaProvider} from './providers/ollama.js';
import type {AIProvider, Message, GenerationOptions, GenerationResult, StreamCallback, EmbeddingOptions, EmbeddingResult} from './types.js';

// ── Factory ──

export interface AIFactoryConfig {
  provider: 'openai' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
}

export interface AIInstance {
  provider: AIProvider;
  generate(promptOrMessages: string | Message[], options?: GenerationOptions): Promise<GenerationResult>;
  stream(promptOrMessages: string | Message[], onChunk: StreamCallback, options?: GenerationOptions): Promise<GenerationResult>;
  embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;
  embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]>;
}

/**
 * Create an AI instance with a configured provider.
 */
export function createAI(config: AIFactoryConfig): AIInstance {
  let provider: AIProvider;

  switch (config.provider) {
    case 'openai':
      provider = new OpenAIProvider({
        type: 'openai',
        apiKey: config.apiKey ?? '',
        baseUrl: config.baseUrl,
        defaultModel: config.model,
        embeddingModel: config.embeddingModel,
      });
      break;
    case 'ollama':
      provider = new OllamaProvider({
        type: 'ollama',
        baseUrl: config.baseUrl,
        defaultModel: config.model,
        embeddingModel: config.embeddingModel,
      });
      break;
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }

  return {
    provider,
    async generate(promptOrMessages, options) {
      const messages: Message[] = typeof promptOrMessages === 'string'
        ? [{role: 'user', content: promptOrMessages}]
        : promptOrMessages;
      return provider.generate(messages, options);
    },
    async stream(promptOrMessages, onChunk, options) {
      const messages: Message[] = typeof promptOrMessages === 'string'
        ? [{role: 'user', content: promptOrMessages}]
        : promptOrMessages;
      return provider.generateStream(messages, onChunk, options);
    },
    async embed(text, options) {
      return provider.embed(text, options);
    },
    async embedBatch(texts, options) {
      return provider.embedBatch(texts, options);
    },
  };
}
