/**
 * POST /api/memory — Cross-device conversation sync.
 *
 * Provides a lightweight server-side backing store so conversations
 * survive browser clears, device switches, and incognito sessions.
 *
 * Architecture:
 * - Primary storage: IndexedDB in browser (instant access)
 * - Backup storage: this server endpoint (cross-device, cross-session)
 * - Sync strategy: optimistic local writes, async server sync
 *
 * Actions:
 * - push:   Upload a conversation (upsert by id)
 * - pull:   Download all conversations for a user
 * - delete: Remove a conversation by id
 * - prune:  Delete all but the N most recent conversations
 * - stats:  Return usage stats without data
 */

import { NextRequest, NextResponse } from 'next/server';

// ── Storage (in-memory; replace with DB in production) ──

interface StoredConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    toolCalls?: unknown[];
    pinned?: boolean;
  }>;
  context: {
    files: Array<{ id: string; name: string; type: string; lastAccessed: number }>;
    people: string[];
    topics: string[];
    preferences: string[];
    actions: Array<{ tool: string; action: string; timestamp: number; success: boolean }>;
  };
  patterns?: Record<string, unknown>;
}

// In production: replace with Drizzle ORM + PostgreSQL
const store = new Map<string, StoredConversation[]>();

const MAX_CONVERSATIONS_PER_USER = 100;
const MAX_MESSAGES_PER_CONVERSATION = 500;

// ── Route handler ──

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    action: string;
    userId?: string;
    conversation?: StoredConversation;
    conversationId?: string;
    keepCount?: number;
  };

  const userId = body.userId ?? 'default';
  const action = body.action;

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  switch (action) {
    case 'push': {
      const conv = body.conversation;
      if (!conv?.id) {
        return NextResponse.json({ error: 'Missing conversation' }, { status: 400 });
      }

      // Enforce limits
      conv.messages = conv.messages?.slice(-MAX_MESSAGES_PER_CONVERSATION) ?? [];

      const userConvs = store.get(userId) ?? [];
      const existingIdx = userConvs.findIndex(c => c.id === conv.id);

      if (existingIdx >= 0) {
        // Update if server version is older
        if (conv.updatedAt >= (userConvs[existingIdx].updatedAt ?? 0)) {
          userConvs[existingIdx] = { ...conv, userId };
        }
      } else {
        userConvs.push({ ...conv, userId });
        // Trim if over limit
        if (userConvs.length > MAX_CONVERSATIONS_PER_USER) {
          userConvs.sort((a, b) => b.updatedAt - a.updatedAt);
          userConvs.splice(MAX_CONVERSATIONS_PER_USER);
        }
      }

      store.set(userId, userConvs);
      return NextResponse.json({ success: true, id: conv.id });
    }

    case 'pull': {
      const userConvs = store.get(userId) ?? [];
      // Return metadata-only list for efficiency; client can request full conversations
      const sinceTimestamp = typeof body.keepCount === 'number' ? body.keepCount : 0;
      const recent = userConvs
        .filter(c => c.updatedAt > sinceTimestamp)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      return NextResponse.json({
        conversations: recent,
        count: userConvs.length,
        synced: new Date().toISOString(),
      });
    }

    case 'delete': {
      const id = body.conversationId;
      if (!id) {
        return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
      }
      const userConvs = store.get(userId) ?? [];
      store.set(userId, userConvs.filter(c => c.id !== id));
      return NextResponse.json({ success: true });
    }

    case 'prune': {
      const keepCount = body.keepCount ?? 50;
      const userConvs = store.get(userId) ?? [];
      const pruned = userConvs
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, keepCount);
      store.set(userId, pruned);
      return NextResponse.json({ kept: pruned.length, removed: userConvs.length - pruned.length });
    }

    case 'stats': {
      const userConvs = store.get(userId) ?? [];
      const totalMessages = userConvs.reduce((acc, c) => acc + c.messages.length, 0);
      return NextResponse.json({
        conversations: userConvs.length,
        messages: totalMessages,
        lastSynced: userConvs.reduce((max, c) => Math.max(max, c.updatedAt), 0),
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? 'default';
  const since = Number(searchParams.get('since') ?? '0');

  const userConvs = store.get(userId) ?? [];
  const recent = userConvs
    .filter(c => c.updatedAt > since)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50);

  return NextResponse.json({
    conversations: recent,
    count: userConvs.length,
    synced: new Date().toISOString(),
  });
}
