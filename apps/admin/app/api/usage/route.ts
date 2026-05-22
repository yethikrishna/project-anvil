import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error, getAdminSession, requireAdmin} from '../../../lib/admin-api';

/**
 * GET /api/usage — Current period usage for the tenant
 *
 * Query params:
 *   period    — YYYY-MM (default: current month)
 *   breakdown — "daily" | "monthly" (default: monthly)
 */
export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  const deny = requireAdmin(session);
  if (deny) return deny;

  const url = new URL(request.url);
  const period = url.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  const breakdown = url.searchParams.get('breakdown') ?? 'monthly';

  const db = getAdminDB();

  const [plan, usage] = await Promise.all([
    db.getTenantPlan(session.tenantId),
    db.getUsageForPeriod(session.tenantId, period),
  ]);

  const limits = PLAN_LIMITS[plan ?? 'starter'];

  const utilization = {
    aiCalls: limits.aiCalls > 0 ? Math.min(100, Math.round((usage.aiCalls / limits.aiCalls) * 100)) : 0,
    storage: limits.storageGB > 0 ? Math.min(100, Math.round((usage.storageGB / limits.storageGB) * 100)) : 0,
    seats: limits.seats > 0 ? Math.min(100, Math.round((usage.activeUsers / limits.seats) * 100)) : 0,
    apiCalls: limits.apiCalls > 0 ? Math.min(100, Math.round((usage.apiCalls / limits.apiCalls) * 100)) : 0,
  };

  const overage = computeOverage(usage, limits, plan ?? 'starter');

  const daily = breakdown === 'daily'
    ? await db.getDailyUsage(session.tenantId, period)
    : null;

  return success({
    period,
    plan: plan ?? 'starter',
    limits,
    usage,
    utilization,
    overage,
    ...(daily ? {daily} : {}),
  });
}

/**
 * POST /api/usage — Record a usage event (service-to-service)
 *
 * Requires X-Service-Token header matching SERVICE_TOKEN env var.
 */
export async function POST(request: NextRequest) {
  const serviceToken = request.headers.get('x-service-token');
  const expectedToken = process.env.SERVICE_TOKEN;
  if (!expectedToken || !serviceToken || serviceToken !== expectedToken) {
    return error('Unauthorized', 401);
  }

  const body = await request.json();
  const {tenantId, metric, quantity} = body;

  if (!tenantId || typeof tenantId !== 'string') return error('tenantId is required');
  if (!metric || typeof metric !== 'string') return error('metric is required');
  if (typeof quantity !== 'number' || quantity < 0) return error('quantity must be a non-negative number');

  const VALID_METRICS = ['ai_calls', 'api_calls', 'storage_bytes', 'emails_sent', 'files_uploaded', 'searches'];
  if (!VALID_METRICS.includes(metric)) {
    return error(`Invalid metric. Valid values: ${VALID_METRICS.join(', ')}`);
  }

  const db = getAdminDB();
  const period = new Date().toISOString().slice(0, 7);

  await db.incrementUsage(tenantId, metric, quantity, period);

  if (metric === 'ai_calls') {
    const plan = await db.getTenantPlan(tenantId);
    const limits = PLAN_LIMITS[plan ?? 'starter'];
    const usage = await db.getUsageForPeriod(tenantId, period);
    if (usage.aiCalls > limits.aiCalls) {
      return success({recorded: true, limitExceeded: true, metric, current: usage.aiCalls, limit: limits.aiCalls});
    }
  }

  return success({recorded: true, metric, quantity});
}

// ── Plan Limits ──

const PLAN_LIMITS: Record<string, {aiCalls: number; storageGB: number; seats: number; apiCalls: number}> = {
  free:       {aiCalls: 100,    storageGB: 5,    seats: 5,    apiCalls: 1000},
  starter:    {aiCalls: 5000,   storageGB: 50,   seats: 25,   apiCalls: 50000},
  business:   {aiCalls: 25000,  storageGB: 500,  seats: 100,  apiCalls: 500000},
  enterprise: {aiCalls: 250000, storageGB: 5000, seats: 9999, apiCalls: 9999999},
};

function computeOverage(
  usage: {aiCalls: number; storageGB: number},
  limits: {aiCalls: number; storageGB: number},
  plan: string,
) {
  if (plan === 'enterprise') return {total: 0, items: []};
  const items: Array<{metric: string; overage: number; unitCost: number; total: number}> = [];
  let total = 0;

  const aiOverage = Math.max(0, usage.aiCalls - limits.aiCalls);
  if (aiOverage > 0) {
    const cost = Math.ceil(aiOverage / 100) * 0.25;
    items.push({metric: 'ai_calls', overage: aiOverage, unitCost: 0.0025, total: cost});
    total += cost;
  }

  const storageOverage = Math.max(0, usage.storageGB - limits.storageGB);
  if (storageOverage > 0) {
    const cost = Math.ceil(storageOverage) * 0.10;
    items.push({metric: 'storage_gb', overage: storageOverage, unitCost: 0.10, total: cost});
    total += cost;
  }

  return {total: Math.round(total * 100) / 100, items};
}
