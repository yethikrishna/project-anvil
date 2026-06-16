/**
 * GET    /api/albums       — list albums
 * POST   /api/albums       — create album
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { albums, albumPhotos, photos } from '@/lib/schema';
import { getPhotoUrl } from '@/lib/storage';
import { eq, desc, inArray } from 'drizzle-orm';

export async function GET(_req: NextRequest) {
  const userId = 'demo-user';

  const rows = await db
    .select()
    .from(albums)
    .where(eq(albums.userId, userId))
    .orderBy(desc(albums.updatedAt));

  // Get cover photo thumbnails
  const withCovers = await Promise.all(
    rows.map(async (a) => {
      let coverThumbnailUrl: string | undefined;
      if (a.coverPhotoId) {
        const [cover] = await db
          .select({ thumbnailKey: photos.thumbnailKey })
          .from(photos)
          .where(eq(photos.id, a.coverPhotoId));
        if (cover?.thumbnailKey) {
          coverThumbnailUrl = await getPhotoUrl(cover.thumbnailKey, 3600);
        }
      }
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        coverThumbnailUrl,
        photoCount: a.photoCount ?? 0,
        isShared: a.isShared ?? false,
        shareToken: a.shareToken,
        createdAt: a.createdAt.toISOString(),
      };
    }),
  );

  return NextResponse.json({ albums: withCovers });
}

export async function POST(req: NextRequest) {
  const userId = 'demo-user';
  const body = await req.json();
  const { title, photoIds } = body as { title: string; photoIds?: string[] };

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }

  const albumId = crypto.randomUUID();

  await db.insert(albums).values({
    id: albumId,
    userId,
    title: title.trim(),
    type: 'manual',
    photoCount: photoIds?.length ?? 0,
  });

  if (photoIds?.length) {
    await db.insert(albumPhotos).values(
      photoIds.map((photoId, i) => ({
        albumId,
        photoId,
        sortOrder: i,
      })),
    );
  }

  return NextResponse.json({
    id: albumId,
    title: title.trim(),
    type: 'manual',
    photoCount: photoIds?.length ?? 0,
    isShared: false,
    createdAt: new Date().toISOString(),
  }, { status: 201 });
}
