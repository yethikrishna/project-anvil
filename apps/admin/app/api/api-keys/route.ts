/**
 * Admin API — API Key management.
 */

import {NextRequest, NextResponse} from 'next/server';
import {randomBytes, createHash} from 'crypto';

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  keyHash: string;       // SHA-256 hash for verification
  permissions: string[];
  status: 'active' | 'revoked';
  created: string;
  lastUsed: string;
  expiresAt?: string;
}

const apiKeys = new Map<string, ApiKeyRecord>();

// Seed
apiKeys.set('1', {
  id: '1', name: 'Production API', prefix: 'avk_prod_', keyHash: '...',
  permissions: ['drive.read', 'drive.write', 'docs.read', 'docs.write'],
  status: 'active', created: '2026-05-01', lastUsed: new Date().toISOString(),
});

export async function GET() {
  return NextResponse.json({
    keys: Array.from(apiKeys.values()).map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      permissions: k.permissions,
      status: k.status,
      created: k.created,
      lastUsed: k.lastUsed,
      expiresAt: k.expiresAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {name, permissions} = body;

  if (!name) return NextResponse.json({error: 'Name required'}, {status: 400});

  const rawKey = `avk_${randomBytes(24).toString('hex')}`;
  const prefix = rawKey.slice(0, 12) + '...';
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const record: ApiKeyRecord = {
    id: `key_${Date.now()}`,
    name,
    prefix,
    keyHash,
    permissions: permissions ?? [],
    status: 'active',
    created: new Date().toISOString(),
    lastUsed: '',
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
  };

  apiKeys.set(record.id, record);

  // Return the raw key only once
  return NextResponse.json({
    key: record,
    secret: rawKey,  // Only shown once!
    warning: 'Copy this key now. It will not be shown again.',
  }, {status: 201});
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) return NextResponse.json({error: 'Key id required'}, {status: 400});

  const key = apiKeys.get(id);
  if (!key) return NextResponse.json({error: 'Key not found'}, {status: 404});

  key.status = 'revoked';
  apiKeys.set(id, key);

  return NextResponse.json({success: true});
}
