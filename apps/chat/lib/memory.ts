/**
 * Enhanced Memory System — persistent conversation storage with:
 * - Cross-session conversation continuity
 * - User preference accumulation
 * - Pattern persistence across browser sessions
 * - Conversation import/export
 * - Auto-summarization of old messages
 *
 * Storage layers:
 * 1. IndexedDB (idb-keyval) — primary, unlimited storage
 * 2. localStorage — patterns and settings (small, synchronous)
 * 3. Server API — cross-device sync (future)
 */

import { get, set, del, keys, entries } from 'idb-keyval';
import type { Conversation, ChatMessage, ConversationContext } from './types';

const CONV_PREFIX = 'anvil-chat:conv:';
const META_PREFIX = 'anvil-chat:meta:';
const ACTIVE_CONV_KEY = 'anvil-chat:active';
const PREFERENCES_KEY = 'anvil-chat:preferences';
const PATTERNS_KEY = 'anvil-chat:patterns-v2';

// ── Conversation CRUD ──

export async function listConversations(): Promise<Conversation[]> {
  const allEntries = await entries<string, Conversation>();
  return allEntries
    .filter(([key]) => (key as string).startsWith(CONV_PREFIX))
    .map(([, value]) => value)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  return get<Conversation>(CONV_PREFIX + id);
}

export async function saveConversation(conv: Conversation): Promise<void> {
  await set(CONV_PREFIX + conv.id, conv);
}

export async function deleteConversation(id: string): Promise<void> {
  await del(CONV_PREFIX + id);
  await del(META_PREFIX + id);
}

export async function createConversation(title?: string): Promise<Conversation> {
  const conv: Conversation = {
    id: crypto.randomUUID(),
    title: title ?? 'New conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    context: {
      files: [],
      people: [],
      topics: [],
      preferences: [],
      actions: [],
    },
  };
  await saveConversation(conv);
  return conv;
}

// ── Messages ──

export async function addMessage(
  convId: string,
  message: Omit<ChatMessage, 'id' | 'timestamp'>,
): Promise<ChatMessage> {
  const conv = await getConversation(convId);
  if (!conv) throw new Error(`Conversation ${convId} not found`);

  const msg: ChatMessage = {
    ...message,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  conv.messages.push(msg);
  conv.updatedAt = Date.now();

  // Auto-title from first user message
  if (message.role === 'user' && conv.messages.filter(m => m.role === 'user').length === 1) {
    conv.title = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '');
  }

  await saveConversation(conv);
  return msg;
}

export async function updateMessage(
  convId: string,
  messageId: string,
  updates: Partial<ChatMessage>,
): Promise<void> {
  const conv = await getConversation(convId);
  if (!conv) return;

  const idx = conv.messages.findIndex(m => m.id === messageId);
  if (idx === -1) return;

  conv.messages[idx] = { ...conv.messages[idx], ...updates };
  conv.updatedAt = Date.now();
  await saveConversation(conv);
}

// ── Context ──

export async function updateContext(
  convId: string,
  updater: (ctx: ConversationContext) => ConversationContext,
): Promise<void> {
  const conv = await getConversation(convId);
  if (!conv) return;

  conv.context = updater(conv.context);
  conv.updatedAt = Date.now();
  await saveConversation(conv);
}

export function extractContextFromToolCall(
  tool: string,
  args: Record<string, unknown>,
  result: string,
): Partial<ConversationContext> {
  const ctx: Partial<ConversationContext> = {
    files: [], people: [], topics: [], preferences: [], actions: [],
  };

  switch (tool) {
    case 'file_search':
    case 'file_read': {
      const fileId = args.file_id ?? args.query;
      if (fileId) {
        ctx.files = [{
          id: String(fileId),
          name: String(args.query ?? args.file_id ?? ''),
          type: 'unknown',
          lastAccessed: Date.now(),
        }];
      }
      break;
    }
    case 'file_share':
      if (args.file_id) {
        ctx.files = [{
          id: String(args.file_id),
          name: '',
          type: 'unknown',
          lastAccessed: Date.now(),
        }];
      }
      break;
    case 'email_search':
      if (args.query) ctx.topics = [String(args.query)];
      break;
    case 'email_send':
    case 'email_save_draft':
      if (args.to) ctx.people = [String(args.to)];
      if (args.subject) ctx.topics = [String(args.subject)];
      break;
    case 'calendar_create_event':
      if (args.title) ctx.topics = [String(args.title)];
      if (args.attendees && Array.isArray(args.attendees)) {
        ctx.people = args.attendees as string[];
      }
      break;
    case 'web_search':
      if (args.query) ctx.topics = [String(args.query)];
      break;
  }

  return ctx;
}

