/**
 * @anvil/events — Typed cross-app event bus using Valkey pub/sub.
 *
 * Architecture:
 * - EventBus: pub/sub over Valkey (Redis-compatible) or in-memory fallback
 * - EventPipeline: declarative trigger → action chains
 * - Built-in pipelines: file.uploaded → index → tag → notify
 *
 * Usage:
 * ```ts
 * import { eventBus, EventPipeline } from '@anvil/events';
 *
 * // Publish
 * await eventBus.publish('file.uploaded', { fileId: '123', name: 'report.pdf', userId: 'user1' });
 *
 * // Subscribe
 * eventBus.subscribe('file.uploaded', async (event) => {
 *   console.log('New file:', event.payload);
 * });
 *
 * // Pipeline: file.uploaded → auto-index → auto-tag → notify
 * const pipeline = new EventPipeline(eventBus);
 * pipeline.register(FileIndexPipeline);
 * pipeline.start();
 * ```
 */

import Redis from 'ioredis';
import crypto from 'crypto';

// ── Event Types ──

export type AnvilEventType =
  // File / Drive
  | 'file.uploaded'
  | 'file.shared'
  | 'file.deleted'
  | 'file.moved'
  // Docs
  | 'doc.created'
  | 'doc.updated'
  | 'doc.shared'
  | 'doc.mentioned'
  // Mail
  | 'email.received'
  | 'email.sent'
  | 'email.flagged'
  // Search
  | 'search.indexed'
  | 'search.reindex_requested'
  // AI
  | 'ai.tagged'
  | 'ai.summary_ready'
  | 'ai.action_completed'
  // Calendar
  | 'calendar.event_created'
  | 'calendar.event_updated'
  | 'calendar.reminder_due'
  // Chat / Channels
  | 'chat.message_sent'
  | 'chat.mentioned'
  | 'chat.channel_created'
  // System
  | 'notification.sent'
  | 'user.presence_changed'
  | 'pipeline.step_completed'
  | 'pipeline.failed';

export interface AnvilEvent<T = unknown> {
  id: string;
  type: AnvilEventType;
  payload: T;
  timestamp: string;
  source: string;       // app emitting the event, e.g. 'drive', 'gmail'
  userId?: string;
  traceId?: string;     // for distributed tracing
  correlationId?: string; // links pipeline steps
}

export interface EventBusConfig {
  url?: string;
  retryAttempts?: number;
  dedupWindowMs?: number;
  /** Use in-memory bus instead of Valkey (for dev/test) */
  inMemory?: boolean;
}

const DEFAULT_CONFIG: Required<EventBusConfig> = {
  url: process.env.VALKEY_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
  retryAttempts: 3,
  dedupWindowMs: 5000,
  inMemory: process.env.NODE_ENV === 'test' || !process.env.VALKEY_URL,
};

// ── In-memory fallback bus ──

class InMemoryBus {
  private handlers = new Map<AnvilEventType, ((event: AnvilEvent) => void | Promise<void>)[]>();

  async publish(channel: string, message: string): Promise<void> {
    const event = JSON.parse(message) as AnvilEvent;
    const handlers = this.handlers.get(event.type) ?? [];
    for (const h of handlers) {
      try { await h(event); } catch (e) { console.error('[InMemoryBus] Handler error:', e); }
    }
  }

  subscribe(type: AnvilEventType, handler: (event: AnvilEvent) => void | Promise<void>): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  unsubscribe(type: AnvilEventType, handler: (event: AnvilEvent) => void | Promise<void>): void {
    const hs = this.handlers.get(type);
    if (hs) {
      const idx = hs.indexOf(handler);
      if (idx > -1) hs.splice(idx, 1);
    }
  }
}

// ── EventBus ──

export class EventBus {
  private pub: Redis | InMemoryBus;
  private sub: Redis | InMemoryBus;
  private subscribers = new Map<AnvilEventType, Set<(event: AnvilEvent) => void | Promise<void>>>();
  private config: Required<EventBusConfig>;
  private connected = false;
  private dedupCache = new Map<string, number>(); // eventId → timestamp

