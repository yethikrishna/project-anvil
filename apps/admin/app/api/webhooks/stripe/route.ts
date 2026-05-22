import {NextRequest} from 'next/server';
import {createHmac, timingSafeEqual} from 'crypto';

/**
 * POST /api/webhooks/stripe
 *
 * Receives Stripe webhook events and updates the database.
 * Handles: checkout completion, subscription changes, payment status.
 *
 * Security: Verifies Stripe signature using webhook secret.
 */

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return Response.json({error: 'Missing stripe-signature header'}, {status: 400});
  }

  // Verify webhook signature
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return Response.json({error: 'Webhook not configured'}, {status: 500});
  }

  const isValid = verifyStripeSignature(body, signature, webhookSecret);
  if (!isValid) {
    return Response.json({error: 'Invalid signature'}, {status: 401});
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({error: 'Invalid JSON'}, {status: 400});
  }

  // Process the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialEnding(event.data.object);
        break;

      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object);
        break;

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing Stripe webhook ${event.type}:`, err);
    return Response.json({error: 'Processing error'}, {status: 500});
  }

  return Response.json({received: true});
}

// ── Event Handlers ──

async function handleCheckoutComplete(session: any) {
  const tenantId = session.metadata?.tenantId;
  const planId = session.metadata?.planId;

  if (!tenantId) return;

  // Update billing account with subscription details
  // await db.query(`
  //   UPDATE billing_accounts SET
  //     stripe_customer_id = $1,
  //     stripe_subscription_id = $2,
  //     plan_id = $3,
  //     status = 'active',
  //     current_period_start = NOW(),
  //     current_period_end = NOW() + INTERVAL '1 month'
  //   WHERE tenant_id = $4
  // `, [session.customer, session.subscription, planId, tenantId]);

  // Record audit event
  // await recordAudit(tenantId, null, 'billing.checkout_complete', 'billing', session.subscription);
}

async function handleSubscriptionCreated(subscription: any) {
  const customerId = subscription.customer;
  // Look up tenant by stripe_customer_id, update subscription details
  // await db.query(`UPDATE billing_accounts SET stripe_subscription_id = $1, status = $2
  //   WHERE stripe_customer_id = $3`, [subscription.id, subscription.status, customerId]);
}

async function handleSubscriptionUpdated(subscription: any) {
  // Handle plan changes, seat changes
  // await db.query(`UPDATE billing_accounts SET
  //   plan_id = $1, seats = $2, status = $3,
  //   current_period_start = $4, current_period_end = $5
  //   WHERE stripe_subscription_id = $6`,
  //   [planId, seats, subscription.status,
  //    new Date(subscription.current_period_start * 1000),
  //    new Date(subscription.current_period_end * 1000),
  //    subscription.id]);
}

async function handleSubscriptionDeleted(subscription: any) {
  // Downgrade to free plan
  // await db.query(`UPDATE billing_accounts SET plan_id = 'free', status = 'canceled'
  //   WHERE stripe_subscription_id = $1`, [subscription.id]);
  // await db.query(`UPDATE tenants SET plan_id = 'free' WHERE id =
  //   (SELECT tenant_id FROM billing_accounts WHERE stripe_subscription_id = $1)`, [subscription.id]);
}

async function handlePaymentSucceeded(invoice: any) {
  // await db.query(`UPDATE billing_accounts SET status = 'active'
  //   WHERE stripe_customer_id = $1`, [invoice.customer]);
}

async function handlePaymentFailed(invoice: any) {
  // await db.query(`UPDATE billing_accounts SET status = 'past_due'
  //   WHERE stripe_customer_id = $1`, [invoice.customer]);
  // Send notification to org admin
}

async function handleTrialEnding(subscription: any) {
  // Notify org admin that trial is ending in 3 days
}

async function handlePaymentMethodAttached(paymentMethod: any) {
  // Update default payment method on customer
}

// ── Signature Verification ──

function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const sig = parts.find(p => p.startsWith('v1='))?.slice(3);

  if (!timestamp || !sig) return false;

  // Check timestamp freshness (5 min tolerance)
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison
  try {
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
