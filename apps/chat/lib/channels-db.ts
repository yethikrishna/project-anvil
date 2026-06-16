/**
 * Channels + Direct Messages persistence layer.
 *
 * Schema:
 * - channels: #general, #announcements, custom channels
 * - channel_members: who is in what channel
 * - channel_messages: messages with reactions, threads, edits
 * - dm_threads: 1:1 or group DM threads
 * - presence: online/away/offline + last_seen
 * - read_receipts: per-user per-channel last-read cursor
 * - typing_indicators: ephemeral (TTL'd rows, not from DB but managed here)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

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
  initChannelSchema(_db);
  return _db;
}

export function initChannelSchema(db: Database.Database): void {
  db.exec(`
    -- Channels (#general, #random, custom)
    CREATE TABLE IF NOT EXISTS channels (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      type        TEXT NOT NULL DEFAULT 'public',  -- public | private | dm
      created_by  TEXT NOT NULL DEFAULT 'default',
      created_at  INTEGER NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      metadata    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);

    -- Channel members
    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'member',  -- admin | member
      joined_at  INTEGER NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    );

    -- Channel messages
    CREATE TABLE IF NOT EXISTS channel_messages (
      id           TEXT PRIMARY KEY,
      channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL,
      content      TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'text',  -- text | file | system | ai
      thread_id    TEXT,                          -- parent message id for threads
      edited_at    INTEGER,
      deleted_at   INTEGER,
      reactions    TEXT NOT NULL DEFAULT '{}',    -- JSON {emoji: [userId, ...]}
      attachments  TEXT,                          -- JSON array
      metadata     TEXT,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cm_channel_time
      ON channel_messages(channel_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cm_thread
      ON channel_messages(thread_id, created_at);

    -- DM threads
    CREATE TABLE IF NOT EXISTS dm_threads (
      id          TEXT PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dm_thread_members (
      thread_id  TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      PRIMARY KEY (thread_id, user_id)
    );

    -- Read receipts (last message id read per user per channel)
    CREATE TABLE IF NOT EXISTS read_receipts (
      channel_id        TEXT NOT NULL,
      user_id           TEXT NOT NULL,
      last_read_msg_id  TEXT,
      last_read_at      INTEGER NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    );

    -- User presence
    CREATE TABLE IF NOT EXISTS user_presence (
      user_id       TEXT PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'offline',  -- online | away | offline
      last_seen     INTEGER NOT NULL,
      display_name  TEXT,
      avatar_url    TEXT
    );

    -- Seed default channels if not present
    INSERT OR IGNORE INTO channels (id, name, description, type, created_by, created_at)
    VALUES
      ('ch_general',       'general',       'General discussions',            'public', 'system', ${Date.now()}),
      ('ch_announcements', 'announcements', 'Important announcements',        'public', 'system', ${Date.now()}),
      ('ch_random',        'random',        'Off-topic conversations',         'public', 'system', ${Date.now()}),
      ('ch_ai',            'ai-commands',   'AI assistant commands and results','public', 'system', ${Date.now()});
  `);
}

// ── Types ──

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: 'public' | 'private' | 'dm';
  createdBy: string;
  createdAt: number;
  isArchived: boolean;
  metadata?: Record<string, unknown>;
  unreadCount?: number;
  lastMessage?: ChannelMessage;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  type: 'text' | 'file' | 'system' | 'ai';
  threadId?: string;
  editedAt?: number;
  deletedAt?: number;
  reactions: Record<string, string[]>;
  attachments?: MessageAttachment[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  // Joined fields
  displayName?: string;
  avatarUrl?: string;
  threadCount?: number;
}

export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: number;
  displayName?: string;
  avatarUrl?: string;
}

// ── Channels CRUD ──

export function dbCreateChannel(channel: Omit<Channel, 'unreadCount' | 'lastMessage'>): Channel {
  const db = getDb();
  db.prepare(`
    INSERT INTO channels (id, name, description, type, created_by, created_at, is_archived, metadata)
    VALUES (@id, @name, @description, @type, @createdBy, @createdAt, @isArchived, @metadata)
  `).run({
    id: channel.id,
    name: channel.name,
    description: channel.description ?? null,
    type: channel.type,
    createdBy: channel.createdBy,
    createdAt: channel.createdAt,
    isArchived: channel.isArchived ? 1 : 0,
    metadata: channel.metadata ? JSON.stringify(channel.metadata) : null,
  });
  return channel;
}

export function dbListChannels(userId = 'default'): Channel[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM channel_messages cm
       WHERE cm.channel_id = c.id AND cm.deleted_at IS NULL) as msg_count
    FROM channels c
    WHERE c.is_archived = 0
    ORDER BY c.name ASC
  `).all() as Record<string, unknown>[];

  return rows.map(row => {
    const lastMsgRow = db.prepare(`
      SELECT * FROM channel_messages
      WHERE channel_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(row['id'] as string) as Record<string, unknown> | undefined;

    const unreadRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM channel_messages cm
      LEFT JOIN read_receipts rr ON rr.channel_id = cm.channel_id AND rr.user_id = ?
      WHERE cm.channel_id = ? AND cm.deleted_at IS NULL
        AND (rr.last_read_at IS NULL OR cm.created_at > rr.last_read_at)
    `).get(userId, row['id'] as string) as { cnt: number };

    return {
      id: row['id'] as string,
      name: row['name'] as string,
      description: row['description'] as string | undefined,
      type: row['type'] as Channel['type'],
      createdBy: row['created_by'] as string,
      createdAt: row['created_at'] as number,
      isArchived: Boolean(row['is_archived']),
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined,
      unreadCount: unreadRow?.cnt ?? 0,
      lastMessage: lastMsgRow ? rowToMessage(lastMsgRow) : undefined,
    };
  });
}

export function dbGetChannel(id: string): Channel | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: row['description'] as string | undefined,
    type: row['type'] as Channel['type'],
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as number,
    isArchived: Boolean(row['is_archived']),
  };
}

// ── Messages CRUD ──

export function dbPostMessage(msg: Omit<ChannelMessage, 'displayName' | 'avatarUrl' | 'threadCount'>): ChannelMessage {
  const db = getDb();
  db.prepare(`
    INSERT INTO channel_messages
      (id, channel_id, user_id, content, type, thread_id, reactions, attachments, metadata, created_at)
    VALUES
      (@id, @channelId, @userId, @content, @type, @threadId, @reactions, @attachments, @metadata, @createdAt)
  `).run({
    id: msg.id,
    channelId: msg.channelId,
    userId: msg.userId,
    content: msg.content,
    type: msg.type,
    threadId: msg.threadId ?? null,
    reactions: JSON.stringify(msg.reactions ?? {}),
    attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
    metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
    createdAt: msg.createdAt,
  });
  return msg;
}

export function dbGetMessages(
  channelId: string,
  opts: { limit?: number; before?: number; threadId?: string | null } = {},
): ChannelMessage[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const before = opts.before ?? Date.now() + 1;
  const threadFilter = opts.threadId !== undefined
    ? `AND thread_id ${opts.threadId === null ? 'IS NULL' : `= '${opts.threadId}'`}`
    : '';

  const rows = db.prepare(`
    SELECT cm.*, up.display_name, up.avatar_url,
      (SELECT COUNT(*) FROM channel_messages t WHERE t.thread_id = cm.id AND t.deleted_at IS NULL) as thread_count
    FROM channel_messages cm
    LEFT JOIN user_presence up ON up.user_id = cm.user_id
    WHERE cm.channel_id = ? AND cm.deleted_at IS NULL
      AND cm.created_at < ?
      ${threadFilter}
    ORDER BY cm.created_at DESC
    LIMIT ?
  `).all(channelId, before, limit) as Record<string, unknown>[];

  return rows.reverse().map(rowToMessage);
}

export function dbEditMessage(id: string, userId: string, content: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE channel_messages SET content = ?, edited_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).run(content, Date.now(), id, userId);
  return result.changes > 0;
}

export function dbDeleteMessage(id: string, userId: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE channel_messages SET deleted_at = ?
    WHERE id = ? AND user_id = ?
  `).run(Date.now(), id, userId);
  return result.changes > 0;
}

export function dbToggleReaction(msgId: string, userId: string, emoji: string): Record<string, string[]> {
  const db = getDb();
  const row = db.prepare('SELECT reactions FROM channel_messages WHERE id = ?').get(msgId) as { reactions: string } | undefined;
  if (!row) return {};

  let reactions: Record<string, string[]> = {};
  try { reactions = JSON.parse(row.reactions); } catch { /* empty */ }

  if (!reactions[emoji]) reactions[emoji] = [];
  const idx = reactions[emoji].indexOf(userId);
  if (idx > -1) {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji].push(userId);
  }

  db.prepare('UPDATE channel_messages SET reactions = ? WHERE id = ?')
    .run(JSON.stringify(reactions), msgId);

  return reactions;
}

