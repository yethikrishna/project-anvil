/**
 * GET /api/health
 */
import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'anvil-photos', ts: Date.now() });
}
