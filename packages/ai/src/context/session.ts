/**
 * @anvil/ai/context — Conversation Session Management
 *
 * Manages conversation sessions with:
 * - Message history with token counting
 * - Automatic context window management (sliding window, summarization)
 * - Tool call / result tracking
 * - Session persistence and rehydration
 * - Multi-turn state machine
 */

import type { Message, ToolCall } from '../types.js';
import { UserContext } from './user-context.js';
import type { UserContextData } from './user-context.js';

// ── Types ──────────────────────────────────────────────

export type SessionState = 'active' | 'idle' | 'paused' | 'completed' | 'error';

export interface SessionConfig {
  /** Maximum context window tokens */
  maxContextTokens: number;
  /** Maximum messages before summarization triggers */
  maxMessagesBeforeSummary: number;
  /** Maximum messages to keep (after summarization) */
  retainedMessagesAfterSummary: number;
  /** Idle timeout in ms before session goes idle */
  idleTimeoutMs: number;
  /** System prompt template */
  systemPromptTemplate?: string;
  /** Session tags */
  tags?: string[];
}

export interface SessionMessage {
  /** Message role */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Message content */
  content: string;
  /** Unique message ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Token count for this message */
  tokenCount: number;
  /** Tool calls attached to this message */
  toolCalls?: ToolCall[];
  /** Tool results attached to this message */
  toolResults?: Array<{
    callId: string;
    toolName: string;
    result: string;
    success: boolean;
  }>;
  /** Tool call ID (for tool role) */
  toolCallId?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  /** Session ID */
  id: string;
  /** State */
  state: SessionState;
  /** Total messages */
  messageCount: number;
  /** Total tokens used */
  totalTokens: number;
  /** Created at */
  createdAt: number;
  /** Last activity */
  lastActivityAt: number;
  /** Summary of conversation so far */
  conversationSummary?: string;
  /** Topics discussed */
  topics: string[];
  /** Tools used */
  toolsUsed: string[];
  /** Tags */
  tags: string[];
}

export interface SessionData {
  id: string;
  messages: SessionMessage[];
  state: SessionState;
  config: SessionConfig;
  conversationSummary?: string;
  topics: string[];
  toolsUsed: string[];
  createdAt: number;
  lastActivityAt: number;
  completedAt?: number;
  tokenBudget: {
    used: number;
    remaining: number;
    total: number;
  };
}

// ── Defaults ───────────────────────────────────────────

const DEFAULT_CONFIG: SessionConfig = {
  maxContextTokens: 128000,
  maxMessagesBeforeSummary: 50,
  retainedMessagesAfterSummary: 10,
  idleTimeoutMs: 30 * 60 * 1000, // 30 min
  tags: [],
};

// ── Session ────────────────────────────────────────────

export class Session {
  private data: SessionData;
  private userContext?: UserContext;
  private onStateChange?: (session: Session, oldState: SessionState, newState: SessionState) => void;

  constructor(
    id: string,
    config?: Partial<SessionConfig>,
    options?: {
      userContext?: UserContext;
      onStateChange?: (session: Session, oldState: SessionState, newState: SessionState) => void;
    },
  ) {
    const mergedConfig: SessionConfig = { ...DEFAULT_CONFIG, ...config };

    this.data = {
      id,
      messages: [],
      state: 'active',
      config: mergedConfig,
      topics: [],
      toolsUsed: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      tokenBudget: {
        used: 0,
        remaining: mergedConfig.maxContextTokens,
        total: mergedConfig.maxContextTokens,
      },
    };

    this.userContext = options?.userContext;
    this.onStateChange = options?.onStateChange;
  }

  // ── Properties ──────────────────────────────────

  get id(): string {
    return this.data.id;
  }

  get state(): SessionState {
    return this.data.state;
  }

  get messages(): readonly SessionMessage[] {
    return this.data.messages;
  }

  get config(): SessionConfig {
    return this.data.config;
  }

  get tokenBudget(): SessionData['tokenBudget'] {
    return { ...this.data.tokenBudget };
  }

  get lastActivityAt(): number {
    return this.data.lastActivityAt;
  }

