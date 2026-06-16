/**
 * GET /api/photos — list photos with pagination and filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { photos } from '@/lib/schema';
import { getPhotoUrl } from '@/lib/storage';
import { and, eq, ilike, desc, asc, sql, gte, lte } from 'drizzle-orm';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get('page') ?? 0);
    const pageSize = Math.min(Number(sp.get('pageSize') ?? PAGE_SIZE), 200);
    const view = sp.get('view') ?? 'all';
    const albumId = sp.get('albumId');
    const query = sp.get('query');
    const sceneType = sp.get('sceneType');
    const year = sp.get('year') ? Number(sp.get('year')) : undefined;
    const month = sp.get('month') ? Number(sp.get('month')) : undefined;

    // TODO: extract userId from session token
    const userId = sp.get('userId') ?? 'demo-user';

    const conditions = [
      eq(photos.userId, userId),
      eq(photos.isDeleted, false),
    ];

    if (view === 'favourites') conditions.push(eq(photos.isFavourite, true));
    if (view === 'archive') conditions.push(eq(photos.isArchived, true));
    if (view === 'all') conditions.push(eq(photos.isArchived, false));

    if (query) {
      conditions.push(
        sql`(${photos.originalName} ILIKE ${'%' + query + '%'} 
          OR ${photos.description} ILIKE ${'%' + query + '%'}
          OR ${photos.locationName} ILIKE ${'%' + query + '%'}
          OR ${photos.aiTags}::text ILIKE ${'%' + query + '%'})`
      );
    }

    if (sceneType) conditions.push(eq(photos.sceneType, sceneType));

    if (year) {
      conditions.push(gte(photos.takenAt, new Date(year, 0, 1)));
      conditions.push(lte(photos.takenAt, new Date(year, 11, 31, 23, 59, 59)));
    }
    if (month && year) {
      conditions.push(gte(photos.takenAt, new Date(year, month - 1, 1)));
      conditions.push(lte(photos.takenAt, new Date(year, month, 0, 23, 59, 59)));
    }

    let rows;
    if (albumId) {
      // JOIN with album_photos
      rows = await db.execute(sql`
        SELECT p.* FROM photos p
        JOIN album_photos ap ON ap.photo_id = p.id
        WHERE ap.album_id = ${albumId}
          AND p.user_id = ${userId}
          AND p.is_deleted = false
        ORDER BY ap.sort_order ASC, p.taken_at DESC
        LIMIT ${pageSize} OFFSET ${page * pageSize}
      `);
    } else {
      rows = await db
        .select()
        .from(photos)
        .where(and(...conditions))
        .orderBy(desc(photos.takenAt), desc(photos.createdAt))
        .limit(pageSize)
        .offset(page * pageSize);
    }

    // Count query
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(photos)
      .where(and(...conditions));

    // Generate signed URLs for thumbnails
    const withUrls = await Promise.all(
      (rows as typeof photos.$inferSelect[]).map(async (p) => ({
        id: p.id,
        filename: p.filename,
        mimeType: p.mimeType,
        width: p.width,
        height: p.height,
        thumbnailUrl: p.thumbnailKey ? await getPhotoUrl(p.thumbnailKey, 3600) : undefined,
        takenAt: p.takenAt?.toISOString(),
        camera: p.camera,
        lat: p.lat,
        lng: p.lng,
        locationName: p.locationName,
        aiTags: (p.aiTags as string[]) ?? [],
        description: p.description,
        sceneType: p.sceneType,
        isFavourite: p.isFavourite,
        isArchived: p.isArchived,
        createdAt: p.createdAt.toISOString(),
      })),
    );

    return NextResponse.json({
      photos: withUrls,
      total: count,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[photos/GET]', err);
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }
}
