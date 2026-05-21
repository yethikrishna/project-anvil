/**
 * Conversations API — server-side persistence for chat history.
 *
 * GET  /api/conversations           — list conversations
 * POST /api/conversations           — create conversation
 * GET  /api/conversations?id=xxx    — get single conversation
 * PUT  /api/conversations           — update conversation
 * DELETE /api/conversations?id=xxx  — delete conversation
 */

import { NextRequest, NextResponse } from 'next/server';

// ── In-memory store (production: PostgreSQL via Drizzle) ──

interface StoredConversation {
  id: string;
  title: string;
  userId: string;
  messages: Array<{
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
    voiceInput?: boolean;
  }>;
  context: {
    files: Array<{ id: string; name: string; type: string; lastAccessed: number }>;
    people: string[];
    topics: string[];
    preferences: string[];
    actions: Array<{ tool: string; action: string; timestamp: number; success: boolean }>;
  };
  createdAt: number;
  updatedAt: number;
}

// In production, this is Drizzle ORM against PostgreSQL
const store = new Map<string, StoredConversation>();

function getUserId(_req: NextRequest): string {
  // Production: extract from JWT/session
  return 'default-user';
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const conv = store.get(`${userId}:${id}`);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(conv);
  }

  // List all conversations for user
  const conversations = Array.from(store.entries())
    .filter(([key]) => key.startsWith(`${userId}:`))
    .map(([, value]) => ({
      id: value.id,
      title: value.title,
      messageCount: value.messages.length,
      lastMessage: value.messages[value.messages.length - 1]?.content?.slice(0, 100) ?? '',
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  const body = await req.json();

  const id = body.id ?? crypto.randomUUID();
  const conv: StoredConversation = {
    id,
    title: body.title ?? 'New conversation',
    userId,
    messages: body.messages ?? [],
    context: body.context ?? {
      files: [], people: [], topics: [], preferences: [], actions: [],
    },
    createdAt: body.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  store.set(`${userId}:${id}`, conv);
  return NextResponse.json(conv, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const userId = getUserId(req);
  const body = await req.json();
  const id = body.id;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const key = `${userId}:${id}`;
  const existing = store.get(key);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated: StoredConversation = {
    ...existing,
    ...body,
    updatedAt: Date.now(),
  };

  store.set(key, updated);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  store.delete(`${userId}:${id}`);
  return NextResponse.json({ deleted: true });
}
