/**
 * Smart AI Provider Router
 *
 * Automatically routes requests to the best AI model based on task type:
 *
 * - Claude 3.5 Sonnet / Opus → Writing, analysis, reasoning, long-form content
 * - GPT-4o → Tool use, structured output, code generation, function calling
 * - Claude Haiku / GPT-4o-mini → Fast classification, triage, short summaries
 *
 * The router tracks provider health and auto-fails over on errors.
 * Cost and latency are tracked per provider for future optimization.
 *
 * Usage:
 * ```ts
 * const router = createSmartRouter({
 *   anthropicKey: process.env.ANTHROPIC_API_KEY,
 *   openaiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * // Router picks the best provider for this task
 * const result = await router.generate(messages, { task: 'email_draft' });
 * ```
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
} from '../types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';

// ── Task types ──

export type AITask =
  | 'default'
  | 'email_draft'      // Writing emails — prefers Claude
  | 'email_analyze'    // Analyzing email tone/sentiment — prefers Claude
  | 'tool_use'         // Multi-step tool calling — prefers GPT-4o
  | 'code'             // Code generation — prefers GPT-4o
  | 'summarize'        // Summarization — either is fine, Claude slightly better
  | 'classify'         // Quick classification — fast model
  | 'extract'          // Data extraction — GPT-4o for structured output
  | 'reason'           // Deep reasoning — Claude Opus or o1
  | 'chat'             // Conversational — both work, Claude feels more natural
  | 'search_result'    // Synthesizing search results — Claude
  | 'triage';          // Quick triage — fast model

export interface SmartRouterConfig {
  anthropicKey?: string;
  anthropicBaseUrl?: string;
  openaiKey?: string;
  openaiBaseUrl?: string;
  /** Override task→provider mapping */
  taskOverrides?: Partial<Record<AITask, 'anthropic' | 'openai' | 'ollama'>>;
  /** Whether to auto-failover to alternative provider on error */
  failover?: boolean;
  /** Default model per provider */
  models?: {
    anthropic?: string;
    openaiPrimary?: string;  // For tool use / structured output
    anthropicFast?: string;  // For quick tasks
    openaiFast?: string;
  };
}

// ── Default task routing table ──

const DEFAULT_TASK_ROUTING: Record<AITask, 'anthropic' | 'openai'> = {
  default:       'openai',    // GPT-4o is great default
  email_draft:   'anthropic', // Claude writes better emails
  email_analyze: 'anthropic', // Claude analyzes tone better
  tool_use:      'openai',    // GPT-4o tool use is more reliable
  code:          'openai',    // GPT-4o / o1 for code
  summarize:     'anthropic', // Claude produces better summaries
  classify:      'openai',    // GPT-4o-mini is fast + cheap
  extract:       'openai',    // Structured JSON output
  reason:        'anthropic', // Claude Opus for deep reasoning
  chat:          'anthropic', // Claude feels more natural in chat
  search_result: 'anthropic', // Claude synthesizes search better
  triage:        'openai',    // Fast classification
};

// ── Provider health tracking ──

interface ProviderHealth {
  available: boolean;
  lastError?: string;
  errorCount: number;
  lastSuccessAt?: number;
  avgLatencyMs: number;
  latencySamples: number[];
}

// ── Smart Router ──

export class SmartAIRouter implements AIProvider {
  readonly name = 'smart-router';

  private anthropic?: AnthropicProvider;
  private openai?: OpenAIProvider;
  private routing: Record<AITask, 'anthropic' | 'openai'>;
  private failover: boolean;
  private models: Required<NonNullable<SmartRouterConfig['models']>>;

  private health: Record<'anthropic' | 'openai', ProviderHealth> = {
    anthropic: { available: true, errorCount: 0, avgLatencyMs: 0, latencySamples: [] },
    openai: { available: true, errorCount: 0, avgLatencyMs: 0, latencySamples: [] },
  };

  constructor(config: SmartRouterConfig) {
    if (config.anthropicKey) {
      this.anthropic = new AnthropicProvider({
        type: 'anthropic',
        apiKey: config.anthropicKey,
        baseUrl: config.anthropicBaseUrl,
        defaultModel: config.models?.anthropic ?? 'claude-3-5-sonnet-20241022',
      });
    }

    if (config.openaiKey) {
      this.openai = new OpenAIProvider({
        type: 'openai',
        apiKey: config.openaiKey,
        baseUrl: config.openaiBaseUrl,
        defaultModel: config.models?.openaiPrimary ?? 'gpt-4o',
      });
    }

    this.routing = { ...DEFAULT_TASK_ROUTING, ...(config.taskOverrides ?? {}) };
    this.failover = config.failover ?? true;
    this.models = {
      anthropic: config.models?.anthropic ?? 'claude-3-5-sonnet-20241022',
      openaiPrimary: config.models?.openaiPrimary ?? 'gpt-4o',
      anthropicFast: config.models?.anthropicFast ?? 'claude-3-5-haiku-20241022',
      openaiFast: config.models?.openaiFast ?? 'gpt-4o-mini',
    };
  }

  // ── Provider selection ──

