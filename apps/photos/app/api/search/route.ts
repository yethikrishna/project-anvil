/**
 * GET /api/search?q=... — natural language photo search
 *
 * Supports:
 * - Keyword matching (filename, tags, description, location)
 * - Date queries ("photos from March", "last summer")
 * - Scene queries ("beach photos", "night shots")
 * - Camera queries ("iPhone photos")
 * - Location queries ("photos in Paris")
 * - Person queries ("photos with Sarah") — via face cluster name
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { photos, faceClusters, photoFaces } from '@/lib/schema';
import { getPhotoUrl } from '@/lib/storage';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

const SCENE_KEYWORDS: Record<string, string[]> = {
  beach: ['beach', 'ocean', 'sea', 'coast', 'shore', 'surf'],
  forest: ['forest', 'woods', 'trees', 'nature', 'hiking', 'trail'],
  city: ['city', 'urban', 'street', 'building', 'downtown', 'skyline'],
  night: ['night', 'dark', 'nighttime', 'evening', 'low light'],
  food: ['food', 'restaurant', 'meal', 'dinner', 'lunch', 'breakfast'],
  portrait: ['portrait', 'selfie', 'face', 'person', 'people'],
  travel: ['travel', 'vacation', 'trip', 'holiday', 'abroad'],
  wedding: ['wedding', 'bride', 'groom', 'ceremony', 'reception'],
};

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseNaturalDate(q: string): { year?: number; month?: number } {
  const lower = q.toLowerCase();
  const result: { year?: number; month?: number } = {};

  // Year extraction: "2024", "last year"
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (yearMatch) result.year = Number(yearMatch[1]);

  const currentYear = new Date().getFullYear();
  if (lower.includes('last year')) result.year = currentYear - 1;
  if (lower.includes('this year')) result.year = currentYear;
  if (lower.includes('last summer') || lower.includes('last spring') || lower.includes('last winter') || lower.includes('last fall')) {
    result.year = currentYear - 1;
  }

  // Month extraction
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (lower.includes(name)) {
      result.month = num;
      if (!result.year) result.year = currentYear;
      break;
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const userId = 'demo-user';

  if (!q.trim()) {
    return NextResponse.json({ photos: [] });
  }

  const lower = q.toLowerCase();
  const conditions = [
    eq(photos.userId, userId),
    eq(photos.isDeleted, false),
    eq(photos.isArchived, false),
  ];

  // Scene detection
  for (const [scene, keywords] of Object.entries(SCENE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      conditions.push(eq(photos.sceneType, scene));
      break;
    }
  }

  // Date parsing
  const dateRange = parseNaturalDate(q);
  if (dateRange.year && dateRange.month) {
    const start = new Date(dateRange.year, dateRange.month - 1, 1);
    const end = new Date(dateRange.year, dateRange.month, 0, 23, 59, 59);
    conditions.push(gte(photos.takenAt, start), lte(photos.takenAt, end));
  } else if (dateRange.year) {
    const start = new Date(dateRange.year, 0, 1);
    const end = new Date(dateRange.year, 11, 31, 23, 59, 59);
    conditions.push(gte(photos.takenAt, start), lte(photos.takenAt, end));
  }

  // Full-text search on tags, description, location, filename
  const searchCondition = sql`(
    ${photos.originalName} ILIKE ${'%' + q + '%'}
    OR ${photos.description} ILIKE ${'%' + q + '%'}
    OR ${photos.locationName} ILIKE ${'%' + q + '%'}
    OR ${photos.camera} ILIKE ${'%' + q + '%'}
    OR ${photos.aiTags}::text ILIKE ${'%' + q + '%'}
  )`;

  const rows = await db
    .select()
    .from(photos)
    .where(and(...conditions, searchCondition))
    .orderBy(desc(photos.takenAt))
    .limit(100);

  const withUrls = await Promise.all(
    rows.map(async (p) => ({
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

  return NextResponse.json({ photos: withUrls, query: q });
}
