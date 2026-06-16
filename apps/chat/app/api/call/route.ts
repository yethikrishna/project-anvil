/**
 * POST /api/call/start  — initiate a call to another user
 * POST /api/call/end    — end the active call
 * GET  /api/call/status — get current call status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  startCall, endCall, getActiveCall, publishSignal,
} from '@/lib/call-signaling';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const call = getActiveCall(userId);
  return NextResponse.json({ call });
}
