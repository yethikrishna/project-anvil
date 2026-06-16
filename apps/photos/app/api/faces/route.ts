/**
 * GET /api/faces — list face clusters (people)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { faceClusters } from '@/lib/schema';
import { getPhotoUrl } from '@/lib/storage';
import { eq, desc } from 'drizzle-orm';

export async function GET(_req: NextRequest) {
  const userId = 'demo-user';

  const rows = await db
    .select()
    .from(faceClusters)
    .where(eq(faceClusters.userId, userId))
    .orderBy(desc(faceClusters.faceCount));

  const withUrls = await Promise.all(
    rows.map(async (f) => ({
      id: f.id,
      name: f.name,
      faceCount: f.faceCount ?? 0,
      coverFaceUrl: f.coverFaceKey
        ? await getPhotoUrl(f.coverFaceKey, 3600)
        : undefined,
    })),
  );

  return NextResponse.json({ faces: withUrls });
}
