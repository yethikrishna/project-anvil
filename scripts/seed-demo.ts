#!/usr/bin/env tsx
/**
 * seed-demo.ts — Zero-config demo seed for Project Anvil
 *
 * Idempotent: safe to run multiple times.
 * Waits for all services to be healthy before seeding.
 *
 * Usage:
 *   pnpm seed:demo
 *   OR from docker: node /scripts/seed-demo.js
 *
 * Services configured:
 *   - Keycloak: demo realm + demo user
 *   - Postgres: demo rows in drive_db, docs_db, gmail_db
 *   - Meilisearch: anvil-search index + sample documents
 *   - MinIO: anvil-demo bucket + placeholder object
 */

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? 'http://keycloak:8080';
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN ?? 'admin';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin';
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://anvil:anvil_secret@postgres:5432';
const MEILISEARCH_URL = process.env.MEILISEARCH_URL ?? 'http://meilisearch:7700';
const MEILISEARCH_KEY = process.env.MEILI_MASTER_KEY ?? 'anvil_meili_secret';
const MINIO_URL = process.env.MINIO_URL ?? 'http://minio:9000';
const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER ?? 'anvil_minio';
const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD ?? 'anvil_minio_secret';

const DEMO_USER = {
  username: 'demo',
  email: 'demo@anvil.local',
  password: 'demo1234',
  firstName: 'Demo',
  lastName: 'User',
};

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ───

async function waitFor(name: string, check: () => Promise<boolean>, maxMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  let delay = 1000;
  while (Date.now() < deadline) {
    try {
      if (await check()) {
        console.log(`  ✓ ${name} ready`);
        return;
      }
    } catch { /* keep waiting */ }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 8000);
  }
  throw new Error(`Timeout waiting for ${name}`);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchJson<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${opts.method ?? 'GET'} ${url} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as T;
}

// ─── Keycloak ───

async function seedKeycloak() {
  console.log('\n[Keycloak] Seeding...');

  // Get admin token
  const tokenRes = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }),
  });
  if (!tokenRes.ok) throw new Error('Keycloak admin token failed');
  const { access_token: token } = await tokenRes.json() as { access_token: string };

  const adminHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Create/check anvil realm
  const realmsRes = await fetch(`${KEYCLOAK_URL}/admin/realms`, { headers: adminHeaders });
  const realms = await realmsRes.json() as Array<{ realm: string }>;
  const realmExists = realms.some((r) => r.realm === 'anvil');

  if (!realmExists) {
    const res = await fetch(`${KEYCLOAK_URL}/admin/realms`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        realm: 'anvil',
        displayName: 'Project Anvil',
        enabled: true,
        registrationAllowed: false,
        loginWithEmailAllowed: true,
        duplicateEmailsAllowed: false,
        resetPasswordAllowed: true,
        editUsernameAllowed: false,
        bruteForceProtected: true,
      }),
    });
    if (!res.ok && res.status !== 409) throw new Error(`Create realm: ${res.status}`);
    console.log('  ✓ Created realm: anvil');
  } else {
    console.log('  - Realm anvil already exists');
  }

  // Re-auth for anvil realm operations (still use master admin)
  // Check if demo user exists
  const usersRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/anvil/users?username=${DEMO_USER.username}&exact=true`,
    { headers: adminHeaders }
  );
  const users = await usersRes.json() as Array<{ id: string }>;

  if (users.length === 0) {
    const createRes = await fetch(`${KEYCLOAK_URL}/admin/realms/anvil/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        username: DEMO_USER.username,
        email: DEMO_USER.email,
        firstName: DEMO_USER.firstName,
        lastName: DEMO_USER.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: DEMO_USER.password, temporary: false }],
      }),
    });
    if (!createRes.ok && createRes.status !== 409) throw new Error(`Create user: ${createRes.status}`);
    console.log(`  ✓ Created demo user: ${DEMO_USER.email} / ${DEMO_USER.password}`);
  } else {
    console.log(`  - Demo user already exists: ${DEMO_USER.email}`);
  }

  // Create anvil-web client if missing
  const clientsRes = await fetch(
    `${KEYCLOAK_URL}/admin/realms/anvil/clients?clientId=anvil-web&search=true`,
    { headers: adminHeaders }
  );
  const clients = await clientsRes.json() as Array<{ clientId: string }>;
  if (!clients.some((c) => c.clientId === 'anvil-web')) {
    await fetch(`${KEYCLOAK_URL}/admin/realms/anvil/clients`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        clientId: 'anvil-web',
        name: 'Anvil Web',
        publicClient: true,
        standardFlowEnabled: true,
        directAccessGrantsEnabled: true,
        redirectUris: ['http://localhost:*/*', 'http://127.0.0.1:*/*'],
        webOrigins: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002',
                     'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'],
      }),
    });
    console.log('  ✓ Created Keycloak client: anvil-web');
  } else {
    console.log('  - Client anvil-web already exists');
  }

  console.log('[Keycloak] Done');
}

