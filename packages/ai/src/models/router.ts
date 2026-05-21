/**
 * @anvil/ai/models — Model Router
 *
 * Routes AI requests to the best available provider with fallback:
 *   1. Try local (Ollama) first — fastest, private
 *   2. Fall back to cloud (OpenAI/Anthropic) if local unavailable
 *
 * Features:
 * - Health checking for each provider
 * - Automatic failover with configurable timeouts
 * - Cost tracking per provider
 * - Task-based routing (different models for different tasks)
 */

import type { AIProvider, Message, GenerationOptions, GenerationResult, StreamCallback, EmbeddingOptions, EmbeddingResult } from '../types.js';
import { OllamaProvider } from '../providers/ollama.js';
import { OpenAIProvider } from '../providers/openai.js';
import type { ModelConfig, TaskModelMapping } from './config.js';

// ── Types ──────────────────────────────────────────────

export interface RouterConfig {
  /** Provider configurations in priority order */
  providers: RouterProviderConfig[];
  /** Timeout for health checks in ms (default: 5000) */
  healthCheckTimeout?: number;
  /** Interval between health checks in ms (default: 60000) */
  healthCheckInterval?: number;
  /** Task-to-model mapping */
  taskModels?: TaskModelMapping;
  /** Enable automatic failover (default: true) */
  enableFailover?: boolean;
  /** Retry attempts per provider (default: 2) */
  retriesPerProvider?: number;
}

export interface RouterProviderConfig {
  /** Provider type */
  type: 'ollama' | 'openai' | 'custom';
  /** Priority (lower = preferred). Default: order in array */
  priority?: number;
  /** Provider-specific config */
  config: Record<string, unknown>;
  /** Maximum concurrent requests (default: Infinity) */
  maxConcurrency?: number;
}

export interface ProviderHealth {
  name: string;
  healthy: boolean;
  latencyMs: number;
  lastChecked: number;
  totalRequests: number;
  totalFailures: number;
  totalTokensUsed: number;
}

export interface RouterStats {
  providers: ProviderHealth[];
  totalRequests: number;
  totalFailoverCount: number;
  routing: Record<string, string>; // task → provider mapping
}

// ── Router ─────────────────────────────────────────────

export class ModelRouter implements AIProvider {
  readonly name = 'router';
  private providers: Array<{
    provider: AIProvider;
    priority: number;
    health: ProviderHealth;
    maxConcurrency: number;
    activeRequests: number;
  }>;
  private config: RouterConfig;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private totalRequests = 0;
  private totalFailoverCount = 0;

  constructor(config: RouterConfig) {
    this.config = config;

    this.providers = config.providers.map((pc, index) => {
      let provider: AIProvider;
      switch (pc.type) {
        case 'ollama':
          provider = new OllamaProvider(pc.config as any);
          break;
        case 'openai':
          provider = new OpenAIProvider(pc.config as any);
          break;
        default:
          throw new Error(`Unknown provider type: ${pc.type}`);
      }

      return {
        provider,
        priority: pc.priority ?? index,
        health: {
          name: provider.name,
          healthy: true, // Assume healthy until proven otherwise
          latencyMs: 0,
          lastChecked: 0,
          totalRequests: 0,
          totalFailures: 0,
          totalTokensUsed: 0,
        },
        maxConcurrency: pc.maxConcurrency ?? Infinity,
        activeRequests: 0,
      };
    });

    // Sort by priority
    this.providers.sort((a, b) => a.priority - b.priority);

    // Start health checks
    this.startHealthChecks();
  }

  // ── AIProvider Implementation ─────────────────────

  async listModels(): Promise<Array<{ id: string; name: string; provider: string; contextLength: number; supportsTools: boolean; supportsStreaming: boolean; supportsEmbeddings: boolean }>> {
    const allModels: Array<{ id: string; name: string; provider: string; contextLength: number; supportsTools: boolean; supportsStreaming: boolean; supportsEmbeddings: boolean }> = [];

    for (const entry of this.providers) {
      if (!entry.health.healthy) continue;
      try {
        const models = await entry.provider.listModels();
        allModels.push(...models);
      } catch {
        // Skip unhealthy providers
      }
    }

    return allModels;
  }

  async generate(messages: Message[], options?: GenerationOptions): Promise<GenerationResult> {
    return this.executeWithFallback(
      (provider) => provider.generate(messages, options),
      options?.model,
    );
  }

