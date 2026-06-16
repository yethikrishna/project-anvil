/**
 * GET  /api/rooms           — list active rooms
 * POST /api/rooms           — create a room
 * GET  /api/rooms?id=xxx    — get room details + participants
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRoom, listRooms, getRoom } from '@/lib/rooms';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const room = getRoom(id);
    if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(room);
  }

  return NextResponse.json({ rooms: listRooms() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, userId = 'default', maxParticipants = 10 } = body as {
    name: string;
    userId?: string;
    maxParticipants?: number;
  };

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const room = createRoom(name, userId, maxParticipants);
  return NextResponse.json(room, { status: 201 });
}
