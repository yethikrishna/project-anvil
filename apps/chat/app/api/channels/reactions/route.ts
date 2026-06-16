/**
 * POST /api/channels/reactions — Toggle emoji reaction on a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbToggleReaction } from '@/lib/channels-db';
import { presenceBroadcast } from '@/lib/presence-bus';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messageId, userId = 'default', emoji } = body as {
    messageId: string;
    userId?: string;
    emoji: string;
  };

  if (!messageId || !emoji) {
    return NextResponse.json({ error: 'messageId and emoji required' }, { status: 400 });
  }

  const reactions = dbToggleReaction(messageId, userId, emoji);
  presenceBroadcast({ type: 'reaction', messageId, reactions });

  return NextResponse.json({ reactions });
}