  private selectProvider(
    task: AITask,
    options: GenerationOptions & { task?: AITask },
  ): { provider: AIProvider; name: 'anthropic' | 'openai'; model?: string } {
    const effectiveTask = options.task ?? task;
    const preferred = this.routing[effectiveTask] ?? 'openai';

    // Use fast model for classify/triage
    const isFastTask = effectiveTask === 'classify' || effectiveTask === 'triage';

    // Try preferred first
    const tryProvider = (name: 'anthropic' | 'openai') => {
      if (name === 'anthropic' && this.anthropic && this.health.anthropic.available) {
        return {
          provider: this.anthropic,
          name: 'anthropic' as const,
          model: isFastTask ? this.models.anthropicFast : this.models.anthropic,
        };
      }
      if (name === 'openai' && this.openai && this.health.openai.available) {
        return {
          provider: this.openai,
          name: 'openai' as const,
          model: isFastTask ? this.models.openaiFast : this.models.openaiPrimary,
        };
      }
      return null;
    };

    const alt = preferred === 'anthropic' ? 'openai' : 'anthropic';

    return tryProvider(preferred)
      ?? tryProvider(alt)
      ?? (() => {
        // Both unhealthy — reset and try anyway
        this.health.anthropic.available = true;
        this.health.openai.available = true;
        return tryProvider(preferred)!;
      })();
  }

  // ── Latency tracking ──

  private recordLatency(name: 'anthropic' | 'openai', ms: number) {
    const h = this.health[name];
    h.latencySamples.push(ms);
    if (h.latencySamples.length > 20) h.latencySamples.shift();
    h.avgLatencyMs = h.latencySamples.reduce((a, b) => a + b, 0) / h.latencySamples.length;
    h.lastSuccessAt = Date.now();
    h.errorCount = Math.max(0, h.errorCount - 1); // Reduce error count on success
  }

  private recordError(name: 'anthropic' | 'openai', error: string) {
    const h = this.health[name];
    h.errorCount++;
    h.lastError = error;
    // Mark unavailable after 3 consecutive errors
    if (h.errorCount >= 3) {
      h.available = false;
      // Auto-recover after 60 seconds
      setTimeout(() => { h.available = true; h.errorCount = 0; }, 60_000);
    }
  }

  // ── AIProvider interface ──

  async generate(
    messages: Message[],
    options: GenerationOptions & { task?: AITask } = {},
  ): Promise<GenerationResult> {
    const { provider, name, model } = this.selectProvider('default', options);
    const effectiveOptions = { ...options, model: options.model ?? model };

    const start = Date.now();
    try {
      const result = await provider.generate(messages, effectiveOptions);
      this.recordLatency(name, Date.now() - start);
      return { ...result, model: `${name}/${result.model ?? model}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError(name, message);

      // Failover to alternative
      if (this.failover) {
        const alt = name === 'anthropic' ? 'openai' : 'anthropic';
        const altProvider = alt === 'anthropic' ? this.anthropic : this.openai;
        if (altProvider) {
          const altStart = Date.now();
          const result = await altProvider.generate(messages, options);
          this.recordLatency(alt, Date.now() - altStart);
          return { ...result, model: `${alt}/${result.model}` };
        }
      }
      throw err;
    }
  }

  async generateStream(
    messages: Message[],
    onChunk: StreamCallback,
    options: GenerationOptions & { task?: AITask } = {},
  ): Promise<GenerationResult> {
    const { provider, name, model } = this.selectProvider('default', options);
    const effectiveOptions = { ...options, model: options.model ?? model };

    const start = Date.now();
    try {
      const result = await provider.generateStream(messages, onChunk, effectiveOptions);
      this.recordLatency(name, Date.now() - start);
      return { ...result, model: `${name}/${result.model ?? model}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.recordError(name, message);

      if (this.failover) {
        const alt = name === 'anthropic' ? 'openai' : 'anthropic';
        const altProvider = alt === 'anthropic' ? this.anthropic : this.openai;
        if (altProvider) {
          const altStart = Date.now();
          const result = await altProvider.generateStream(messages, onChunk, options);
          this.recordLatency(alt, Date.now() - altStart);
          return { ...result, model: `${alt}/${result.model}` };
        }
      }
      throw err;
    }
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    // Embeddings always go to OpenAI (Anthropic doesn't have them)
    if (this.openai) return this.openai.embed(text, options);
    throw new Error('No embedding provider available. Configure openaiKey.');
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    if (this.openai) return this.openai.embedBatch(texts, options);
    throw new Error('No embedding provider available. Configure openaiKey.');
  }

  getModels(): ModelInfo[] {
    return [
      ...(this.anthropic?.getModels() ?? []),
      ...(this.openai?.getModels() ?? []),
    ];
  }

  // ── Status ──

  getStatus() {
    return {
      providers: {
        anthropic: {
          configured: !!this.anthropic,
          ...this.health.anthropic,
        },
        openai: {
          configured: !!this.openai,
          ...this.health.openai,
        },
      },
      routing: this.routing,
    };
  }
}

// ── Factory ──

/**
 * Create a smart router that uses the best provider for each task.
 * Falls back gracefully if only one provider is configured.
 */
export function createSmartRouter(config: SmartRouterConfig): SmartAIRouter {
  return new SmartAIRouter(config);
}

/**
 * Create a smart router from environment variables.
 *
 * Reads:
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY
 *   OPENAI_API_URL (optional, for proxies)
 *   AI_MODEL (optional, overrides primary OpenAI model)
 *   ANTHROPIC_MODEL (optional, overrides primary Claude model)
 */
export function createSmartRouterFromEnv(): SmartAIRouter {
  return new SmartAIRouter({
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_API_URL?.replace('/chat/completions', '') ?? undefined,
    failover: true,
    models: {
      openaiPrimary: process.env.AI_MODEL ?? 'gpt-4o',
      openaiFast: process.env.AI_FAST_MODEL ?? 'gpt-4o-mini',
      anthropic: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
      anthropicFast: process.env.ANTHROPIC_FAST_MODEL ?? 'claude-3-5-haiku-20241022',
    },
  });
}