  constructor(config: EventBusConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.inMemory) {
      const bus = new InMemoryBus();
      this.pub = bus as unknown as Redis;
      this.sub = bus as unknown as Redis;
      this.connected = true;
      // Patch subscribe to call our handler routing
      (bus as unknown as { _router: (event: AnvilEvent) => void })._router = this.route.bind(this);
    } else {
      this.pub = new Redis(this.config.url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.sub = new Redis(this.config.url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.setupRedisListeners();
    }
  }

  private setupRedisListeners() {
    const sub = this.sub as Redis;

    sub.on('connect', () => {
      this.connected = true;
      this.resubscribeAll();
    });

    sub.on('error', (err: Error) => {
      this.connected = false;
      console.error('[EventBus] Redis error:', err.message);
    });

    sub.on('message', (channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as AnvilEvent;
        // Dedup
        if (this.config.dedupWindowMs > 0 && this.dedupCache.has(event.id)) return;
        this.dedupCache.set(event.id, Date.now());
        this.route(event);
        // Clean dedup cache
        if (this.dedupCache.size > 1000) {
          const cutoff = Date.now() - this.config.dedupWindowMs;
          for (const [id, ts] of this.dedupCache) {
            if (ts < cutoff) this.dedupCache.delete(id);
          }
        }
      } catch (e) {
        console.error('[EventBus] Parse error:', e);
      }
    });
  }

  private route(event: AnvilEvent): void {
    const handlers = this.subscribers.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch(e => console.error(`[EventBus] Handler error (${event.type}):`, e));
        }
      } catch (e) {
        console.error(`[EventBus] Handler error (${event.type}):`, e);
      }
    }
  }

  private resubscribeAll() {
    const sub = this.sub as Redis;
    for (const type of this.subscribers.keys()) {
      sub.subscribe(type).catch(console.error);
    }
  }

  async publish<T = unknown>(
    type: AnvilEventType,
    payload: T,
    opts: { source?: string; userId?: string; traceId?: string; correlationId?: string } = {},
  ): Promise<string> {
    const event: AnvilEvent<T> = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
      source: opts.source ?? 'unknown',
      userId: opts.userId,
      traceId: opts.traceId ?? process.env.TRACE_ID,
      correlationId: opts.correlationId,
    };

    const message = JSON.stringify(event);

    if (this.config.inMemory) {
      await (this.pub as unknown as InMemoryBus).publish(type, message);
    } else {
      await (this.pub as Redis).publish(type, message);
    }

    return event.id;
  }

  subscribe<T = unknown>(
    type: AnvilEventType,
    handler: (event: AnvilEvent<T>) => void | Promise<void>,
  ): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
      if (!this.config.inMemory && this.connected) {
        (this.sub as Redis).subscribe(type).catch(console.error);
      }
    }

    const typedHandler = handler as (event: AnvilEvent) => void | Promise<void>;
    this.subscribers.get(type)!.add(typedHandler);

    return () => {
      const handlers = this.subscribers.get(type);
      if (handlers) {
        handlers.delete(typedHandler);
        if (handlers.size === 0) {
          this.subscribers.delete(type);
          if (!this.config.inMemory) {
            (this.sub as Redis).unsubscribe(type).catch(console.error);
          }
        }
      }
    };
  }

  async connect(): Promise<void> {
    if (this.config.inMemory) return;
    await Promise.all([
      (this.pub as Redis).connect(),
      (this.sub as Redis).connect(),
    ]);
  }

  async disconnect(): Promise<void> {
    if (this.config.inMemory) return;
    await Promise.all([
      (this.pub as Redis).quit(),
      (this.sub as Redis).quit(),
    ]);
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

// ── Pipeline System ──

export interface PipelineStep<TIn = unknown, TOut = unknown> {
  name: string;
  description: string;
  /** Event type that triggers this step */
  trigger: AnvilEventType;
  /** Event type emitted on success */
  emits?: AnvilEventType;
  execute(event: AnvilEvent<TIn>, bus: EventBus): Promise<TOut | null>;
}

export class EventPipeline {
  private steps: PipelineStep[] = [];
  private unsubscribers: (() => void)[] = [];

  constructor(private bus: EventBus) {}

  register(step: PipelineStep): this {
    this.steps.push(step);
    return this;
  }

  start(): this {
    for (const step of this.steps) {
      const unsub = this.bus.subscribe(step.trigger, async (event) => {
        try {
          const result = await step.execute(event, this.bus);
          if (result !== null && step.emits) {
            await this.bus.publish(step.emits, result, {
              source: `pipeline:${step.name}`,
              userId: event.userId,
              correlationId: event.id,
              traceId: event.traceId,
            });
          }
          await this.bus.publish('pipeline.step_completed', {
            step: step.name,
            trigger: event.type,
            correlationId: event.id,
          }, { source: 'pipeline' });
        } catch (err) {
          console.error(`[Pipeline:${step.name}] Error:`, err);
          await this.bus.publish('pipeline.failed', {
            step: step.name,
            trigger: event.type,
            error: err instanceof Error ? err.message : String(err),
            correlationId: event.id,
          }, { source: 'pipeline' });
        }
      });
      this.unsubscribers.push(unsub);
    }
    return this;
  }

  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }
}

