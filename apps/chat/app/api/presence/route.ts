/**
 * GET  /api/presence         — List online users
 * POST /api/presence         — Update own status
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbSetPresence, dbGetPresence } from '@/lib/channels-db';
import { presenceBroadcast } from '@/lib/presence-bus';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get('ids');
  const userIds = ids ? ids.split(',').filter(Boolean) : undefined;

  const presence = dbGetPresence(userIds);
  return NextResponse.json({ presence });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId = 'default', status, displayName, avatarUrl } = body as {
    userId?: string;
    status: 'online' | 'away' | 'offline';
    displayName?: string;
    avatarUrl?: string;
  };

  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 });

  dbSetPresence(userId, status, displayName, avatarUrl);
  presenceBroadcast({ type: 'presence', userId, status, lastSeen: Date.now() });

  return NextResponse.json({ ok: true });
}
