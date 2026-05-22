import {NextRequest} from 'next/server';
import {success, error, getAdminSession, requireOwner} from '../../../../lib/admin-api';
import {getAdminDB} from '../../../../lib/db';

/**
 * POST /api/billing/checkout — Create a Stripe Checkout session for plan upgrade
 *
 * Body:
 *   planId   — "starter" | "business" | "enterprise"
 *   seats    — number of seats
 *   annual   — boolean (annual vs monthly billing)
 */
export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  const deny = requireOwner(session);
  if (deny) return deny;

  const body = await request.json();
  const {planId, seats = 1, annual = false} = body;

  const VALID_PLANS = ['starter', 'business', 'enterprise'];
  if (!planId || !VALID_PLANS.includes(planId)) {
    return error(`planId must be one of: ${VALID_PLANS.join(', ')}`);
  }

  if (typeof seats !== 'number' || seats < 1 || seats > 10000) {
    return error('seats must be between 1 and 10000');
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return error('Billing not configured. Contact support.', 503);
  }

  const db = getAdminDB();
  const tenant = await db.getTenantById(session.tenantId);
  if (!tenant) return error('Tenant not found', 404);

  // Get price ID for the plan + billing interval
  const priceKey = `STRIPE_PRICE_${planId.toUpperCase()}_${annual ? 'ANNUAL' : 'MONTHLY'}`;
  const priceId = process.env[priceKey];
  if (!priceId) {
    // For enterprise, redirect to sales
    if (planId === 'enterprise') {
      return success({
        redirectUrl: `https://${process.env.ANVIL_DOMAIN ?? 'anvil.dev'}/enterprise/contact?seats=${seats}&source=admin`,
        type: 'enterprise_redirect',
      });
    }
    return error(`Price not configured for ${planId} ${annual ? 'annual' : 'monthly'}`, 503);
  }

  // Build Stripe Checkout Session via API
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': String(seats),
    'success_url': `https://${process.env.ANVIL_DOMAIN ?? 'localhost'}/admin/billing?session_id={CHECKOUT_SESSION_ID}&upgraded=1`,
    'cancel_url': `https://${process.env.ANVIL_DOMAIN ?? 'localhost'}/admin/billing?canceled=1`,
    'client_reference_id': session.tenantId,
    'customer_email': tenant.ownerEmail ?? session.email,
    'metadata[tenant_id]': session.tenantId,
    'metadata[plan_id]': planId,
    'metadata[seats]': String(seats),
    'subscription_data[metadata][tenant_id]': session.tenantId,
    'allow_promotion_codes': 'true',
    'billing_address_collection': 'required',
  });

  // If tenant already has a Stripe customer ID, pass it
  const billing = await db.getBillingAccount(session.tenantId);
  if (billing?.stripeCustomerId) {
    params.set('customer', billing.stripeCustomerId);
    params.delete('customer_email');
  }

  if (annual) {
    params.set('subscription_data[trial_period_days]', '0');
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('[billing/checkout] Stripe error:', err);
    return error('Failed to create checkout session. Please try again.', 502);
  }

  const checkoutSession = await response.json();

  return success({
    checkoutUrl: checkoutSession.url,
    sessionId: checkoutSession.id,
  });
}
