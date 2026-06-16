/**
 * GET /api/channels/meilisearch-sync
 * Admin endpoint: sync all channel messages to Meilisearch for full-text search.
 *
 * Called on startup or manually to populate the search index.
 * In production, this would be driven by the EventBus (chat.message_sent → search.indexed).
 */

import { NextRequest, NextResponse } from 'next/server';

const MEILISEARCH_URL = process.env.MEILISEARCH_URL ?? 'http://localhost:7700';
const MEILISEARCH_KEY = process.env.MEILISEARCH_MASTER_KEY ?? process.env.MEILISEARCH_API_KEY ?? '';

interface MeilisearchDocument {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  createdAt: number;
  type: string;
}

async function ensureIndex() {
  const res = await fetch(`${MEILISEARCH_URL}/indexes/channel-messages`, {
    headers: MEILISEARCH_KEY ? { Authorization: `Bearer ${MEILISEARCH_KEY}` } : {},
  });

  if (res.status === 404) {
    // Create index
    await fetch(`${MEILISEARCH_URL}/indexes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MEILISEARCH_KEY ? { Authorization: `Bearer ${MEILISEARCH_KEY}` } : {}),
      },
      body: JSON.stringify({ uid: 'channel-messages', primaryKey: 'id' }),
    });

    // Configure searchable + filterable attributes
    await fetch(`${MEILISEARCH_URL}/indexes/channel-messages/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(MEILISEARCH_KEY ? { Authorization: `Bearer ${MEILISEARCH_KEY}` } : {}),
      },
      body: JSON.stringify({
        searchableAttributes: ['content', 'userId'],
        filterableAttributes: ['channelId', 'userId', 'type', 'createdAt'],
        sortableAttributes: ['createdAt'],
        rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
      }),
    });
  }
}

export async function searchMessages(
  query: string,
  channelId?: string,
  limit = 20,
): Promise<MeilisearchDocument[]> {
  try {
    await ensureIndex();

    const filter = channelId ? `channelId = "${channelId}"` : undefined;

    const res = await fetch(`${MEILISEARCH_URL}/indexes/channel-messages/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MEILISEARCH_KEY ? { Authorization: `Bearer ${MEILISEARCH_KEY}` } : {}),
      },
      body: JSON.stringify({
        q: query,
        limit,
        filter,
        sort: ['createdAt:desc'],
        highlightPreTag: '<mark>',
        highlightPostTag: '</mark>',
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.hits ?? [];
  } catch {
    return [];
  }
}

export async function indexMessage(msg: MeilisearchDocument): Promise<void> {
  try {
    await ensureIndex();
    await fetch(`${MEILISEARCH_URL}/indexes/channel-messages/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MEILISEARCH_KEY ? { Authorization: `Bearer ${MEILISEARCH_KEY}` } : {}),
      },
      body: JSON.stringify([msg]),
    });
  } catch {
    // Non-critical
  }
}

// API route handler
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const channelId = searchParams.get('channelId') ?? undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

  if (!q) {
    return NextResponse.json({ error: 'q required' }, { status: 400 });
  }

  const results = await searchMessages(q, channelId, limit);
  return NextResponse.json({ results, query: q, source: 'meilisearch' });
}
