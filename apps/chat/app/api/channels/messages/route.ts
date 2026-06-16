/**
 * POST /api/channels/messages     — Post a new message
 * GET  /api/channels/messages     — Get messages (paginated)
 * PUT  /api/channels/messages     — Edit a message
 * DELETE /api/channels/messages   — Soft-delete a message
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dbPostMessage, dbGetMessages, dbEditMessage, dbDeleteMessage,
  type ChannelMessage,
} from '@/lib/channels-db';
import { presenceBroadcast } from '@/lib/presence-bus';
import { indexMessage } from '@/lib/meilisearch-channels';

function genId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  const before = searchParams.get('before') ? Number(searchParams.get('before')) : undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
  const threadId = searchParams.get('threadId');

  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }

  const messages = dbGetMessages(channelId, {
    limit,
    before,
    threadId: threadId !== null ? threadId : undefined,
  });

  return NextResponse.json({ messages, hasMore: messages.length === limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    channelId, userId = 'default', content, type = 'text',
    threadId, attachments, metadata,
  } = body as {
    channelId: string;
    userId?: string;
    content: string;
    type?: ChannelMessage['type'];
    threadId?: string;
    attachments?: ChannelMessage['attachments'];
    metadata?: Record<string, unknown>;
  };

  if (!channelId || !content) {
    return NextResponse.json({ error: 'channelId and content required' }, { status: 400 });
  }

  const msg = dbPostMessage({
    id: genId(),
    channelId,
    userId,
    content,
    type,
    threadId,
    reactions: {},
    attachments,
    metadata,
    createdAt: Date.now(),
  });

  // Broadcast to SSE presence bus
  presenceBroadcast({ type: 'message', channelId, message: msg });

  // Async index to Meilisearch (non-blocking)
  indexMessage({
    id: msg.id,
    channelId: msg.channelId,
    userId: msg.userId,
    content: msg.content,
    createdAt: msg.createdAt,
    type: msg.type,
  }).catch(() => { /* non-critical */ });

  return NextResponse.json(msg, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, userId = 'default', content } = body as {
    id: string;
    userId?: string;
    content: string;
  };

  if (!id || !content) {
    return NextResponse.json({ error: 'id and content required' }, { status: 400 });
  }

  const ok = dbEditMessage(id, userId, content);
  if (!ok) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });

  presenceBroadcast({ type: 'message_edited', id, content, editedAt: Date.now() });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = searchParams.get('userId') ?? 'default';

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const ok = dbDeleteMessage(id, userId);
  if (!ok) return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });

  presenceBroadcast({ type: 'message_deleted', id });

  return NextResponse.json({ ok: true });
}
