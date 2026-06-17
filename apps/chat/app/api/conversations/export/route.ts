/**
 * POST /api/conversations/export — Export a conversation to a file.
 *
 * Body: { conversationId: string, format: 'markdown' | 'json' | 'html' | 'text', userId?: string }
 * Returns: File download response with correct Content-Type + Content-Disposition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbGetConversation } from '@/lib/db';
import { exportConversation, type ExportFormat } from '@/lib/conversation-export';
import type { Conversation } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { conversationId, format = 'markdown', userId = 'default' } = await req.json() as {
    conversationId: string;
    format?: ExportFormat;
    userId?: string;
  };

  if (!conversationId) {
    return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
  }

  const conv = dbGetConversation(conversationId, userId);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { content, filename, mimeType } = exportConversation(conv as unknown as Conversation, format);

  return new NextResponse(content, {
    headers: {
      'Content-Type': `${mimeType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(content, 'utf-8')),
    },
  });
}
