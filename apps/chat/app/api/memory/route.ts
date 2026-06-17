/**
 * POST /api/memory — Cross-device conversation sync backed by SQLite.
 *
 * Provides durable server-side storage so conversations survive
 * browser clears, device switches, and server restarts.
 *
 * Architecture:
 * - Primary storage: IndexedDB in browser (instant, offline-capable)
 * - Backup storage: SQLite on server via better-sqlite3 (durable, cross-device)
 * - Sync: optimistic local writes, async server sync on every message
 *
 * Actions:
 *   push   — Upsert a conversation (new or updated)
 *   pull   — Fetch all conversations since a timestamp
 *   delete — Remove a conversation by id
 *   prune  — Keep only the N most recent conversations
 *   stats  — Return usage stats (no data)
 *   patterns — Get/set accumulated user patterns
 *   preferences — Get/set user preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dbSaveConversation,
  dbGetConversation,
  dbListConversations,
  dbDeleteConversation,
  dbPruneConversations,
  dbGetConvStats,
  dbSavePatterns,
  dbGetPatterns,
  dbSetPreference,
  dbGetPreferences,
  dbDeletePreference,
  dbCacheAttention,
  dbGetAttentionCache,
} from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    action: string;
    userId?: string;
    conversation?: Parameters<typeof dbSaveConversation>[0];
    conversationId?: string;
    keepCount?: number;
    patterns?: Record<string, unknown>;
    key?: string;
    value?: string;
    data?: unknown;
    ttlMs?: number;
  };

  const userId = body.userId ?? 'default';
  const action = body.action;

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'push': {
        const conv = body.conversation;
        if (!conv?.id) {
          return NextResponse.json({ error: 'Missing conversation' }, { status: 400 });
        }
        dbSaveConversation({ ...conv, userId });
        return NextResponse.json({ success: true, id: conv.id });
      }

      case 'pull': {
        // `keepCount` is reused as the `since` timestamp for pull
        const since = body.keepCount ?? 0;
        const conversations = dbListConversations(userId, 100, since);
        const stats = dbGetConvStats(userId);
        return NextResponse.json({
          conversations,
          count: stats.conversations,
          synced: new Date().toISOString(),
        });
      }

      case 'get': {
        const id = body.conversationId;
        if (!id) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
        const conv = dbGetConversation(id, userId);
        if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ conversation: conv });
      }

      case 'delete': {
        const id = body.conversationId;
        if (!id) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
        const deleted = dbDeleteConversation(id, userId);
        return NextResponse.json({ success: deleted });
      }

      case 'prune': {
        const keepCount = body.keepCount ?? 50;
        const removed = dbPruneConversations(userId, keepCount);
        const stats = dbGetConvStats(userId);
        return NextResponse.json({ kept: stats.conversations, removed });
      }

      case 'stats': {
        const stats = dbGetConvStats(userId);
        return NextResponse.json(stats);
      }

      case 'save_patterns': {
        const patterns = body.patterns;
        if (!patterns) return NextResponse.json({ error: 'Missing patterns' }, { status: 400 });
        dbSavePatterns(userId, patterns);
        return NextResponse.json({ success: true });
      }

      case 'get_patterns': {
        const patterns = dbGetPatterns(userId);
        return NextResponse.json({ patterns });
      }

      case 'set_preference': {
        const { key, value } = body;
        if (!key || value === undefined) return NextResponse.json({ error: 'Missing key/value' }, { status: 400 });
        dbSetPreference(userId, key, value);
        return NextResponse.json({ success: true });
      }

      case 'get_preferences': {
        const prefs = dbGetPreferences(userId);
        return NextResponse.json({ preferences: prefs });
      }

      case 'delete_preference': {
        const { key } = body;
        if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
        const deleted = dbDeletePreference(userId, key);
        return NextResponse.json({ success: deleted });
      }

      case 'cache_attention': {
        if (!body.data) return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        dbCacheAttention(userId, body.data, body.ttlMs ?? 5 * 60 * 1000);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[memory API]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? 'default';
  const since = Number(searchParams.get('since') ?? '0');
  const action = searchParams.get('action');

  try {
    if (action === 'attention') {
      const cached = dbGetAttentionCache(userId);
      if (cached) return NextResponse.json({ cached: true, data: cached });
      return NextResponse.json({ cached: false, data: null });
    }

    if (action === 'patterns') {
      const patterns = dbGetPatterns(userId);
      return NextResponse.json({ patterns });
    }

    if (action === 'preferences') {
      const prefs = dbGetPreferences(userId);
      return NextResponse.json({ preferences: prefs });
    }

    // Default: list conversations
    const conversations = dbListConversations(userId, 100, since);
    const stats = dbGetConvStats(userId);
    return NextResponse.json({
      conversations,
      count: stats.conversations,
      synced: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[memory API GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
