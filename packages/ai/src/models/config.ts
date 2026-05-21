/**
 * @anvil/ai/models — Model Configuration & Selection
 *
 * Maps tasks to optimal models and providers. Configurable per deployment:
 * - Production: OpenAI GPT-4o for complex tasks, GPT-4o-mini for fast tasks
 * - Self-hosted: Ollama llama3.2 for everything
 * - Hybrid: Ollama primary with cloud fallback
 */

import type { AIProvider } from '../types.js';

// ── Task Types ─────────────────────────────────────────

export type AITask =
  | 'chat'              // General conversation
  | 'code'              // Code generation, debugging
  | 'summarization'     // Summarize documents, threads
  | 'extraction'        // Extract structured data
  | 'classification'    // Classify/categorize content
  | 'embedding'         // Generate embeddings
  | 'reranking'         // Rerank retrieval results
  | 'translation'       // Translate text
  | 'sentiment'         // Sentiment analysis
  | 'tool_use'          // Function/tool calling
  | 'creative'          // Creative writing, brainstorming
  | 'reasoning'         // Complex reasoning, math
  | 'fast_response';    // Quick short answers

export type ModelTier = 'light' | 'standard' | 'heavy';

// ── Model Definitions ──────────────────────────────────

export interface ModelDefinition {
  /** Model ID */
  id: string;
  /** Display name */
  name: string;
  /** Provider */
  provider: 'ollama' | 'openai' | 'custom';
  /** Context window in tokens */
  contextLength: number;
  /** Supported tasks */
  tasks: AITask[];
  /** Default tier for this model */
  tier: ModelTier;
  /** Supports tool/function calling */
  supportsTools: boolean;
  /** Supports streaming */
  supportsStreaming: boolean;
  /** Supports JSON mode */
  supportsJsonMode: boolean;
  /** Cost per 1M input tokens (USD, 0 for local) */
  costInput: number;
  /** Cost per 1M output tokens (USD, 0 for local) */
  costOutput: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
}

// ── Built-in Model Registry ────────────────────────────

const MODELS: ModelDefinition[] = [
  // ── OpenAI Models ──
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextLength: 128000,
    tasks: ['chat', 'reasoning', 'code', 'tool_use', 'extraction', 'summarization', 'creative'],
    tier: 'heavy',
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    costInput: 2.50,
    costOutput: 10.0,
    maxOutputTokens: 16384,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextLength: 128000,
    tasks: ['chat', 'fast_response', 'classification', 'sentiment', 'tool_use'],
    tier: 'standard',
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    costInput: 0.15,
    costOutput: 0.60,
    maxOutputTokens: 16384,
  },
  {
    id: 'o1',
    name: 'O1',
    provider: 'openai',
    contextLength: 200000,
    tasks: ['reasoning', 'code', 'extraction'],
    tier: 'heavy',
    supportsTools: false,
    supportsStreaming: true,
    supportsJsonMode: false,
    costInput: 15.0,
    costOutput: 60.0,
    maxOutputTokens: 100000,
  },
  {
    id: 'o3-mini',
    name: 'O3 Mini',
    provider: 'openai',
    contextLength: 200000,
    tasks: ['reasoning', 'code'],
    tier: 'heavy',
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: false,
    costInput: 1.10,
    costOutput: 4.40,
    maxOutputTokens: 65536,
  },
  {
    id: 'text-embedding-3-small',
    name: 'Text Embedding 3 Small',
    provider: 'openai',
    contextLength: 8191,
    tasks: ['embedding'],
    tier: 'light',
    supportsTools: false,
    supportsStreaming: false,
    supportsJsonMode: false,
    costInput: 0.02,
    costOutput: 0,
    maxOutputTokens: 0,
  },
  {
    id: 'text-embedding-3-large',
    name: 'Text Embedding 3 Large',
    provider: 'openai',
    contextLength: 8191,
    tasks: ['embedding'],
    tier: 'standard',
    supportsTools: false,
    supportsStreaming: false,
    supportsJsonMode: false,
    costInput: 0.13,
    costOutput: 0,
    maxOutputTokens: 0,
  },

  // ── Ollama Models ──
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    provider: 'ollama',
    contextLength: 131072,
    tasks: ['chat', 'fast_response', 'summarization', 'classification', 'tool_use'],
    tier: 'standard',
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    costInput: 0,
    costOutput: 0,
    maxOutputTokens: 4096,
  },
  {
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B',
    provider: 'ollama',
    contextLength: 131072,
    tasks: ['chat', 'reasoning', 'code', 'tool_use', 'creative'],
    tier: 'heavy',
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    costInput: 0,
    costOutput: 0,
    maxOutputTokens: 4096,
  },
  {
    id: 'mistral',
    name: 'Mistral 7B',
    provider: 'ollama',
    contextLength: 32768,
    tasks: ['chat', 'fast_response', 'translation', 'code'],
    tier: 'light',
    supportsTools: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    costInput: 0,
    costOutput: 0,
    maxOutputTokens: 4096,
  },
  {
    id: 'codellama',
    name: 'Code Llama',
    provider: 'ollama',
    contextLength: 16384,
    tasks: ['code'],
    tier: 'standard',
    supportsTools: false,
    supportsStreaming: true,
    supportsJsonMode: false,
    costInput: 0,
    costOutput: 0,
    maxOutputTokens: 4096,
  },
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    provider: 'ollama',
    contextLength: 8192,
    tasks: ['embedding'],
    tier: 'light',
    supportsTools: false,
    supportsStreaming: false,
    supportsJsonMode: false,
    costInput: 0,
    costOutput: 0,
    maxOutputTokens: 0,
  },
  {
    id: 'bge-m3',
    name: 'BGE-M3',
    provider: 'ollama',
    contextLength: 8192,
    tasks: ['embedding', 'reranking'],
    tier: 'standard',
    supportsTools: false,
    supportsStreaming: false,
    supportsJsonMode: false,
    costInput: 0,
    costOutput: 0,
    maxOutputTokens: 0,
  },
];