// ── Built-in Pipeline Steps ──

/**
 * Step: file.uploaded → trigger search re-index
 */
export const FileIndexStep: PipelineStep<
  { fileId: string; name: string; mimeType?: string; userId: string },
  { fileId: string; indexedAt: string }
> = {
  name: 'file-index',
  description: 'Index new files in Meilisearch when uploaded',
  trigger: 'file.uploaded',
  emits: 'search.indexed',
  async execute(event, _bus) {
    const { fileId, name } = event.payload;
    const searchApi = process.env.ANVIL_SEARCH_API ?? 'http://localhost:3008/api';

    try {
      await fetch(`${searchApi}/index/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, name, source: 'drive', userId: event.userId }),
      });
    } catch {
      // Search index not critical — don't fail pipeline
    }

    return { fileId, indexedAt: new Date().toISOString() };
  },
};

/**
 * Step: file.uploaded → AI auto-tag
 */
export const FileTagStep: PipelineStep<
  { fileId: string; name: string; mimeType?: string; userId: string },
  { fileId: string; tags: string[] }
> = {
  name: 'file-tag',
  description: 'Auto-tag files with AI on upload',
  trigger: 'file.uploaded',
  emits: 'ai.tagged',
  async execute(event, _bus) {
    const { fileId, name, mimeType } = event.payload;

    // Infer tags from file name + mime type (lightweight, no LLM call)
    const tags: string[] = [];
    const ext = name.split('.').pop()?.toLowerCase() ?? '';

    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) tags.push('document');
    if (['xls', 'xlsx', 'csv'].includes(ext)) tags.push('spreadsheet');
    if (['ppt', 'pptx'].includes(ext)) tags.push('presentation');
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) tags.push('image');
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) tags.push('video');
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) tags.push('audio');
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) tags.push('archive');

    if (name.toLowerCase().includes('invoice')) tags.push('invoice', 'finance');
    if (name.toLowerCase().includes('contract')) tags.push('contract', 'legal');
    if (name.toLowerCase().includes('report')) tags.push('report');
    if (name.toLowerCase().includes('budget')) tags.push('finance', 'budget');
    if (name.toLowerCase().includes('meeting')) tags.push('meeting', 'notes');

    // Apply tags via Drive API
    const driveApi = process.env.ANVIL_DRIVE_API ?? 'http://localhost:3002/api';
    try {
      await fetch(`${driveApi}/files/${fileId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
    } catch {
      // Drive API not critical
    }

    return { fileId, tags };
  },
};

/**
 * Step: ai.tagged → send notification
 */
export const TagNotifyStep: PipelineStep<
  { fileId: string; tags: string[] },
  { notified: boolean }
> = {
  name: 'tag-notify',
  description: 'Notify user when file is tagged',
  trigger: 'ai.tagged',
  emits: 'notification.sent',
  async execute(event, _bus) {
    const notifApi = process.env.ANVIL_NOTIFICATIONS_API ?? 'http://localhost:3009/api';
    const { fileId, tags } = event.payload;

    try {
      await fetch(`${notifApi}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: event.userId,
          type: 'file_tagged',
          title: 'File auto-tagged',
          body: `Tags applied: ${tags.slice(0, 3).join(', ')}`,
          data: { fileId, tags },
        }),
      });
    } catch {
      // Notifications not critical
    }

    return { notified: true };
  },
};

/**
 * Step: email.received → AI triage (categorize + flag)
 */
export const EmailTriageStep: PipelineStep<
  { emailId: string; subject: string; from: string; preview: string; userId: string },
  { emailId: string; category: string; priority: 'high' | 'normal' | 'low' }
> = {
  name: 'email-triage',
  description: 'Auto-categorize and prioritize incoming emails',
  trigger: 'email.received',
  emits: 'ai.action_completed',
  async execute(event, _bus) {
    const { emailId, subject, from, preview } = event.payload;

    // Lightweight rule-based triage (no LLM required for basic cases)
    let category = 'inbox';
    let priority: 'high' | 'normal' | 'low' = 'normal';

    const subjectLower = subject.toLowerCase();
    const fromLower = from.toLowerCase();

    // Spam/newsletters
    if (
      subjectLower.includes('unsubscribe') ||
      fromLower.includes('noreply') ||
      fromLower.includes('newsletter') ||
      subjectLower.includes('50% off') ||
      subjectLower.includes('sale')
    ) {
      category = 'promotions';
      priority = 'low';
    }

    // High priority signals
    if (
      subjectLower.includes('urgent') ||
      subjectLower.includes('asap') ||
      subjectLower.includes('action required') ||
      subjectLower.includes('deadline') ||
      subjectLower.includes('invoice') ||
      subjectLower.includes('payment')
    ) {
      priority = 'high';
    }

    // Calendar invites
    if (subjectLower.includes('invitation') || subjectLower.includes('calendar invite')) {
      category = 'calendar';
    }

    // Notify if high priority
    if (priority === 'high') {
      const notifApi = process.env.ANVIL_NOTIFICATIONS_API ?? 'http://localhost:3009/api';
      try {
        await fetch(`${notifApi}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: event.userId ?? event.payload.userId,
            type: 'email_high_priority',
            title: `High priority: ${subject}`,
            body: `From: ${from}\n${preview?.slice(0, 100)}`,
            data: { emailId },
          }),
        });
      } catch { /* ok */ }
    }

    return { emailId, category, priority };
  },
};

