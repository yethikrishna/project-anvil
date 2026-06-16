/**
 * DELETE /api/albums/[id]      — delete album
 * GET    /api/albums/[id]      — album detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { albums } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = 'demo-user';
  await db.delete(albums).where(and(eq(albums.id, id), eq(albums.userId, userId)));
  return NextResponse.json({ ok: true });
}
