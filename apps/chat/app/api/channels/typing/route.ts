/**
 * POST /api/channels/typing — Send typing indicator
 * GET  /api/presence         — Get user presence list
 * POST /api/presence         — Update own presence
 */

import { NextRequest, NextResponse } from 'next/server';
import { setTyping } from '@/lib/presence-bus';
import { dbSetPresence, dbGetPresence } from '@/lib/channels-db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { channelId, userId = 'default', isTyping = true } = body as {
    channelId: string;
    userId?: string;
    isTyping?: boolean;
  };

  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

  setTyping(channelId, userId, isTyping);
  return NextResponse.json({ ok: true });
}