// ── Task-to-Model Mapping ──────────────────────────────

export interface TaskModelMapping {
  [task: string]: {
    /** Preferred model */
    primary: string;
    /** Fallback model */
    fallback?: string;
    /** Embedding model (for embedding tasks) */
    embedding?: string;
  };
}

const DEFAULT_TASK_MAPPING: TaskModelMapping = {
  chat:            { primary: 'llama3.2',       fallback: 'gpt-4o-mini' },
  code:            { primary: 'llama3.2',       fallback: 'gpt-4o' },
  summarization:   { primary: 'llama3.2',       fallback: 'gpt-4o-mini' },
  extraction:      { primary: 'gpt-4o-mini',    fallback: 'llama3.2' },
  classification:  { primary: 'llama3.2',       fallback: 'gpt-4o-mini' },
  embedding:       { primary: 'nomic-embed-text', embedding: 'text-embedding-3-small' },
  reranking:       { primary: 'bge-m3' },
  translation:     { primary: 'llama3.2',       fallback: 'gpt-4o-mini' },
  sentiment:       { primary: 'llama3.2',       fallback: 'gpt-4o-mini' },
  tool_use:        { primary: 'llama3.2',       fallback: 'gpt-4o' },
  creative:        { primary: 'llama3.2',       fallback: 'gpt-4o' },
  reasoning:       { primary: 'gpt-4o',         fallback: 'llama3.1:70b' },
  fast_response:   { primary: 'llama3.2',       fallback: 'gpt-4o-mini' },
};

// ── Model Config ──────────────────────────────────────

export interface ModelConfig {
  /** Custom task-model overrides */
  taskMapping?: Partial<TaskModelMapping>;
  /** Deployment mode */
  mode?: 'local' | 'cloud' | 'hybrid';
  /** Custom models to register */
  customModels?: ModelDefinition[];
  /** Default provider */
  defaultProvider?: 'ollama' | 'openai';
  /** Ollama base URL */
  ollamaUrl?: string;
  /** OpenAI API key */
  openaiApiKey?: string;
}

