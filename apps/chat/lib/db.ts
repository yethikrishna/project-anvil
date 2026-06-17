/**
 * SQLite-backed persistence layer for Anvil Chat.
 *
 * Provides durable server-side storage for:
 * - Conversations + messages (cross-device sync)
 * - User preferences (remembered context)
 * - Patterns (accumulated context from tool use)
 * - Attention cache (avoid re-scanning on every load)
 *
 * Uses better-sqlite3 for synchronous, zero-latency local SQLite.
 * Data file: ANVIL_DB_PATH env or ~/.anvil/chat.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Database setup ──

function getDbPath(): string {
  if (process.env.ANVIL_DB_PATH) return process.env.ANVIL_DB_PATH;
  const dir = path.join(os.homedir(), '.anvil');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'chat.db');
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(getDbPath());
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL DEFAULT 'default',
      title       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      context     TEXT NOT NULL DEFAULT '{}',
      patterns    TEXT,
      summary     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
      ON conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      timestamp       INTEGER NOT NULL,
      tool_calls      TEXT,
      pinned          INTEGER NOT NULL DEFAULT 0,
      metadata        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv_time
      ON messages(conversation_id, timestamp);

    CREATE TABLE IF NOT EXISTS preferences (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL DEFAULT 'default',
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, key)
    );

    CREATE TABLE IF NOT EXISTS attention_cache (
      user_id    TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_patterns (
      user_id    TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_facts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL DEFAULT 'default',
      category   TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      source     TEXT NOT NULL DEFAULT 'inferred',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, category, key)
    );
  `);
}

// ── Types ──

export interface DBConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: DBMessage[];
  context: ConversationContext;
  patterns?: Record<string, unknown>;
  summary?: string;
}

export interface DBMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
  toolCalls?: unknown[];
  pinned?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ConversationContext {
  files: Array<{ id: string; name: string; type: string; lastAccessed: number }>;
  people: string[];
  topics: string[];
  preferences: string[];
  actions: Array<{ tool: string; action: string; timestamp: number; success: boolean }>;
}

// ── Conversations ──

export function dbSaveConversation(conv: Omit<DBConversation, 'messages'> & { messages?: DBMessage[] }): void {
  const db = getDb();

  const upsertConv = db.prepare(`
    INSERT INTO conversations (id, user_id, title, created_at, updated_at, context, patterns, summary)
    VALUES (@id, @userId, @title, @createdAt, @updatedAt, @context, @patterns, @summary)
    ON CONFLICT(id) DO UPDATE SET
      title      = excluded.title,
      updated_at = excluded.updated_at,
      context    = excluded.context,
      patterns   = excluded.patterns,
      summary    = excluded.summary
    WHERE excluded.updated_at >= conversations.updated_at
  `);

  const upsertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, timestamp, tool_calls, pinned, metadata)
    VALUES (@id, @conversationId, @role, @content, @timestamp, @toolCalls, @pinned, @metadata)
    ON CONFLICT(id) DO UPDATE SET
      content    = excluded.content,
      tool_calls = excluded.tool_calls,
      pinned     = excluded.pinned,
      metadata   = excluded.metadata
  `);

  const txn = db.transaction(() => {
    upsertConv.run({
      id: conv.id,
      userId: conv.userId ?? 'default',
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      context: JSON.stringify(conv.context ?? {}),
      patterns: conv.patterns ? JSON.stringify(conv.patterns) : null,
      summary: conv.summary ?? null,
    });

    if (conv.messages) {
      for (const msg of conv.messages.slice(-500)) {
        upsertMsg.run({
          id: msg.id,
          conversationId: conv.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          pinned: msg.pinned ? 1 : 0,
          metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
        });
      }
    }
  });

  txn();
}

export function dbGetConversation(id: string, userId = 'default'): DBConversation | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND user_id = ?
  `).get(id, userId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const msgs = db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC
  `).all(id) as Record<string, unknown>[];

  return rowToConversation(row, msgs);
}

export function dbListConversations(userId = 'default', limit = 100, since = 0): DBConversation[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM conversations
    WHERE user_id = ? AND updated_at > ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, since, limit) as Record<string, unknown>[];

  return rows.map(row => {
    const msgs = db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC
    `).all(row['id'] as string) as Record<string, unknown>[];
    return rowToConversation(row, msgs);
  });
}

export function dbDeleteConversation(id: string, userId = 'default'): boolean {
  const db = getDb();
  const result = db.prepare(
    'DELETE FROM conversations WHERE id = ? AND user_id = ?'
  ).run(id, userId);
  return result.changes > 0;
}

export function dbPruneConversations(userId = 'default', keepCount = 50): number {
  const db = getDb();

  const toDelete = db.prepare(`
    SELECT id FROM conversations
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT -1 OFFSET ?
  `).all(userId, keepCount) as Array<{ id: string }>;

  if (toDelete.length === 0) return 0;

  const deleteStmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  const txn = db.transaction(() => {
    for (const row of toDelete) deleteStmt.run(row.id);
  });
  txn();
  return toDelete.length;
}

export function dbGetConvStats(userId = 'default'): { conversations: number; messages: number; lastUpdated: number } {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as conversations,
      MAX(updated_at) as lastUpdated
    FROM conversations WHERE user_id = ?
  `).get(userId) as { conversations: number; lastUpdated: number };

  const msgCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.user_id = ?
  `).get(userId) as { cnt: number };

  return {
    conversations: stats.conversations ?? 0,
    messages: msgCount.cnt ?? 0,
    lastUpdated: stats.lastUpdated ?? 0,
  };
}

// ── User patterns ──

export function dbSavePatterns(userId: string, patterns: Record<string, unknown>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_patterns (user_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(userId, JSON.stringify(patterns), Date.now());
}

export function dbGetPatterns(userId: string): Record<string, unknown> | null {
  const db = getDb();
  const row = db.prepare('SELECT data FROM user_patterns WHERE user_id = ?').get(userId) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

// ── Preferences ──

export function dbSetPreference(userId: string, key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO preferences (user_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(userId, key, value, Date.now());
}

export function dbGetPreferences(userId: string): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM preferences WHERE user_id = ?').all(userId) as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function dbDeletePreference(userId: string, key: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM preferences WHERE user_id = ? AND key = ?').run(userId, key);
  return result.changes > 0;
}

// ── Attention cache ──

export function dbCacheAttention(userId: string, data: unknown, ttlMs = 5 * 60 * 1000): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO attention_cache (user_id, data, fetched_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at
  `).run(userId, JSON.stringify(data), now, now + ttlMs);
}

export function dbGetAttentionCache(userId: string): unknown | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT data FROM attention_cache WHERE user_id = ? AND expires_at > ?'
  ).get(userId, Date.now()) as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

// ── Helpers ──

function rowToConversation(row: Record<string, unknown>, msgRows: Record<string, unknown>[]): DBConversation {
  let context: ConversationContext = { files: [], people: [], topics: [], preferences: [], actions: [] };
  try { context = JSON.parse(row['context'] as string); } catch { /* use default */ }

  const messages: DBMessage[] = msgRows.map(m => ({
    id: m['id'] as string,
    conversationId: m['conversation_id'] as string,
    role: m['role'] as string,
    content: m['content'] as string,
    timestamp: m['timestamp'] as number,
    toolCalls: m['tool_calls'] ? JSON.parse(m['tool_calls'] as string) : undefined,
    pinned: Boolean(m['pinned']),
    metadata: m['metadata'] ? JSON.parse(m['metadata'] as string) : undefined,
  }));

  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    title: row['title'] as string,
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
    messages,
    context,
    patterns: row['patterns'] ? JSON.parse(row['patterns'] as string) : undefined,
    summary: row['summary'] as string | undefined,
  };
}