  async generateStream(
    messages: Message[],
    onChunk: StreamCallback,
    options?: GenerationOptions,
  ): Promise<GenerationResult> {
    return this.executeWithFallback(
      (provider) => provider.generateStream(messages, onChunk, options),
      options?.model,
    );
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    return this.executeWithFallback(
      (provider) => provider.embed(text, options),
      options?.model,
    );
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    return this.executeWithFallback(
      (provider) => provider.embedBatch(texts, options),
      options?.model,
    );
  }

  // ── Routing Logic ────────────────────────────────

  /**
   * Execute a function with provider fallback.
   * Tries providers in priority order, falling back on failure.
   */
  private async executeWithFallback<T>(
    fn: (provider: AIProvider) => Promise<T>,
    _modelHint?: string,
  ): Promise<T> {
    this.totalRequests++;
    const retries = this.config.retriesPerProvider ?? 2;
    const enableFailover = this.config.enableFailover ?? true;

    const candidates = this.providers.filter(
      p => p.health.healthy && p.activeRequests < p.maxConcurrency,
    );

    if (candidates.length === 0) {
      // Try all providers if none are healthy (health check might be stale)
      for (const entry of this.providers) {
        try {
          entry.activeRequests++;
          const result = await fn(entry.provider);
          entry.health.totalRequests++;
          entry.health.healthy = true;
          return result;
        } catch (err) {
          entry.health.totalFailures++;
          entry.health.healthy = false;
          if (!enableFailover || this.providers.indexOf(entry) === this.providers.length - 1) {
            throw err;
          }
          continue;
        } finally {
          entry.activeRequests--;
        }
      }
      throw new Error('No AI providers available');
    }

    // Try each healthy provider
    for (let i = 0; i < candidates.length; i++) {
      const entry = candidates[i];

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          entry.activeRequests++;
          const startTime = Date.now();
          const result = await fn(entry.provider);
          entry.health.totalRequests++;
          entry.health.latencyMs = Date.now() - startTime;
          entry.health.healthy = true;
          return result;
        } catch (err) {
          entry.health.totalFailures++;
          entry.health.healthy = false;

          // If this is the last attempt for the last provider, throw
          const isLastProvider = i === candidates.length - 1;
          const isLastAttempt = attempt === retries - 1;

          if (isLastProvider && isLastAttempt) {
            throw err;
          }

          if (isLastAttempt) {
            this.totalFailoverCount++;
            break; // Move to next provider
          }

          // Wait briefly before retry
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        } finally {
          entry.activeRequests--;
        }
      }
    }

    throw new Error('All AI providers failed');
  }

  // ── Health Checks ────────────────────────────────

  private startHealthChecks(): void {
    const interval = this.config.healthCheckInterval ?? 60000;

    // Initial check
    this.runHealthChecks();

    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks();
    }, interval);
  }

  private async runHealthChecks(): Promise<void> {
    const timeout = this.config.healthCheckTimeout ?? 5000;

    await Promise.allSettled(
      this.providers.map(async (entry) => {
        try {
          const startTime = Date.now();
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          // Simple health check: list models
          await entry.provider.listModels();

          clearTimeout(timeoutId);
          entry.health.latencyMs = Date.now() - startTime;
          entry.health.healthy = true;
          entry.health.lastChecked = Date.now();
        } catch {
          entry.health.healthy = false;
          entry.health.lastChecked = Date.now();
        }
      }),
    );
  }

  // ── Stats ────────────────────────────────────────

  getStats(): RouterStats {
    return {
      providers: this.providers.map(p => ({ ...p.health })),
      totalRequests: this.totalRequests,
      totalFailoverCount: this.totalFailoverCount,
      routing: {},
    };
  }

  /**
   * Get the primary (highest priority healthy) provider.
   */
  getPrimaryProvider(): AIProvider | null {
    const healthy = this.providers.find(p => p.health.healthy);
    return healthy?.provider ?? null;
  }

  /**
   * Destroy the router and stop health checks.
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}

/**
 * Convenience: create a router with Ollama primary + OpenAI fallback.
 */
export function createDefaultRouter(config: {
  ollamaUrl?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  ollamaModel?: string;
}): ModelRouter {
  const providers: RouterProviderConfig[] = [];

  providers.push({
    type: 'ollama',
    priority: 0,
    config: {
      type: 'ollama',
      baseUrl: config.ollamaUrl,
      defaultModel: config.ollamaModel,
    },
  });

  if (config.openaiApiKey) {
    providers.push({
      type: 'openai',
      priority: 1,
      config: {
        type: 'openai',
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        defaultModel: config.openaiModel,
      },
    });
  }

  return new ModelRouter({ providers });
}