/**
 * Step: doc.updated → re-index in search
 */
export const DocIndexStep: PipelineStep<
  { docId: string; title: string; content?: string; userId: string },
  { docId: string; indexedAt: string }
> = {
  name: 'doc-index',
  description: 'Re-index documents in Meilisearch on update',
  trigger: 'doc.updated',
  emits: 'search.indexed',
  async execute(event, _bus) {
    const { docId, title, content } = event.payload;
    const searchApi = process.env.ANVIL_SEARCH_API ?? 'http://localhost:3008/api';

    try {
      await fetch(`${searchApi}/index/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, title, content: content?.slice(0, 50_000), userId: event.userId }),
      });
    } catch { /* search not critical */ }

    return { docId, indexedAt: new Date().toISOString() };
  },
};

// ── Pre-configured full pipeline ──

export function createAnvilPipeline(bus: EventBus): EventPipeline {
  return new EventPipeline(bus)
    .register(FileIndexStep)
    .register(FileTagStep)
    .register(TagNotifyStep)
    .register(EmailTriageStep)
    .register(DocIndexStep);
}

// ── Singleton ──

let _bus: EventBus | null = null;

export function getEventBus(config?: EventBusConfig): EventBus {
  if (!_bus) {
    _bus = new EventBus(config ?? { inMemory: !process.env.VALKEY_URL });
  }
  return _bus;
}

// Keep backward-compat export
export const eventBus = getEventBus();
export default eventBus;
