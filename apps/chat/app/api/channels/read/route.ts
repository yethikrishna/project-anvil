/**
 * POST /api/channels/read — Mark channel as read up to a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbMarkRead } from '@/lib/channels-db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { channelId, userId = 'default', messageId } = body as {
    channelId: string;
    userId?: string;
    messageId: string;
  };

  if (!channelId || !messageId) {
    return NextResponse.json({ error: 'channelId and messageId required' }, { status: 400 });
  }

  dbMarkRead(channelId, userId, messageId);
  return NextResponse.json({ ok: true });
}