// ─── Postgres ───

async function seedPostgres() {
  console.log('\n[Postgres] Seeding...');

  // Use node-postgres via dynamic import (available in Node 18+)
  // We use a simple fetch-based approach instead to avoid extra deps:
  // Actually seed via psql shell commands launched as child processes
  const { execSync } = await import('child_process');

  const run = (db: string, sql: string) => {
    execSync(`psql "${POSTGRES_URL}/${db}" -c "${sql.replace(/"/g, '\\"')}"`, {
      stdio: 'pipe',
      env: { ...process.env, PGPASSWORD: 'anvil_secret' },
    });
  };

  // drive_db: demo folders and files
  try {
    run('drive_db', `
      INSERT INTO files (id, user_id, name, path, mime_type, size, is_directory)
      VALUES
        ('10000000-0000-0000-0000-000000000001', '${DEMO_USER_ID}', 'My Drive',    'root',           'inode/directory', 0, true),
        ('10000000-0000-0000-0000-000000000002', '${DEMO_USER_ID}', 'Documents',   'root.documents', 'inode/directory', 0, true),
        ('10000000-0000-0000-0000-000000000003', '${DEMO_USER_ID}', 'Images',      'root.images',    'inode/directory', 0, true),
        ('10000000-0000-0000-0000-000000000004', '${DEMO_USER_ID}', 'README.txt',  'root.readme',    'text/plain',      1024, false),
        ('10000000-0000-0000-0000-000000000005', '${DEMO_USER_ID}', 'Notes.docx',  'root.documents.notes', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 20480, false)
      ON CONFLICT (id) DO NOTHING
    `.replace(/\n\s+/g, ' ').trim());
    console.log('  ✓ drive_db: demo files inserted');
  } catch (e) {
    console.warn('  ! drive_db seed skipped (may need ltree extension):', (e as Error).message.split('\n')[0]);
  }

  // docs_db: demo documents
  try {
    run('docs_db', `
      INSERT INTO documents (id, user_id, title, version)
      VALUES
        ('20000000-0000-0000-0000-000000000001', '${DEMO_USER_ID}', 'Welcome to Anvil Docs', 1),
        ('20000000-0000-0000-0000-000000000002', '${DEMO_USER_ID}', 'Project Roadmap Q3 2026', 1),
        ('20000000-0000-0000-0000-000000000003', '${DEMO_USER_ID}', 'Architecture Notes', 1)
      ON CONFLICT (id) DO NOTHING
    `.replace(/\n\s+/g, ' ').trim());
    console.log('  ✓ docs_db: demo documents inserted');
  } catch (e) {
    console.warn('  ! docs_db seed error:', (e as Error).message.split('\n')[0]);
  }

  // gmail_db: demo emails
  try {
    run('gmail_db', `
      INSERT INTO mail_metadata (id, user_id, message_id, thread_id, from_addr, to_addrs, subject, labels, read, date)
      VALUES
        ('30000000-0000-0000-0000-000000000001', '${DEMO_USER_ID}', 'msg-001', 'thread-001', 'team@anvil.local', ARRAY['${DEMO_USER.email}'], 'Welcome to Project Anvil!', ARRAY['INBOX'], false, NOW() - INTERVAL '1 day'),
        ('30000000-0000-0000-0000-000000000002', '${DEMO_USER_ID}', 'msg-002', 'thread-002', 'noreply@github.com', ARRAY['${DEMO_USER.email}'], '[anvil] New commit: feat(P1-4): MapLibre PMTiles', ARRAY['INBOX'], true,  NOW() - INTERVAL '2 hours'),
        ('30000000-0000-0000-0000-000000000003', '${DEMO_USER_ID}', 'msg-003', 'thread-001', '${DEMO_USER.email}', ARRAY['team@anvil.local'], 'Re: Welcome to Project Anvil!', ARRAY['SENT'], true, NOW() - INTERVAL '23 hours')
      ON CONFLICT (message_id) DO NOTHING
    `.replace(/\n\s+/g, ' ').trim());
    console.log('  ✓ gmail_db: demo emails inserted');
  } catch (e) {
    console.warn('  ! gmail_db seed error:', (e as Error).message.split('\n')[0]);
  }

  console.log('[Postgres] Done');
}

