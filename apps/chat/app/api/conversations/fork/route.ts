/**
 * POST /api/conversations/fork
 *
 * Forks a conversation at a specific message point.
 * Creates a new conversation with:
 * - All messages up to + including the fork message
 * - A "forked from" marker in the title
 * - Same conversation context (optionally)
 * - Optional initial message to start the fork with
 *
 * The fork is independent — edits to the fork don't affect the original.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbSaveConversation, dbGetConversation, type DBMessage } from '@/lib/db';

export const runtime = 'nodejs';

export interface ForkRequest {
  sourceConversationId: string;
  forkFromMessageId: string;
  newTitle: string;
  preserveContext?: boolean;
  userId?: string;
}

export interface ForkResponse {
  forkId: string;
  title: string;
  messageCount: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as ForkRequest;
  const { sourceConversationId, forkFromMessageId, newTitle, preserveContext = true, userId = 'default' } = body;

  if (!sourceConversationId || !forkFromMessageId) {
    return NextResponse.json({ error: 'Missing sourceConversationId or forkFromMessageId' }, { status: 400 });
  }

  // Load the source conversation
  const source = dbGetConversation(sourceConversationId, userId);
  if (!source) {
    return NextResponse.json({ error: 'Source conversation not found' }, { status: 404 });
  }

  const forkId = crypto.randomUUID();
  const now = Date.now();

  // Find the fork point
  const forkIdx = source.messages.findIndex((m: DBMessage) => m.id === forkFromMessageId);
  if (forkIdx === -1) {
    return NextResponse.json({ error: 'Fork message not found' }, { status: 404 });
  }

  // Messages up to (and including) fork point
  const forkedMessages: DBMessage[] = source.messages.slice(0, forkIdx + 1).map(m => ({
    ...m,
    id: `fork-${crypto.randomUUID()}`,
    conversationId: forkId,
  }));

  // Add a system note about the fork
  const forkNote: DBMessage = {
    id: `fork-note-${crypto.randomUUID()}`,
    conversationId: forkId,
    role: 'system',
    content: `[Forked from "${source.title}" at message ${forkIdx + 1}/${source.messages.length} on ${new Date().toLocaleDateString()}]`,
    timestamp: Date.now(),
  };

  dbSaveConversation({
    id: forkId,
    userId,
    title: newTitle,
    createdAt: now,
    updatedAt: now,
    context: preserveContext ? source.context : {
      files: [],
      people: [],
      topics: [],
      preferences: [],
      actions: [],
    },
    summary: `Forked from "${source.title}"`,
    messages: [forkNote, ...forkedMessages],
  });

  return NextResponse.json({
    forkId,
    title: newTitle,
    messageCount: forkedMessages.length,
  } as ForkResponse);
}
