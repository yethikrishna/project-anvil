/**
 * GET    /api/boards/[id] — load board
 * PATCH  /api/boards/[id] — save board state
 * DELETE /api/boards/[id] — delete board
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { boards } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };
const userId = 'demo-user';

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, id), eq(boards.userId, userId)));

  if (!board) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(board);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if ('elements' in body) update.elements = body.elements;
  if ('appState' in body) update.appState = body.appState;
  if ('title' in body) update.title = body.title;
  if ('thumbnail' in body) update.thumbnail = body.thumbnail;
  if ('isPublic' in body) update.isPublic = body.isPublic;

  await db
    .update(boards)
    .set(update)
    .where(and(eq(boards.id, id), eq(boards.userId, userId)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(boards).where(and(eq(boards.id, id), eq(boards.userId, userId)));
  return NextResponse.json({ ok: true });
}
