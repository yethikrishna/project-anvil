/**
 * GET  /api/boards     — list boards for user
 * POST /api/boards     — create board
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { boards } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { getTemplate } from '@/lib/templates';

export async function GET(_req: NextRequest) {
  const userId = 'demo-user';
  const rows = await db
    .select({
      id: boards.id,
      title: boards.title,
      template: boards.template,
      thumbnail: boards.thumbnail,
      isPublic: boards.isPublic,
      collaborators: boards.collaborators,
      createdAt: boards.createdAt,
      updatedAt: boards.updatedAt,
    })
    .from(boards)
    .where(eq(boards.userId, userId))
    .orderBy(desc(boards.updatedAt));

  return NextResponse.json({ boards: rows });
}

export async function POST(req: NextRequest) {
  const userId = 'demo-user';
  const body = await req.json().catch(() => ({}));
  const { title = 'Untitled', template = 'blank' } = body as {
    title?: string;
    template?: string;
  };

  const id = crypto.randomUUID();
  const tpl = getTemplate(template as never);

  await db.insert(boards).values({
    id,
    userId,
    title,
    template,
    elements: tpl.elements,
    appState: {},
  });

  return NextResponse.json({ id, title, template, elements: tpl.elements }, { status: 201 });
}
