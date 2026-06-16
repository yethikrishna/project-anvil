/**
 * GET /api/stats — storage and usage statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { photos, photoDuplicates } from '@/lib/schema';
import { eq, and, sql, count } from 'drizzle-orm';

export async function GET(_req: NextRequest) {
  const userId = 'demo-user';

  const [totals] = await db
    .select({
      totalPhotos: sql<number>`COUNT(*)::int`,
      totalSizeBytes: sql<number>`SUM(size_bytes)::bigint`,
    })
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.isDeleted, false)));

  const photosByMonth = await db.execute(sql`
    SELECT
      EXTRACT(YEAR FROM taken_at)::int AS year,
      EXTRACT(MONTH FROM taken_at)::int AS month,
      COUNT(*)::int AS count
    FROM photos
    WHERE user_id = ${userId}
      AND is_deleted = false
      AND taken_at IS NOT NULL
    GROUP BY year, month
    ORDER BY year DESC, month DESC
    LIMIT 24
  `);

  const topTags = await db.execute(sql`
    SELECT tag, COUNT(*)::int AS count
    FROM (
      SELECT jsonb_array_elements_text(ai_tags) AS tag
      FROM photos
      WHERE user_id = ${userId} AND is_deleted = false
    ) t
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 20
  `);

  const topLocations = await db.execute(sql`
    SELECT location_name AS location, COUNT(*)::int AS count
    FROM photos
    WHERE user_id = ${userId}
      AND is_deleted = false
      AND location_name IS NOT NULL
    GROUP BY location_name
    ORDER BY count DESC
    LIMIT 10
  `);

  const [{ duplicateCount }] = await db
    .select({ duplicateCount: sql<number>`COUNT(DISTINCT photo_a_id)::int` })
    .from(photoDuplicates);

  return NextResponse.json({
    totalPhotos: totals.totalPhotos ?? 0,
    totalSizeBytes: Number(totals.totalSizeBytes ?? 0),
    photosByMonth: photosByMonth.rows,
    topTags: topTags.rows,
    topLocations: topLocations.rows,
    duplicateCount: duplicateCount ?? 0,
  });
}