// ─── Meilisearch ───

async function seedMeilisearch() {
  console.log('\n[Meilisearch] Seeding...');

  const headers = {
    Authorization: `Bearer ${MEILISEARCH_KEY}`,
    'Content-Type': 'application/json',
  };

  // Create index (idempotent)
  await fetch(`${MEILISEARCH_URL}/indexes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ uid: 'anvil-search', primaryKey: 'id' }),
  });

  // Configure filterable + sortable attributes
  await fetch(`${MEILISEARCH_URL}/indexes/anvil-search/settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      filterableAttributes: ['type', 'app', 'userId'],
      sortableAttributes: ['date', 'title'],
      searchableAttributes: ['title', 'content', 'tags'],
    }),
  });

  // Add demo documents
  const docs = [
    { id: 'doc-drive-1',   type: 'file',     app: 'drive',  userId: DEMO_USER_ID, title: 'README.txt',               content: 'Welcome to Project Anvil. This is a demo file.',           date: Date.now() - 86400000 },
    { id: 'doc-drive-2',   type: 'file',     app: 'drive',  userId: DEMO_USER_ID, title: 'Notes.docx',               content: 'Architecture decisions and implementation notes.',           date: Date.now() - 3600000 },
    { id: 'doc-docs-1',    type: 'document', app: 'docs',   userId: DEMO_USER_ID, title: 'Welcome to Anvil Docs',    content: 'Real-time collaborative editing powered by Yjs + Tiptap 3.', date: Date.now() - 7200000 },
    { id: 'doc-docs-2',    type: 'document', app: 'docs',   userId: DEMO_USER_ID, title: 'Project Roadmap Q3 2026',  content: 'P0: Offline layer. P1: Docker demo. P2: JMAP PIM client.',   date: Date.now() - 900000 },
    { id: 'doc-gmail-1',   type: 'email',    app: 'gmail',  userId: DEMO_USER_ID, title: 'Welcome to Project Anvil!', content: 'Thanks for joining the demo. Explore Drive, Docs, Maps.', date: Date.now() - 86400000 },
    { id: 'doc-web-1',     type: 'webpage',  app: 'search', userId: DEMO_USER_ID, title: 'MapLibre GL JS - Maps SDK', content: 'Open-source maps SDK for the web.',                         tags: ['maps', 'webgl', 'open-source'], date: Date.now() - 604800000 },
    { id: 'doc-web-2',     type: 'webpage',  app: 'search', userId: DEMO_USER_ID, title: 'PMTiles — Protomaps',       content: 'Single-file archive format for tile pyramids. Host on R2.', tags: ['maps', 'pmtiles', 'r2'], date: Date.now() - 86400000 },
  ];

  const addRes = await fetch(`${MEILISEARCH_URL}/indexes/anvil-search/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(docs),
  });

  if (addRes.ok) {
    console.log(`  ✓ Meilisearch: added ${docs.length} demo documents to anvil-search`);
  } else {
    const err = await addRes.text();
    console.warn('  ! Meilisearch add failed:', err.slice(0, 100));
  }

  console.log('[Meilisearch] Done');
}

// ─── MinIO ───

async function seedMinio() {
  console.log('\n[MinIO] Seeding...');

  // Use MinIO's S3 API to create the demo bucket
  // We'll use the mc (MinIO Client) command if available, otherwise raw S3 PUT
  const { execSync } = await import('child_process');

  try {
    // Configure mc alias and create bucket
    execSync(
      `mc alias set anvil ${MINIO_URL} ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} --quiet && ` +
      `mc mb anvil/anvil-demo --ignore-existing --quiet && ` +
      `mc mb anvil/anvil-uploads --ignore-existing --quiet`,
      { stdio: 'pipe', shell: '/bin/sh' }
    );
    console.log('  ✓ MinIO: buckets anvil-demo + anvil-uploads created');

    // Upload a placeholder welcome object
    const tmpFile = '/tmp/anvil-demo-welcome.txt';
    const { writeFileSync } = await import('fs');
    writeFileSync(tmpFile,
      'Welcome to Project Anvil object storage!\n' +
      'This file was seeded automatically by scripts/seed-demo.ts\n' +
      `Seeded at: ${new Date().toISOString()}\n`
    );
    execSync(`mc cp ${tmpFile} anvil/anvil-demo/welcome.txt --quiet`, { stdio: 'pipe', shell: '/bin/sh' });
    console.log('  ✓ MinIO: uploaded welcome.txt to anvil-demo bucket');
  } catch (e) {
    // mc might not be available inside a minimal node container; skip gracefully
    console.warn('  ! MinIO bucket seed skipped (mc not available):', (e as Error).message.split('\n')[0]);
    console.log('  → Run manually: docker exec anvil-minio mc alias set local http://localhost:9000 anvil_minio anvil_minio_secret && mc mb local/anvil-demo');
  }

  console.log('[MinIO] Done');
}

// ─── Main ───

async function main() {
  console.log('='.repeat(60));
  console.log('Project Anvil — Demo Seed Script');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Wait for all services
  console.log('\n[Health] Waiting for services...');
  await waitFor('Keycloak',     () => fetch(`${KEYCLOAK_URL}/health/ready`).then((r) => r.ok));
  await waitFor('Postgres',     () => import('child_process').then(({ execSync }) => {
    execSync(`pg_isready -h postgres -U anvil`, { stdio: 'pipe', env: { ...process.env, PGPASSWORD: 'anvil_secret' } });
    return Promise.resolve(true);
  }));
  await waitFor('Meilisearch',  () => fetch(`${MEILISEARCH_URL}/health`).then((r) => r.ok));
  await waitFor('MinIO',        () => fetch(`${MINIO_URL}/minio/health/live`).then((r) => r.ok));

  // Seed
  try { await seedKeycloak();    } catch (e) { console.error('[Keycloak] ERROR:', (e as Error).message); }
  try { await seedPostgres();    } catch (e) { console.error('[Postgres] ERROR:', (e as Error).message); }
  try { await seedMeilisearch(); } catch (e) { console.error('[Meilisearch] ERROR:', (e as Error).message); }
  try { await seedMinio();       } catch (e) { console.error('[MinIO] ERROR:', (e as Error).message); }

  console.log('\n' + '='.repeat(60));
  console.log('Seed complete!');
  console.log('');
  console.log('  Demo login:   http://localhost:8080  (Keycloak)');
  console.log('    realm:      anvil');
  console.log(`    username:   ${DEMO_USER.username}`);
  console.log(`    password:   ${DEMO_USER.password}`);
  console.log('');
  console.log('  Apps:');
  console.log('    Drive       http://localhost:3000');
  console.log('    Docs        http://localhost:3001');
  console.log('    Search      http://localhost:3002');
  console.log('    Gmail       http://localhost:3003');
  console.log('    Maps        http://localhost:3004');
  console.log('    YouTube     http://localhost:3005');
  console.log('='.repeat(60));
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
