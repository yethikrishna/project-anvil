/**
 * Conversation API — SQLite-backed persistent storage.
 *
 * POST   /api/conversations               — Create new conversation
 * GET    /api/conversations               — List all conversations (?userId=&since=)
 * GET    /api/conversations?id=xxx        — Get single conversation with messages
 * PUT    /api/conversations               — Update conversation (title, context)
 * DELETE /api/conversations?id=xxx        — Delete conversation
 * POST   /api/conversations (action=message) — Add message to conversation
 * GET    /api/conversations?q=xxx         — Full-text search across conversations
 * GET    /api/conversations?stats=1       — Usage statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dbSaveConversation,
  dbGetConversation,
  dbListConversations,
  dbDeleteConversation,
  dbGetConvStats,
  type DBConversation,
  type DBMessage,
  type ConversationContext,
} from '@/lib/db';

function emptyContext(): ConversationContext {
  return { files: [], people: [], topics: [], preferences: [], actions: [] };
}

// ── GET ──

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = searchParams.get('userId') ?? 'default';
  const query = searchParams.get('q');
  const stats = searchParams.get('stats');
  const since = Number(searchParams.get('since') ?? 0);

  // Stats mode
  if (stats) {
    return NextResponse.json(dbGetConvStats(userId));
  }

  // Search mode — in-memory search over recent conversations
  if (query) {
    const all = dbListConversations(userId, 200, 0);
    const q = query.toLowerCase();
    const results: Array<{ id: string; title: string; snippet: string; timestamp: number }> = [];

    for (const conv of all) {
      for (const msg of conv.messages) {
        if (msg.content.toLowerCase().includes(q)) {
          results.push({
            id: conv.id,
            title: conv.title,
            snippet: msg.content.slice(0, 150),
            timestamp: msg.timestamp,
          });
          break; // One result per conversation
        }
      }
      if (results.length >= 20) break;
    }

    return NextResponse.json({ results });
  }

  // Single conversation
  if (id) {
    const conv = dbGetConversation(id, userId);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(conv);
  }

  // List — paginated, ordered by updatedAt DESC
  const conversations = dbListConversations(userId, 100, since).map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
    lastMessage: c.messages[c.messages.length - 1]?.content?.slice(0, 80) ?? '',
    context: {
      topics: c.context.topics.slice(0, 5),
      people: c.context.people.slice(0, 5),
    },
  }));

  return NextResponse.json({ conversations });
}

// ── POST ──

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action?: string };

  // Add message to existing conversation
  if (action === 'message') {
    const { conversationId, message, userId = 'default' } = body as {
      conversationId: string;
      userId?: string;
      message: {
        role: string;
        content: string;
        toolCalls?: unknown[];
        metadata?: Record<string, unknown>;
      };
    };

    const conv = dbGetConversation(conversationId, userId);
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const newMsg: DBMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      toolCalls: message.toolCalls,
      metadata: message.metadata,
    };

    conv.messages.push(newMsg);
    conv.updatedAt = Date.now();

    // Auto-title from first user message
    if (message.role === 'user' && conv.messages.filter(m => m.role === 'user').length === 1) {
      const raw = message.content.replace(/\n/g, ' ').trim();
      conv.title = raw.slice(0, 60) + (raw.length > 60 ? '...' : '');
    }

    dbSaveConversation(conv);

    return NextResponse.json({ success: true, message: newMsg });
  }

  // Bulk upsert — for syncing from client
  if (action === 'sync') {
    const { conversation } = body as { conversation: DBConversation };
    if (!conversation?.id) {
      return NextResponse.json({ error: 'Missing conversation data' }, { status: 400 });
    }
    dbSaveConversation(conversation);
    return NextResponse.json({ success: true });
  }

  // Create new conversation
  const { userId = 'default', title = 'New conversation', id } = body;

  const conv: DBConversation = {
    id: id ?? crypto.randomUUID(),
    userId,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    context: emptyContext(),
  };

  dbSaveConversation(conv);
  return NextResponse.json(conv, { status: 201 });
}

// ── PUT ──

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, userId = 'default', title, context, patterns, summary } = body as {
    id: string;
    userId?: string;
    title?: string;
    context?: ConversationContext;
    patterns?: Record<string, unknown>;
    summary?: string;
  };

  const conv = dbGetConversation(id, userId);
  if (!conv) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (title) conv.title = title;
  if (context) conv.context = context;
  if (patterns) conv.patterns = patterns;
  if (summary !== undefined) conv.summary = summary;
  conv.updatedAt = Date.now();

  dbSaveConversation(conv);
  return NextResponse.json({ success: true });
}

// ── DELETE ──

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = searchParams.get('userId') ?? 'default';

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const deleted = dbDeleteConversation(id, userId);
  return NextResponse.json({ success: deleted });
}
