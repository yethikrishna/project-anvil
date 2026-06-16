/**
 * POST /api/albums/[id]/share — generate/return public share link
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { albums } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = 'demo-user';

  const [album] = await db
    .select()
    .from(albums)
    .where(and(eq(albums.id, id), eq(albums.userId, userId)));

  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let token = album.shareToken;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    await db
      .update(albums)
      .set({ shareToken: token, isShared: true, updatedAt: new Date() })
      .where(eq(albums.id, id));
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3011';
  return NextResponse.json({ shareUrl: `${origin}/shared/${token}` });
}
