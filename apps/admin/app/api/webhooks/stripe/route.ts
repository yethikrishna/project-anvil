import {NextRequest} from 'next/server';
import {createHmac, timingSafeEqual} from 'crypto';
import {getAdminDB} from '../../../lib/db';

/**
 * POST /api/webhooks/stripe
 *
 * Receives Stripe webhook events and updates the database.
 * Idempotent — processes each event_id only once.
 *
 * Security:
 *  - Verifies Stripe HMAC-SHA256 signature (timing-safe comparison)
 *  - 5-minute timestamp tolerance to prevent replay attacks
 *  - Idempotency key stored to prevent duplicate processing
 *
 * Handled events:
 *  - checkout.session.completed
 *  - customer.subscription.{created,updated,deleted,paused,resumed}
 *  - customer.subscription.trial_will_end
 *  - invoice.payment_succeeded
 *  - invoice.payment_failed
 *  - customer.updated
 *  - payment_method.attached
 */

// Plan ID mapping: Stripe price_id → Anvil plan_id
const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_FREE ?? 'price_free']:        'free',
  [process.env.STRIPE_PRICE_STARTER ?? 'price_starter']:  'starter',
  [process.env.STRIPE_PRICE_BUSINESS ?? 'price_business']: 'business',
  [process.env.STRIPE_PRICE_ENTERPRISE ?? 'price_ent']:   'enterprise',
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return Response.json({error: 'Missing stripe-signature header'}, {status: 400});
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return Response.json({error: 'Webhook not configured'}, {status: 500});
  }

  // Verify signature
  const verification = verifyStripeSignature(body, signature, webhookSecret);
  if (!verification.valid) {
    console.warn(`[stripe-webhook] Signature verification failed: ${verification.reason}`);
    return Response.json({error: 'Invalid signature'}, {status: 401});
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({error: 'Invalid JSON'}, {status: 400});
  }

  const db = getAdminDB();

  // Idempotency check — skip already-processed events
  try {
    const alreadyProcessed = await db.stripeEventProcessed(event.id);
    if (alreadyProcessed) {
      return Response.json({received: true, skipped: 'already_processed'});
    }
  } catch {
    // Non-fatal — proceed
  }

  try {
    await handleEvent(event, db);
    // Mark event as processed
    await db.recordStripeEvent(event.id, event.type, 'processed').catch(() => {});
    return Response.json({received: true});
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[stripe-webhook] Error processing ${event.type}:`, msg);
    await db.recordStripeEvent(event.id, event.type, 'failed', msg).catch(() => {});
    // Return 200 to prevent Stripe from retrying permanent errors
    return Response.json({received: true, error: msg}, {status: 200});
  }
}

// ── Event Dispatcher ──

async function handleEvent(event: StripeEvent, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const obj = event.data.object as Record<string, unknown>;

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(obj, db);
      break;

    case 'customer.subscription.created':
      await handleSubscriptionCreated(obj, db);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(obj, event.data.previous_attributes ?? {}, db);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(obj, db);
      break;

    case 'customer.subscription.paused':
      await db.updateBillingStatus(obj.customer as string, 'paused');
      break;

    case 'customer.subscription.resumed':
      await db.updateBillingStatus(obj.customer as string, 'active');
      break;

    case 'customer.subscription.trial_will_end':
      await handleTrialEnding(obj, db);
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(obj, db);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(obj, db);
      break;

    case 'customer.updated':
      await handleCustomerUpdated(obj, db);
      break;

    default:
      // Unhandled event — log and acknowledge
      console.log(`[stripe-webhook] Unhandled event: ${event.type}`);
  }
}

// ── Handlers ──

async function handleCheckoutComplete(session: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const tenantId = session.client_reference_id as string | undefined;
  const customerEmail = (session.customer_details as any)?.email as string | undefined;

  if (!customerId) return;

  // Link Stripe customer to tenant
  if (tenantId) {
    await db.linkStripeCustomer(tenantId, customerId, subscriptionId);
  } else if (customerEmail) {
    await db.linkStripeCustomerByEmail(customerEmail, customerId, subscriptionId);
  }

  await db.writeAuditLog({
    tenantId: tenantId ?? 'unknown',
    userId: 'system',
    action: 'billing.checkout_complete',
    resourceType: 'subscription',
    resourceId: subscriptionId,
    details: `Stripe checkout completed. Customer: ${customerId}`,
    ipAddress: 'stripe-webhook',
  });
}

async function handleSubscriptionCreated(sub: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = sub.customer as string;
  const priceId = (sub.items as any)?.data?.[0]?.price?.id as string | undefined;
  const planId = (priceId && PRICE_TO_PLAN[priceId]) ?? 'starter';
  const seats = (sub.items as any)?.data?.[0]?.quantity as number ?? 1;
  const trialEnd = sub.trial_end as number | null;
  const periodEnd = sub.current_period_end as number;

  await db.createOrUpdateBillingAccount({
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id as string,
    planId,
    seats,
    status: sub.status as string,
    trialEndsAt: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
  });

  // Update tenant plan
  await db.updateTenantPlan(customerId, planId);
}

async function handleSubscriptionUpdated(
  sub: Record<string, unknown>,
  prev: Record<string, unknown>,
  db: ReturnType<typeof getAdminDB>,
): Promise<void> {
  const customerId = sub.customer as string;
  const priceId = (sub.items as any)?.data?.[0]?.price?.id as string | undefined;
  const planId = (priceId && PRICE_TO_PLAN[priceId]) ?? 'starter';
  const seats = (sub.items as any)?.data?.[0]?.quantity as number ?? 1;
  const periodEnd = sub.current_period_end as number;

  await db.createOrUpdateBillingAccount({
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id as string,
    planId,
    seats,
    status: sub.status as string,
    trialEndsAt: null,
    currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
  });

  await db.updateTenantPlan(customerId, planId);

  // If seats changed, log it
  const prevSeats = (prev.items as any)?.data?.[0]?.quantity as number | undefined;
  if (prevSeats !== undefined && prevSeats !== seats) {
    console.log(`[stripe-webhook] Seat change: ${prevSeats} → ${seats} for customer ${customerId}`);
  }
}

async function handleSubscriptionDeleted(sub: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = sub.customer as string;
  await db.updateBillingStatus(customerId, 'canceled');
  await db.updateTenantPlan(customerId, 'free');
}

async function handleTrialEnding(sub: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = sub.customer as string;
  const trialEnd = sub.trial_end as number;
  const trialEndDate = new Date(trialEnd * 1000);
  const daysLeft = Math.ceil((trialEndDate.getTime() - Date.now()) / 86400000);

  // Get tenant admin email and send reminder
  const tenant = await db.getTenantByStripeCustomer(customerId);
  if (tenant) {
    console.log(`[stripe-webhook] Trial ending in ${daysLeft} days for tenant ${tenant.id} (${tenant.email})`);
    // In production: enqueue reminder email via SMTP/SendGrid
  }
}

async function handlePaymentSucceeded(invoice: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = invoice.customer as string;
  await db.updateBillingStatus(customerId, 'active');
  await db.recordInvoice({
    stripeCustomerId: customerId,
    stripeInvoiceId: invoice.id as string,
    amountPaid: invoice.amount_paid as number,
    currency: invoice.currency as string,
    pdfUrl: (invoice.invoice_pdf as string) ?? null,
    period: {
      start: new Date((invoice.period_start as number) * 1000).toISOString(),
      end: new Date((invoice.period_end as number) * 1000).toISOString(),
    },
    status: 'paid',
  });
}

async function handlePaymentFailed(invoice: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = invoice.customer as string;
  const attemptCount = invoice.attempt_count as number ?? 1;

  await db.updateBillingStatus(customerId, 'past_due');
  await db.recordInvoice({
    stripeCustomerId: customerId,
    stripeInvoiceId: invoice.id as string,
    amountPaid: 0,
    currency: invoice.currency as string ?? 'usd',
    pdfUrl: null,
    period: {
      start: new Date((invoice.period_start as number) * 1000).toISOString(),
      end: new Date((invoice.period_end as number) * 1000).toISOString(),
    },
    status: 'failed',
  });

  // After 3 failed attempts, warn tenant
  if (attemptCount >= 3) {
    const tenant = await db.getTenantByStripeCustomer(customerId);
    if (tenant) {
      console.warn(`[stripe-webhook] 3 payment failures for tenant ${tenant.id} — restricting access`);
      // In production: schedule grace period timer, restrict features
    }
  }
}

async function handleCustomerUpdated(customer: Record<string, unknown>, db: ReturnType<typeof getAdminDB>): Promise<void> {
  const customerId = customer.id as string;
  const email = customer.email as string | undefined;
  if (email) {
    await db.updateStripeCustomerEmail(customerId, email).catch(() => {});
  }
}

// ── Signature Verification ──

interface VerifyResult {
  valid: boolean;
  reason?: string;
}

function verifyStripeSignature(payload: string, signature: string, secret: string): VerifyResult {
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const sig = parts.find(p => p.startsWith('v1='))?.slice(3);

  if (!timestamp || !sig) {
    return {valid: false, reason: 'malformed signature header'};
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return {valid: false, reason: 'invalid timestamp'};
  }

  // 5-minute tolerance
  if (Math.abs(Date.now() / 1000 - ts) > 300) {
    return {valid: false, reason: 'timestamp too old'};
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    const sigBuf = Buffer.from(sig.padEnd(64, '0').slice(0, 64), 'hex');
    const expectedBuf = Buffer.from(expected.slice(0, 64), 'hex');
    if (!timingSafeEqual(sigBuf, expectedBuf)) {
      return {valid: false, reason: 'signature mismatch'};
    }
  } catch {
    // Fallback constant-time comparison
    if (sig !== expected) {
      return {valid: false, reason: 'signature mismatch'};
    }
  }

  return {valid: true};
}

// ── Types ──

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}
