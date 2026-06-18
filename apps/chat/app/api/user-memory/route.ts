/**
 * /api/user-memory — CRUD for user_remember/user_recall persistent facts.
 *
 * Actions:
 *   get    — retrieve all user memories (optionally filtered by category)
 *   set    — store or update a single memory
 *   delete — remove a memory by key
 *   clear  — delete all memories in a category
 *
 * These are the same records stored via the user_remember/user_recall AI tools.
 * Keys are stored as `user_memory:<category>:<key>` in the preferences table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbSetPreference, dbGetPreferences, dbDeletePreference } from '@/lib/db';

export const runtime = 'nodejs';

const USER_MEMORY_PREFIX = 'user_memory:';

type Action = 'get' | 'set' | 'delete' | 'clear';

interface RequestBody {
  action: Action;
  userId?: string;
  key?: string;
  value?: string;
  category?: string;
}

interface MemoryRecord {
  key: string;
  value: string;
  category: string;
  fullKey: string;
}

function parseMemoryKey(fullKey: string): { category: string; key: string } | null {
  if (!fullKey.startsWith(USER_MEMORY_PREFIX)) return null;
  const rest = fullKey.slice(USER_MEMORY_PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx < 0) return { category: 'general', key: rest };
  return {
    category: rest.slice(0, colonIdx),
    key: rest.slice(colonIdx + 1),
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as RequestBody;
  const userId = body.userId ?? 'default';
  const action = body.action;

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'get': {
        const prefs = dbGetPreferences(userId);
        const memories: MemoryRecord[] = [];
        for (const [fullKey, value] of Object.entries(prefs)) {
          const parsed = parseMemoryKey(fullKey);
          if (!parsed) continue;
          if (body.category && body.category !== 'all' && parsed.category !== body.category) continue;
          memories.push({
            key: parsed.key,
            value: String(value),
            category: parsed.category,
            fullKey,
          });
        }
        memories.sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
        return NextResponse.json({ memories, count: memories.length });
      }

      case 'set': {
        const { key, value, category = 'fact' } = body;
        if (!key || value === undefined) {
          return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
        }
        const fullKey = `${USER_MEMORY_PREFIX}${category}:${key}`;
        dbSetPreference(userId, fullKey, value);
        return NextResponse.json({ success: true, key, value, category });
      }

      case 'delete': {
        const { key, category = 'fact' } = body;
        if (!key) {
          return NextResponse.json({ error: 'Missing key' }, { status: 400 });
        }
        const fullKey = `${USER_MEMORY_PREFIX}${category}:${key}`;
        dbDeletePreference(userId, fullKey);
        return NextResponse.json({ success: true, key, category });
      }

      case 'clear': {
        const { category } = body;
        const prefs = dbGetPreferences(userId);
        let deleted = 0;
        for (const fullKey of Object.keys(prefs)) {
          const parsed = parseMemoryKey(fullKey);
          if (!parsed) continue;
          if (!category || category === 'all' || parsed.category === category) {
            dbDeletePreference(userId, fullKey);
            deleted++;
          }
        }
        return NextResponse.json({ success: true, deleted, category: category ?? 'all' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[user-memory]', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Internal server error',
    }, { status: 500 });
  }
}

// GET convenience: /api/user-memory?userId=default&category=all
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? 'default';
  const category = searchParams.get('category') ?? 'all';

  try {
    const prefs = dbGetPreferences(userId);
    const memories: MemoryRecord[] = [];
    for (const [fullKey, value] of Object.entries(prefs)) {
      const parsed = parseMemoryKey(fullKey);
      if (!parsed) continue;
      if (category !== 'all' && parsed.category !== category) continue;
      memories.push({
        key: parsed.key,
        value: String(value),
        category: parsed.category,
        fullKey,
      });
    }
    memories.sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
    return NextResponse.json({ memories, count: memories.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