  get topics(): string[] {
    return [...this.data.topics];
  }

  // ── Message Management ──────────────────────────

  /**
   * Add a message to the session.
   */
  addMessage(message: Message & { toolCalls?: ToolCall[] }): SessionMessage {
    if (this.data.state === 'completed' || this.data.state === 'error') {
      throw new Error(`Cannot add message to session in "${this.data.state}" state`);
    }

    const tokenCount = this.estimateTokens(message.content);
    const sessionMessage: SessionMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      tokenCount,
      toolCalls: message.toolCalls,
    };

    this.data.messages.push(sessionMessage);
    this.data.tokenBudget.used += tokenCount;
    this.data.tokenBudget.remaining = Math.max(0, this.data.tokenBudget.total - this.data.tokenBudget.used);
    this.data.lastActivityAt = Date.now();

    // Resume from idle
    if (this.data.state === 'idle') {
      this.setState('active');
    }

    // Infer user context
    if (message.role === 'user' && this.userContext) {
      this.userContext.inferFromMessage(message);
    }

    // Track tool usage
    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        if (!this.data.toolsUsed.includes(tc.name)) {
          this.data.toolsUsed.push(tc.name);
        }
      }
    }

    // Extract simple topics from user messages
    if (message.role === 'user') {
      this.extractTopics(message.content);
    }

    // Check if summarization is needed
    if (this.data.messages.length >= this.data.config.maxMessagesBeforeSummary) {
      this.triggerSummarization();
    }

    return sessionMessage;
  }

  /**
   * Add a tool result to the last assistant message.
   */
  addToolResult(callId: string, toolName: string, result: string, success: boolean): void {
    const lastAssistant = [...this.data.messages]
      .reverse()
      .find(m => m.role === 'assistant');

    if (lastAssistant) {
      if (!lastAssistant.toolResults) lastAssistant.toolResults = [];
      lastAssistant.toolResults.push({ callId, toolName, result, success });

      // Track tool usage
      if (!this.data.toolsUsed.includes(toolName)) {
        this.data.toolsUsed.push(toolName);
      }
    }

    const tokenCount = this.estimateTokens(result);
    this.data.tokenBudget.used += tokenCount;
    this.data.tokenBudget.remaining = Math.max(0, this.data.tokenBudget.total - this.data.tokenBudget.used);
    this.data.lastActivityAt = Date.now();
  }

  /**
   * Get messages formatted for an AI API call.
   */
  getMessagesForAPI(options?: {
    includeSystem?: boolean;
    maxTokens?: number;
    format?: 'openai' | 'ollama' | 'anthropic';
  }): Array<{ role: string; content: string; tool_calls?: unknown }> {
    const maxTokens = options?.maxTokens ?? this.data.config.maxContextTokens;
    let tokenBudget = maxTokens;
    const result: Array<{ role: string; content: string; tool_calls?: unknown }> = [];

    // Work backwards from latest messages
    const messages = [...this.data.messages].reverse();
    let budgetExhausted = false;

    for (const msg of messages) {
      if (tokenBudget <= 0) { budgetExhausted = true; break; }
      if (msg.tokenCount > tokenBudget) { budgetExhausted = true; break; }

      const entry: { role: string; content: string; tool_calls?: unknown } = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.toolCalls?.length) {
        entry.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }

      result.unshift(entry);
      tokenBudget -= msg.tokenCount;
    }

    // If we had to truncate, prepend a summary note
    if (budgetExhausted && this.data.conversationSummary) {
      result.unshift({
        role: 'system',
        content: `[Earlier conversation summary: ${this.data.conversationSummary}]`,
      });
    }

    return result;
  }

  /**
   * Get the last N messages.
   */
  getLastMessages(n: number): SessionMessage[] {
    return this.data.messages.slice(-n);
  }

  /**
   * Get the last user message.
   */
  getLastUserMessage(): SessionMessage | undefined {
    return [...this.data.messages].reverse().find(m => m.role === 'user');
  }

  // ── State Management ────────────────────────────

  /**
   * Check if the session has been idle too long.
   */
  checkIdle(): boolean {
    if (this.data.state !== 'active') return false;

    const idleTime = Date.now() - this.data.lastActivityAt;
    if (idleTime > this.data.config.idleTimeoutMs) {
      this.setState('idle');
      return true;
    }
    return false;
  }

  /**
   * Complete the session.
   */
  complete(): void {
    this.data.completedAt = Date.now();
    this.setState('completed');

    // Record in user context
    if (this.userContext) {
      const summary = this.data.conversationSummary
        ?? this.data.messages.slice(-3).map(m => m.content.slice(0, 100)).join(' | ');
      this.userContext.recordInteraction(summary, this.data.toolsUsed, this.data.topics);
    }
  }

  /**
   * Pause the session (e.g., user navigated away).
   */
  pause(): void {
    this.setState('paused');
  }

  /**
   * Resume a paused session.
   */
  resume(): void {
    if (this.data.state === 'paused') {
      this.setState('active');
    }
  }

  /**
   * Mark session as errored.
   */
  error(message: string): void {
    this.addMessage({ role: 'system', content: `Session error: ${message}` });
    this.setState('error');
  }

  // ── Summary ─────────────────────────────────────

  getSummary(): SessionSummary {
    return {
      id: this.data.id,
      state: this.data.state,
      messageCount: this.data.messages.length,
      totalTokens: this.data.tokenBudget.used,
      createdAt: this.data.createdAt,
      lastActivityAt: this.data.lastActivityAt,
      conversationSummary: this.data.conversationSummary,
      topics: [...this.data.topics],
      toolsUsed: [...this.data.toolsUsed],
      tags: [...(this.data.config.tags ?? [])],
    };
  }

  // ── Serialization ──────────────────────────────

  toJSON(): SessionData {
    return {
      ...this.data,
      messages: [...this.data.messages],
      topics: [...this.data.topics],
      toolsUsed: [...this.data.toolsUsed],
    };
  }

  static fromJSON(json: SessionData, options?: { userContext?: UserContext }): Session {
    if (!json || !json.id) {
      throw new Error('Invalid SessionData: missing id');
    }

    const session = new Session(json.id, json.config, { userContext: options?.userContext });
    session.data.messages = Array.isArray(json.messages) ? json.messages : [];
    session.data.state = ['active', 'idle', 'paused', 'completed', 'error'].includes(json.state)
      ? json.state : 'error';
    session.data.conversationSummary = typeof json.conversationSummary === 'string' ? json.conversationSummary : undefined;
    session.data.topics = Array.isArray(json.topics) ? json.topics : [];
    session.data.toolsUsed = Array.isArray(json.toolsUsed) ? json.toolsUsed : [];
    session.data.createdAt = typeof json.createdAt === 'number' ? json.createdAt : Date.now();
    session.data.lastActivityAt = typeof json.lastActivityAt === 'number' ? json.lastActivityAt : Date.now();
    session.data.completedAt = typeof json.completedAt === 'number' ? json.completedAt : undefined;
    interface TokenBudgetJSON { used?: number; remaining?: number; total?: number }
    const tb = (typeof json.tokenBudget === 'object' && json.tokenBudget !== null)
      ? json.tokenBudget as TokenBudgetJSON : {} as TokenBudgetJSON;
    session.data.tokenBudget = {
      used: typeof tb.used === 'number' ? tb.used : 0,
      remaining: typeof tb.remaining === 'number' ? tb.remaining : 0,
      total: typeof tb.total === 'number' ? tb.total : 128000,
    };
    return session;
  }

  // ── Private ─────────────────────────────────────

  private setState(newState: SessionState): void {
    if (this.data.state === newState) return;
    const oldState = this.data.state;
    this.data.state = newState;
    this.onStateChange?.(this, oldState, newState);
  }

  /**
   * Rough token estimation: ~4 chars per token.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Extract simple topics from user message content.
   */
  private extractTopics(content: string): void {
    // Simple noun extraction — look for capitalized multi-word phrases
    const phrases = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
    const nouns = content.match(/\b(?:project|meeting|email|document|report|task|issue|bug|feature|deploy|release|review|deadline)\b/gi) ?? [];

    const candidates = [...new Set([...phrases, ...nouns.map(n => n.toLowerCase())])];

    for (const topic of candidates) {
      if (!this.data.topics.includes(topic) && this.data.topics.length < 30) {
        this.data.topics.push(topic);
      }
    }
  }

  /**
   * Trigger conversation summarization when context window fills up.
   */
  private triggerSummarization(): void {
    const retainCount = this.data.config.retainedMessagesAfterSummary;
    const toSummarize = this.data.messages.slice(0, -retainCount);

    if (toSummarize.length === 0) return;

    // Build a simple extractive summary
    const userMessages = toSummarize
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, 200));
    const assistantMessages = toSummarize
      .filter(m => m.role === 'assistant')
      .map(m => m.content.slice(0, 200));

    const newSummary = [
      this.data.conversationSummary
        ? `Previous summary: ${this.data.conversationSummary}`
        : '',
      `User discussed: ${userMessages.join('; ')}`,
      `Assistant covered: ${assistantMessages.join('; ')}`,
      `Tools used: ${[...new Set(toSummarize.flatMap(m => m.toolCalls?.map(tc => tc.name) ?? []))].join(', ')}`,
    ].filter(Boolean).join('\n');

    // Truncate summary to ~500 tokens
    this.data.conversationSummary = newSummary.slice(0, 2000);

    // Remove summarized messages and recalculate token budget
    const removed = this.data.messages.splice(0, toSummarize.length);
    const removedTokens = removed.reduce((sum, m) => sum + m.tokenCount, 0);

    this.data.tokenBudget.used = Math.max(0, this.data.tokenBudget.used - removedTokens);
    this.data.tokenBudget.remaining = Math.max(0, this.data.tokenBudget.total - this.data.tokenBudget.used);
  }
}

