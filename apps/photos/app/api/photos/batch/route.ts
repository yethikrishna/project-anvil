/**
 * PATCH  /api/photos/batch — bulk archive/favourite
 * DELETE /api/photos/batch — bulk soft-delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { photos } from '@/lib/schema';
import { eq, inArray, and } from 'drizzle-orm';

const userId = 'demo-user';

export async function PATCH(req: NextRequest) {
  const { ids, action } = await req.json() as { ids: string[]; action: string };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }

  const updateMap: Record<string, unknown> = { updatedAt: new Date() };
  if (action === 'archive') updateMap.isArchived = true;
  else if (action === 'unarchive') updateMap.isArchived = false;
  else if (action === 'favourite') updateMap.isFavourite = true;
  else if (action === 'unfavourite') updateMap.isFavourite = false;
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  await db
    .update(photos)
    .set(updateMap)
    .where(and(eq(photos.userId, userId), inArray(photos.id, ids)));

  return NextResponse.json({ ok: true, updated: ids.length });
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }

  await db
    .update(photos)
    .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(photos.userId, userId), inArray(photos.id, ids)));

  return NextResponse.json({ ok: true, deleted: ids.length });
}
