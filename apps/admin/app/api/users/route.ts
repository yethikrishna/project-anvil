/**
 * Admin API — User management routes.
 * Real CRUD operations for organization users.
 */

import {NextRequest, NextResponse} from 'next/server';

interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'suspended' | 'invited';
  storageUsed: number;
  appsUsed: string[];
  lastActiveAt: string;
  createdAt: string;
  mfaEnabled: boolean;
  ssoLinked: boolean;
}

// In production: PostgreSQL with tenant-scoped queries
// SELECT * FROM ${schema}.users WHERE ...
const users = new Map<string, UserPayload>();

// Seed demo data
users.set('1', {
  id: '1', email: 'indu@anvil.dev', name: 'Indu', role: 'admin', status: 'active',
  storageUsed: 2400, appsUsed: ['Drive', 'Docs', 'Gmail', 'Calendar'],
  lastActiveAt: new Date().toISOString(), createdAt: '2026-01-01T00:00:00Z',
  mfaEnabled: true, ssoLinked: false,
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') ?? '';
  const role = url.searchParams.get('role') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const page = parseInt(url.searchParams.get('page') ?? '1');
  const limit = parseInt(url.searchParams.get('limit') ?? '50');

  let result = Array.from(users.values());

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (role) result = result.filter(u => u.role === role);
  if (status) result = result.filter(u => u.status === status);

  const total = result.length;
  const offset = (page - 1) * limit;
  result = result.slice(offset, offset + limit);

  return NextResponse.json({
    users: result,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {email, name, role} = body;

  if (!email || !name || !role) {
    return NextResponse.json({error: 'Missing required fields: email, name, role'}, {status: 400});
  }

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return NextResponse.json({error: 'Invalid role'}, {status: 400});
  }

  // Check for duplicate email
  for (const [, user] of users) {
    if (user.email === email) {
      return NextResponse.json({error: 'Email already exists'}, {status: 409});
    }
  }

  const id = `user_${Date.now()}`;
  const user: UserPayload = {
    id,
    email,
    name,
    role,
    status: 'invited',
    storageUsed: 0,
    appsUsed: [],
    lastActiveAt: '',
    createdAt: new Date().toISOString(),
    mfaEnabled: false,
    ssoLinked: false,
  };

  users.set(id, user);

  // In production: Send invite email via Stalwart SMTP
  // await sendInviteEmail(email, name);

  return NextResponse.json({user}, {status: 201});
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {id, ...updates} = body;

  if (!id) return NextResponse.json({error: 'Missing user id'}, {status: 400});

  const user = users.get(id);
  if (!user) return NextResponse.json({error: 'User not found'}, {status: 404});

  // Only allow updating safe fields
  const allowedFields = ['name', 'role', 'status'] as const;
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      (user as any)[field] = updates[field];
    }
  }

  users.set(id, user);

  return NextResponse.json({user});
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) return NextResponse.json({error: 'Missing user id'}, {status: 400});

  const user = users.get(id);
  if (!user) return NextResponse.json({error: 'User not found'}, {status: 404});

  // Soft delete: mark as suspended
  user.status = 'suspended';
  users.set(id, user);

  return NextResponse.json({success: true});
}