export class ModelConfigService {
  private models: Map<string, ModelDefinition> = new Map();
  private taskMapping: TaskModelMapping;
  private mode: 'local' | 'cloud' | 'hybrid';

  constructor(config: ModelConfig = {}) {
    this.mode = config.mode ?? 'hybrid';
    this.taskMapping = { ...DEFAULT_TASK_MAPPING, ...(config.taskMapping ?? {}) } as TaskModelMapping;

    // Register built-in models
    for (const model of MODELS) {
      this.models.set(model.id, model);
    }

    // Register custom models with validation
    if (config.customModels) {
      for (const model of config.customModels) {
        if (!model.id || !model.name || !model.provider) {
          console.warn(`Skipping invalid custom model: missing id, name, or provider`);
          continue;
        }
        if (!Array.isArray(model.tasks) || model.tasks.length === 0) {
          console.warn(`Custom model "${model.id}" has no tasks defined — it will not be selected for any task`);
        }
        this.models.set(model.id, model);
      }
    }

    // Adjust mapping based on mode
    if (this.mode === 'local') {
      // Force all tasks to use Ollama models
      for (const task of Object.keys(this.taskMapping)) {
        const mapping = this.taskMapping[task];
        const primary = this.models.get(mapping.primary);
        if (primary && primary.provider !== 'ollama') {
          // Find best Ollama model for this task
          const ollamaAlternative = this.findBestModel(task as AITask, 'ollama');
          if (ollamaAlternative) mapping.primary = ollamaAlternative.id;
          mapping.fallback = undefined;
        }
      }
    } else if (this.mode === 'cloud') {
      // Force all tasks to use OpenAI models
      for (const task of Object.keys(this.taskMapping)) {
        const mapping = this.taskMapping[task];
        const primary = this.models.get(mapping.primary);
        if (primary && primary.provider !== 'openai') {
          const cloudAlternative = this.findBestModel(task as AITask, 'openai');
          if (cloudAlternative) mapping.primary = cloudAlternative.id;
        }
      }
    }
  }

  /**
   * Get the model for a specific task.
   */
  getModelForTask(task: AITask): ModelDefinition | undefined {
    const mapping = this.taskMapping[task];
    if (!mapping) return undefined;

    const model = this.models.get(mapping.primary);
    if (model) return model;

    // Try fallback
    if (mapping.fallback) {
      return this.models.get(mapping.fallback);
    }

    return undefined;
  }

  /**
   * Get the model ID for a task.
   */
  getModelIdForTask(task: AITask): string {
    return this.getModelForTask(task)?.id ?? 'llama3.2';
  }

  /**
   * Get the embedding model for a task.
   */
  getEmbeddingModel(): string {
    return this.taskMapping.embedding?.primary ?? 'nomic-embed-text';
  }

  /**
   * Get model definition by ID.
   */
  getModel(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  /**
   * List all registered models.
   */
  listModels(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  /**
   * List models by provider.
   */
  listModelsByProvider(provider: string): ModelDefinition[] {
    return Array.from(this.models.values()).filter(m => m.provider === provider);
  }

  /**
   * List models that support a task.
   */
  listModelsForTask(task: AITask): ModelDefinition[] {
    return Array.from(this.models.values()).filter(m => m.tasks.includes(task));
  }

  /**
   * Get the full task mapping.
   */
  getTaskMapping(): TaskModelMapping {
    return { ...this.taskMapping };
  }

  /**
   * Update the model for a task at runtime.
   */
  setModelForTask(task: AITask, modelId: string, fallback?: string): void {
    this.taskMapping[task] = { primary: modelId, fallback } as TaskModelMapping[string];
  }

  // ── Private ─────────────────────────────────────

  private findBestModel(task: AITask, provider: string): ModelDefinition | undefined {
    const candidates = this.listModelsForTask(task)
      .filter(m => m.provider === provider);

    // Prefer standard tier, then heavy
    return candidates.find(m => m.tier === 'standard')
      ?? candidates.find(m => m.tier === 'heavy')
      ?? candidates.find(m => m.tier === 'light')
      ?? candidates[0];
  }
}
