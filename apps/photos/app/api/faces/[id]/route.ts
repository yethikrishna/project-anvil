/**
 * PATCH /api/faces/[id] — name a face cluster
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { faceClusters } from '@/lib/schema';
import { eq } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { name } = await req.json() as { name: string };
  await db.update(faceClusters).set({ name }).where(eq(faceClusters.id, id));
  return NextResponse.json({ ok: true });
}
