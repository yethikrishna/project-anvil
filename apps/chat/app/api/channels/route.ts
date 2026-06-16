/**
 * GET/POST/PUT/DELETE /api/channels
 *
 * GET    /api/channels              — List all channels with unread counts
 * POST   /api/channels              — Create a new channel
 * GET    /api/channels?id=xxx       — Get channel details
 * DELETE /api/channels?id=xxx       — Archive a channel
 *
 * GET    /api/channels/messages?channelId=xxx&before=ts&limit=50  — Paginated messages
 * POST   /api/channels/messages     — Post a message
 * PUT    /api/channels/messages     — Edit a message
 * DELETE /api/channels/messages?id=xxx — Delete a message (soft)
 *
 * POST   /api/channels/reactions    — Toggle reaction
 * POST   /api/channels/read         — Mark channel as read
 * GET    /api/channels/search?q=xxx — Search messages
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dbListChannels, dbGetChannel, dbCreateChannel,
  initChannelSchema,
} from '@/lib/channels-db';

// Ensure schema on first import
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

function ensureSchema() {
  const dir = path.join(os.homedir(), '.anvil');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'chat.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initChannelSchema(db);
  db.close();
}

export async function GET(req: NextRequest) {
  ensureSchema();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = searchParams.get('userId') ?? 'default';

  if (id) {
    const channel = dbGetChannel(id);
    if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(channel);
  }

  const channels = dbListChannels(userId);
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, type = 'public', userId = 'default' } = body as {
    name: string;
    description?: string;
    type?: 'public' | 'private';
    userId?: string;
  };

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const channel = dbCreateChannel({
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
    description,
    type,
    createdBy: userId,
    createdAt: Date.now(),
    isArchived: false,
  });

  return NextResponse.json(channel, { status: 201 });
}
