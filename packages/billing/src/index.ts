/**
 * @anvil/billing — Stripe integration with usage-based tiers.
 *
 * Tiers:
 * - Free: 5 users, 5 GB, basic features
 * - Starter: $9/user/mo, 50 GB, all apps
 * - Business: $19/user/mo, 500 GB, advanced features + API
 * - Enterprise: custom pricing, unlimited, SSO + audit logs
 */

// ── Types ──

export type PlanId = 'free' | 'starter' | 'business' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  pricePerUserMonth: number;
  maxUsers: number;
  storageGB: number;
  features: string[];
  stripePriceId?: string;
  highlight?: boolean;
  cta?: string;
}

export interface UsageRecord {
  userId: string;
  period: string; // YYYY-MM
  storageGB: number;
  apiCalls: number;
  documentsCreated: number;
  emailsSent: number;
  sharesCreated: number;
}

export interface BillingAccount {
  id: string;
  organizationId: string;
  planId: PlanId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  seats: number;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
}

// ── Plan Definitions ──

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    pricePerUserMonth: 0,
    maxUsers: 5,
    storageGB: 5,
    features: [
      'Up to 5 users',
      '5 GB storage',
      'Docs, Drive, Search',
      'Basic email',
      'Community support',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    pricePerUserMonth: 9,
    maxUsers: 25,
    storageGB: 50,
    features: [
      'Up to 25 users',
      '50 GB storage per user',
      'All Anvil apps',
      'Calendar & Tasks',
      'Email support',
      'API access (100 req/min)',
    ],
    stripePriceId: 'price_starter_monthly',
  },
  business: {
    id: 'business',
    name: 'Business',
    pricePerUserMonth: 19,
    maxUsers: 100,
    storageGB: 500,
    features: [
      'Up to 100 users',
      '500 GB storage per user',
      'All features',
      'AI Copilot',
      'Plugin marketplace',
      'Admin console & audit logs',
      'API access (1000 req/min)',
      'Priority support',
    ],
    stripePriceId: 'price_business_monthly',
    highlight: true,
    cta: 'Start Free Trial',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    pricePerUserMonth: 0, // Custom pricing
    maxUsers: Infinity,
    storageGB: Infinity,
    features: [
      'Unlimited users',
      'Unlimited storage',
      'Everything in Business',
      'SSO (SAML/OIDC)',
      'E2EE',
      'Custom SLA',
      'Dedicated support',
      'On-premise option',
    ],
    cta: 'Contact Sales',
  },
};

// ── Plan Enforcement ──

export function checkLimit(planId: PlanId, metric: 'users' | 'storageGB' | 'apiCalls', current: number): {allowed: boolean; limit: number; remaining: number} {
  const plan = PLANS[planId];
  const limit = metric === 'users' ? plan.maxUsers : metric === 'storageGB' ? plan.storageGB : plan.id === 'free' ? 100 : plan.id === 'starter' ? 100000 : 1000000;
  const remaining = Math.max(0, limit - current);

  return {
    allowed: current < limit,
    limit: limit === Infinity ? -1 : limit,
    remaining: remaining === Infinity ? -1 : remaining,
  };
}

export function hasFeature(planId: PlanId, feature: string): boolean {
  const plan = PLANS[planId];
  return plan.features.some(f => f.toLowerCase().includes(feature.toLowerCase()));
}

// ── Billing Calculations ──

export function calculateInvoice(planId: PlanId, seats: number): {
  subtotal: number;
  perUser: number;
  total: number;
  currency: string;
} {
  const plan = PLANS[planId];
  const subtotal = plan.pricePerUserMonth * seats;

  return {
    subtotal,
    perUser: plan.pricePerUserMonth,
    total: subtotal,
    currency: 'usd',
  };
}

export function calculateOverage(planId: PlanId, usedGB: number): {
  overageGB: number;
  overageCost: number;
} {
  const plan = PLANS[planId];
  const overageGB = Math.max(0, usedGB - plan.storageGB);
  const overageCost = overageGB * 0.10; // $0.10/GB overage

  return {overageGB, overageCost};
}

// ── Usage Tracking ──

const usageStore = new Map<string, UsageRecord>();

export function trackUsage(userId: string, metric: keyof Omit<UsageRecord, 'userId' | 'period'>, amount = 1): void {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `${userId}:${period}`;
  const existing = usageStore.get(key);

  if (existing) {
    (existing[metric] as number) += amount;
  } else {
    usageStore.set(key, {
      userId,
      period,
      storageGB: metric === 'storageGB' ? amount : 0,
      apiCalls: metric === 'apiCalls' ? amount : 0,
      documentsCreated: metric === 'documentsCreated' ? amount : 0,
      emailsSent: metric === 'emailsSent' ? amount : 0,
      sharesCreated: metric === 'sharesCreated' ? amount : 0,
    });
  }
}

export function getUsage(userId: string, period?: string): UsageRecord | undefined {
  const p = period ?? new Date().toISOString().slice(0, 7);
  return usageStore.get(`${userId}:${p}`);
}

// ── Stripe Webhook Handlers ──

export interface StripeWebhookEvent {
  type: 'checkout.session.completed' | 'customer.subscription.updated' | 'customer.subscription.deleted' | 'invoice.payment_succeeded' | 'invoice.payment_failed';
  data: {
    object: {
      customer: string;
      subscription?: string;
      metadata?: Record<string, string>;
    };
  };
}

export function handleStripeWebhook(event: StripeWebhookEvent): {action: string; customerId: string} {
  const customerId = event.data.object.customer;

  switch (event.type) {
    case 'checkout.session.completed':
      return {action: 'activate_subscription', customerId};

    case 'customer.subscription.updated':
      return {action: 'update_subscription', customerId};

    case 'customer.subscription.deleted':
      return {action: 'cancel_subscription', customerId};

    case 'invoice.payment_succeeded':
      return {action: 'mark_paid', customerId};

    case 'invoice.payment_failed':
      return {action: 'mark_past_due', customerId};

    default:
      return {action: 'unknown', customerId};
  }
}

// ── Re-exports ──

export * from './stripe';
export * from './metering';