// ── Session Store ──────────────────────────────────────

export class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private maxSessions: number;

  constructor(options?: { maxSessions?: number }) {
    this.maxSessions = options?.maxSessions ?? 1000;
  }

  /** Clean up all pending timers (call on shutdown). */
  dispose(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
  }

  /**
   * Create a new session.
   */
  create(id: string, config?: Partial<SessionConfig>, userContext?: UserContext): Session {
    // Evict oldest if at capacity
    if (this.sessions.size >= this.maxSessions) {
      const oldest = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt)[0];
      if (oldest) this.sessions.delete(oldest[0]);
    }

    const session = new Session(id, config, {
      userContext,
      onStateChange: (s, _oldState, newState) => {
        if (newState === 'completed' || newState === 'error') {
          // Cancel any existing cleanup timer for this session
          const existingTimer = this.cleanupTimers.get(s.id);
          if (existingTimer) clearTimeout(existingTimer);

          // Auto-cleanup completed sessions after 5 minutes
          const timer = setTimeout(() => {
            this.sessions.delete(s.id);
            this.cleanupTimers.delete(s.id);
          }, 5 * 60 * 1000);
          this.cleanupTimers.set(s.id, timer);
        }
      },
    });

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get an existing session.
   */
  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get or create a session.
   */
  getOrCreate(id: string, config?: Partial<SessionConfig>, userContext?: UserContext): Session {
    return this.sessions.get(id) ?? this.create(id, config, userContext);
  }

  /**
   * List all active sessions.
   */
  listActive(): SessionSummary[] {
    return Array.from(this.sessions.values())
      .filter(s => s.state === 'active' || s.state === 'idle')
      .map(s => s.getSummary());
  }

  /**
   * List all sessions.
   */
  listAll(): SessionSummary[] {
    return Array.from(this.sessions.values()).map(s => s.getSummary());
  }

  /**
   * Check all sessions for idle timeout.
   */
  checkIdleSessions(): Session[] {
    const idled: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.checkIdle()) {
        idled.push(session);
      }
    }
    return idled;
  }

  /**
   * Delete a session.
   */
  delete(id: string): boolean {
    const timer = this.cleanupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(id);
    }
    return this.sessions.delete(id);
  }

  /**
   * Get session count.
   */
  get size(): number {
    return this.sessions.size;
  }
}
