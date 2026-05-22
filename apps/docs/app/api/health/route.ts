import { NextResponse } from 'next/server';

const START_TIME = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  
  return NextResponse.json({
    status: 'ok',
    app: 'docs',
    version: process.env.BUILD_VERSION ?? 'dev',
    uptime,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache',
      'X-App': 'docs',
    },
  });
}

// Kubernetes liveness probe — faster path
export async function HEAD() {
  return new Response(null, { status: 200 });
}
