/**
 * GET /api/channels/search?q=xxx&channelId=xxx&limit=20
 *
 * Tries Meilisearch for semantic full-text search.
 * Falls back to SQLite LIKE search if Meilisearch is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbSearchMessages } from '@/lib/channels-db';
import { searchMessages as meilisearchSearch } from '@/lib/meilisearch-channels';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const channelId = searchParams.get('channelId') ?? undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 });

  // Try Meilisearch first
  if (process.env.MEILISEARCH_URL) {
    try {
      const results = await meilisearchSearch(q, channelId, limit);
      if (results.length > 0 || q.length > 2) {
        return NextResponse.json({ results, query: q, source: 'meilisearch' });
      }
    } catch {
      // Fall through to SQLite
    }
  }

  // SQLite fallback
  const results = dbSearchMessages(q, channelId, limit);
  return NextResponse.json({ results, query: q, source: 'sqlite' });
}
