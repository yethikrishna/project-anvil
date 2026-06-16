/**
 * POST /api/albums/[id]/photos — add photos to album
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { albumPhotos, albums } from '@/lib/schema';
import { eq, and, sql } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: albumId } = await params;
  const { photoIds } = await req.json() as { photoIds: string[] };

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return NextResponse.json({ error: 'photoIds required' }, { status: 400 });
  }

  // Get current count for sort ordering
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(albumPhotos)
    .where(eq(albumPhotos.albumId, albumId));

  await db.insert(albumPhotos)
    .values(photoIds.map((photoId, i) => ({
      albumId,
      photoId,
      sortOrder: count + i,
    })))
    .onConflictDoNothing();

  // Update photo count
  await db.execute(sql`
    UPDATE albums SET photo_count = (
      SELECT COUNT(*) FROM album_photos WHERE album_id = ${albumId}
    ), updated_at = NOW()
    WHERE id = ${albumId}
  `);

  return NextResponse.json({ ok: true, added: photoIds.length });
}