// ── Active conversation ──

export async function getActiveConversationId(): Promise<string | undefined> {
  return get<string>(ACTIVE_CONV_KEY);
}

export async function setActiveConversationId(id: string): Promise<void> {
  await set(ACTIVE_CONV_KEY, id);
}

// ── Cross-session preferences ──

export interface StoredPreference {
  topic: string;
  value: string;
  source: 'explicit' | 'implicit';
  createdAt: number;
  updatedAt: number;
}

export async function getPreferences(): Promise<StoredPreference[]> {
  return get<StoredPreference[]>(PREFERENCES_KEY) ?? [];
}

export async function savePreferences(prefs: StoredPreference[]): Promise<void> {
  await set(PREFERENCES_KEY, prefs);
}

export async function addPreference(
  topic: string,
  value: string,
  source: 'explicit' | 'implicit' = 'implicit',
): Promise<void> {
  const prefs = await getPreferences();
  const existing = prefs.find(p => p.topic === topic);

  if (existing) {
    existing.value = value;
    existing.updatedAt = Date.now();
    existing.source = source;
  } else {
    prefs.push({ topic, value, source, createdAt: Date.now(), updatedAt: Date.now() });
  }

  await savePreferences(prefs);
}

// ── Conversation auto-summarization ──

export async function summarizeOldConversation(convId: string): Promise<void> {
  const conv = await getConversation(convId);
  if (!conv || conv.messages.length < 20) return;

  // Keep first 5 and last 10 messages, summarize the middle
  const first = conv.messages.slice(0, 5);
  const middle = conv.messages.slice(5, -10);
  const last = conv.messages.slice(-10);

  // Create summary message for the middle
  const summaryContent = middle
    .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
    .join('\n');

  const summaryMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'system',
    content: `[Earlier in conversation: ${middle.length} messages summarized]\n${summaryContent.slice(0, 500)}`,
    timestamp: middle[0]?.timestamp ?? Date.now(),
  };

  conv.messages = [...first, summaryMsg, ...last];
  conv.updatedAt = Date.now();
  await saveConversation(conv);
}

// ── Import/Export ──

export async function exportAllConversations(): Promise<string> {
  const convs = await listConversations();
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: convs,
  }, null, 2);
}

export async function importConversations(json: string): Promise<number> {
  const data = JSON.parse(json);
  if (!data.conversations || !Array.isArray(data.conversations)) {
    throw new Error('Invalid export format');
  }

  let imported = 0;
  for (const conv of data.conversations) {
    const existing = await getConversation(conv.id);
    if (!existing) {
      await saveConversation(conv);
      imported++;
    }
  }

  return imported;
}

// ── Cleanup ──

export async function cleanupOldConversations(maxAgeDays = 90): Promise<number> {
  const convs = await listConversations();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const conv of convs) {
    if (conv.updatedAt < cutoff && conv.messages.length === 0) {
      await deleteConversation(conv.id);
      deleted++;
    }
  }

  return deleted;
}

// ── Server Sync ──

let lastSyncTimestamp = 0;

/**
 * Push a conversation to the server for cross-device sync.
 * Fire-and-forget — failures are silent.
 */
export async function syncConversationToServer(conv: Conversation, userId = 'default'): Promise<void> {
  try {
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push', userId, conversation: conv }),
    });
  } catch {
    // Silent fail — local IndexedDB is still the source of truth
  }
}

/**
 * Pull conversations from server and merge into local IndexedDB.
 * Only fetches conversations updated since last sync.
 */
export async function syncFromServer(userId = 'default'): Promise<number> {
  try {
    const res = await fetch(`/api/memory?userId=${userId}&since=${lastSyncTimestamp}`);
    if (!res.ok) return 0;

    const data = await res.json() as { conversations: Conversation[]; synced?: string };
    const incoming = data.conversations ?? [];

    let merged = 0;
    for (const conv of incoming) {
      const existing = await getConversation(conv.id);
      // Only update if server version is newer
      if (!existing || conv.updatedAt > existing.updatedAt) {
        await saveConversation(conv);
        merged++;
      }
    }

    lastSyncTimestamp = Date.now();
    return merged;
  } catch {
    return 0;
  }
}
