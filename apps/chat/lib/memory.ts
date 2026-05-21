/**
 * Persistent conversation storage using IndexedDB via idb-keyval.
 * Survives across sessions — memory that persists.
 */

import { get, set, del, keys, entries } from 'idb-keyval';
import type { Conversation, ChatMessage, ConversationContext } from './types';

const CONV_PREFIX = 'anvil-chat:conv:';
const CONTEXT_PREFIX = 'anvil-chat:ctx:';
const ACTIVE_CONV_KEY = 'anvil-chat:active';

// ── Conversations ──

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
  await del(CONTEXT_PREFIX + id);
}

export async function createConversation(title?: string): Promise<Conversation> {
  const conv: Conversation = {
    id: crypto.randomUUID(),
    title: title ?? 'New conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    context: { files: [], people: [], topics: [], preferences: [], actions: [] },
  };
  await saveConversation(conv);
  return conv;
}

// ── Messages ──

export async function addMessage(
  convId: string,
  message: Omit<ChatMessage, 'id' | 'timestamp'>
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

  // Auto-title: use first user message as title
  if (message.role === 'user' && conv.messages.filter(m => m.role === 'user').length === 1) {
    conv.title = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '');
  }

  await saveConversation(conv);
  return msg;
}

export async function updateMessage(
  convId: string,
  messageId: string,
  updates: Partial<ChatMessage>
): Promise<void> {
  const conv = await getConversation(convId);
  if (!conv) return;

  const idx = conv.messages.findIndex(m => m.id === messageId);
  if (idx === -1) return;

  conv.messages[idx] = { ...conv.messages[idx], ...updates };
  conv.updatedAt = Date.now();
  await saveConversation(conv);
}

// ── Context Accumulation ──

export async function updateContext(
  convId: string,
  updater: (ctx: ConversationContext) => ConversationContext
): Promise<void> {
  const conv = await getConversation(convId);
  if (!conv) return;

  conv.context = updater(conv.context);
  conv.updatedAt = Date.now();
  await saveConversation(conv);
}

// ── Active conversation tracking ──

export async function getActiveConversationId(): Promise<string | undefined> {
  return get<string>(ACTIVE_CONV_KEY);
}

export async function setActiveConversationId(id: string): Promise<void> {
  await set(ACTIVE_CONV_KEY, id);
}

// ── Context extraction from AI interactions ──

export function extractContextFromToolCall(
  tool: string,
  args: Record<string, unknown>,
  result: string
): Partial<ConversationContext> {
  const ctx: Partial<ConversationContext> = { files: [], people: [], topics: [], preferences: [], actions: [] };

  switch (tool) {
    case 'file_search':
    case 'file_read':
      if (args.file_id) {
        ctx.files = [{ id: String(args.file_id), name: String(args.query ?? ''), type: 'unknown', lastAccessed: Date.now() }];
      }
      break;
    case 'email_search':
    case 'email_send':
      if (args.query) ctx.topics = [String(args.query)];
      if (args.to) ctx.people = [String(args.to)];
      break;
    case 'calendar_create_event':
      if (args.title) ctx.topics = [String(args.title)];
      if (args.attendees) ctx.people = (args.attendees as string[]);
      break;
  }

  return ctx;
}
