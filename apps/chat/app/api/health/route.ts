import { NextResponse } from 'next/server';

const START_TIME = Date.now();

const SERVICES = {
  mail: process.env.ANVIL_GMAIL_API ?? 'http://localhost:3006/api',
  drive: process.env.ANVIL_DRIVE_API ?? 'http://localhost:3002/api',
  calendar: process.env.ANVIL_CALENDAR_API ?? 'http://localhost:3007/api',
  docs: process.env.ANVIL_DOCS_API ?? 'http://localhost:3003/api',
} as const;

type ServiceId = keyof typeof SERVICES;

async function checkService(id: ServiceId): Promise<{ id: ServiceId; ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const url = `${SERVICES[id]}/health`;
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    });
    return { id, ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { id, ok: false, latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  // Check all downstream services in parallel with a 3s total budget
  const checks = await Promise.allSettled(
    (Object.keys(SERVICES) as ServiceId[]).map(id => checkService(id))
  );

  const services: Record<string, { ok: boolean; latencyMs: number }> = {};
  for (const check of checks) {
    if (check.status === 'fulfilled') {
      services[check.value.id] = {
        ok: check.value.ok,
        latencyMs: check.value.latencyMs,
      };
    }
  }

  const allOk = Object.values(services).every(s => s.ok);

  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    app: 'chat',
    version: process.env.BUILD_VERSION ?? 'dev',
    uptime,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    services,
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache',
      'X-App': 'chat',
    },
  });
}

// Kubernetes liveness probe — faster path
export async function HEAD() {
  return new Response(null, { status: 200 });
}
