/**
 * Enhanced server-side conversation API.
 *
 * POST   /api/conversations          — Create new conversation
 * GET    /api/conversations          — List all conversations (query: ?userId=)
 * GET    /api/conversations?id=xxx   — Get single conversation
 * PUT    /api/conversations          — Update conversation (title, context)
 * DELETE /api/conversations?id=xxx   — Delete conversation
 * POST   /api/conversations/message  — Add message to conversation
 * GET    /api/conversations/search?q= — Search across conversations
 *
 * Storage: In-memory Map (production: PostgreSQL via Drizzle ORM).
 * Each conversation stores messages, context, and metadata.
 */

import { NextRequest, NextResponse } from 'next/server';

// ── In-Memory Store (production: Drizzle + PostgreSQL) ──

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    id: string;
    tool: string;
    args: Record<string, unknown>;
    result: string;
    status: 'running' | 'success' | 'error';
    duration?: number;
  }>;
}

interface StoredConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  context: {
    files: Array<{ id: string; name: string; type: string; lastAccessed: number }>;
    people: string[];
    topics: string[];
    preferences: string[];
    actions: Array<{ tool: string; action: string; timestamp: number; success: boolean }>;
  };
}

const conversations = new Map<string, StoredConversation>();

// ── Route Handler ──

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = searchParams.get('userId') ?? 'default';
  const query = searchParams.get('q');

  // Search mode
  if (query) {
    const results: Array<{ id: string; title: string; snippet: string; timestamp: number }> = [];
    const q = query.toLowerCase();

    for (const conv of conversations.values()) {
      if (conv.userId !== userId) continue;
      for (const msg of conv.messages) {
        if (msg.content.toLowerCase().includes(q)) {
          results.push({
            id: conv.id,
            title: conv.title,
            snippet: msg.content.slice(0, 150),
            timestamp: msg.timestamp,
          });
          if (results.length >= 20) break;
        }
      }
      if (results.length >= 20) break;
    }

    return NextResponse.json({ results });
  }

  // Single conversation
  if (id) {
    const conv = conversations.get(id);
    if (!conv || conv.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(conv);
  }

  // List all
  const list = Array.from(conversations.values())
    .filter(c => c.userId === userId)
    .map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      lastMessage: c.messages[c.messages.length - 1]?.content?.slice(0, 80) ?? '',
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ conversations: list });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body as { action?: string };

  // Add message to existing conversation
  if (action === 'message') {
    const { conversationId, message } = body as {
      conversationId: string;
      message: { role: string; content: string; toolCalls?: unknown[] };
    };

    const conv = conversations.get(conversationId);
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const stored: StoredMessage = {
      id: crypto.randomUUID(),
      role: message.role as StoredMessage['role'],
      content: message.content,
      timestamp: Date.now(),
      toolCalls: message.toolCalls as StoredMessage['toolCalls'],
    };

    conv.messages.push(stored);
    conv.updatedAt = Date.now();

    // Auto-title from first user message
    if (message.role === 'user' && conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '');
    }

    return NextResponse.json({ success: true, message: stored });
  }

  // Create new conversation
  const { userId = 'default', title = 'New conversation' } = body;
  const conv: StoredConversation = {
    id: crypto.randomUUID(),
    userId,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    context: { files: [], people: [], topics: [], preferences: [], actions: [] },
  };

  conversations.set(conv.id, conv);
  return NextResponse.json(conv, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, title, context } = body as {
    id: string;
    title?: string;
    context?: StoredConversation['context'];
  };

  const conv = conversations.get(id);
  if (!conv) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (title) conv.title = title;
  if (context) conv.context = context;
  conv.updatedAt = Date.now();

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const deleted = conversations.delete(id);
  return NextResponse.json({ success: deleted });
}