// ── Read receipts ──

export function dbMarkRead(channelId: string, userId: string, msgId: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO read_receipts (channel_id, user_id, last_read_msg_id, last_read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET
      last_read_msg_id = excluded.last_read_msg_id,
      last_read_at = excluded.last_read_at
  `).run(channelId, userId, msgId, Date.now());
}

// ── Presence ──

export function dbSetPresence(userId: string, status: UserPresence['status'], displayName?: string, avatarUrl?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_presence (user_id, status, last_seen, display_name, avatar_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status,
      last_seen = excluded.last_seen,
      display_name = COALESCE(excluded.display_name, display_name),
      avatar_url = COALESCE(excluded.avatar_url, avatar_url)
  `).run(userId, status, Date.now(), displayName ?? null, avatarUrl ?? null);
}

export function dbGetPresence(userIds?: string[]): UserPresence[] {
  const db = getDb();

  if (userIds?.length) {
    const placeholders = userIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT * FROM user_presence WHERE user_id IN (${placeholders})`
    ).all(...userIds) as Record<string, unknown>[];
    return rows.map(rowToPresence);
  }

  // Mark users as offline if last_seen > 2 min ago
  db.prepare(`
    UPDATE user_presence SET status = 'offline'
    WHERE status != 'offline' AND last_seen < ?
  `).run(Date.now() - 2 * 60 * 1000);

  const rows = db.prepare('SELECT * FROM user_presence').all() as Record<string, unknown>[];
  return rows.map(rowToPresence);
}

// ── Search ──

export function dbSearchMessages(query: string, channelId?: string, limit = 20): ChannelMessage[] {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;

  const channelFilter = channelId ? 'AND cm.channel_id = ?' : '';
  const params: unknown[] = channelId ? [q, channelId, limit] : [q, limit];

  const rows = db.prepare(`
    SELECT cm.*, up.display_name, up.avatar_url,
      (SELECT COUNT(*) FROM channel_messages t WHERE t.thread_id = cm.id AND t.deleted_at IS NULL) as thread_count
    FROM channel_messages cm
    LEFT JOIN user_presence up ON up.user_id = cm.user_id
    WHERE lower(cm.content) LIKE ? AND cm.deleted_at IS NULL
      ${channelFilter}
    ORDER BY cm.created_at DESC
    LIMIT ?
  `).all(...params) as Record<string, unknown>[];

  return rows.map(rowToMessage);
}

// ── Helpers ──

function rowToMessage(row: Record<string, unknown>): ChannelMessage {
  let reactions: Record<string, string[]> = {};
  try { reactions = JSON.parse(row['reactions'] as string ?? '{}'); } catch { /* empty */ }

  return {
    id: row['id'] as string,
    channelId: row['channel_id'] as string,
    userId: row['user_id'] as string,
    content: row['content'] as string,
    type: (row['type'] as ChannelMessage['type']) ?? 'text',
    threadId: row['thread_id'] as string | undefined,
    editedAt: row['edited_at'] as number | undefined,
    deletedAt: row['deleted_at'] as number | undefined,
    reactions,
    attachments: row['attachments'] ? JSON.parse(row['attachments'] as string) : undefined,
    metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined,
    createdAt: row['created_at'] as number,
    displayName: row['display_name'] as string | undefined,
    avatarUrl: row['avatar_url'] as string | undefined,
    threadCount: (row['thread_count'] as number) ?? 0,
  };
}

function rowToPresence(row: Record<string, unknown>): UserPresence {
  return {
    userId: row['user_id'] as string,
    status: row['status'] as UserPresence['status'],
    lastSeen: row['last_seen'] as number,
    displayName: row['display_name'] as string | undefined,
    avatarUrl: row['avatar_url'] as string | undefined,
  };
}
