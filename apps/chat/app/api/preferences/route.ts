/**
 * GET /api/preferences?userId=<id>  — fetch user preferences from DB
 * POST /api/preferences              — set a preference key/value
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbGetPreferences, dbSetPreference } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') ?? 'default';
  try {
    const prefs = dbGetPreferences(userId);
    return NextResponse.json(prefs ?? {});
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  const { userId = 'default', key, value } = await req.json() as { userId?: string; key: string; value: string };
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  try {
    dbSetPreference(userId, key, value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
