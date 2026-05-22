import {NextRequest} from 'next/server';
import {getAdminDB} from '../../../lib/db';
import {success, error} from '../../../lib/admin-api';
import {getStripeClient} from '@anvil/billing/stripe';

// ── GET /api/admin/billing — Get billing status ──

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (!isAdmin(session)) return error('Forbidden', 403);

  const db = getAdminDB();

  const [billingAccount, usage] = await Promise.all([
    db.getBillingAccount(session.tenantId),
    db.getUsage(session.tenantId),
  ]);

  return success({
    billing: billingAccount,
    usage,
  });
}

// ── POST /api/admin/billing/checkout — Create checkout session ──

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) return error('Unauthorized', 401);
  if (session.role !== 'owner') return error('Only owners can manage billing', 403);

  const body = await request.json();
  const {planId, seats} = body;

  if (!planId) return error('planId is required');
  if (!seats || seats < 1) return error('seats must be >= 1');

  const db = getAdminDB();
  const billingAccount = await db.getBillingAccount(session.tenantId);

  let stripeCustomerId = billingAccount?.stripe_customer_id;

  try {
    const stripe = getStripeClient();

    // Create customer if needed
    if (!stripeCustomerId) {
      const customer = await stripe.createCustomer({
        email: session.email,
        name: `Tenant ${session.tenantId}`,
        orgId: session.tenantId,
      });
      stripeCustomerId = customer.id;
    }

    // Map plan to Stripe price
    const priceMap: Record<string, string> = {
      starter: process.env.STRIPE_STARTER_PRICE_ID ?? 'price_starter_monthly',
      business: process.env.STRIPE_BUSINESS_PRICE_ID ?? 'price_business_monthly',
    };

    const priceId = priceMap[planId];
    if (!priceId) return error('Invalid plan for upgrade');

    const checkout = await stripe.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      mode: 'subscription',
      seats,
      successUrl: `${process.env.NEXT_PUBLIC_URL}/admin?billing=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_URL}/admin?billing=cancelled`,
      trialDays: 14,
      allowPromotionCodes: true,
      metadata: {tenantId: session.tenantId, planId},
    });

    return success({checkoutUrl: checkout.url});
  } catch (err: any) {
    return error(`Billing error: ${err.message}`, 500);
  }
}

function getAdminSession(request: NextRequest) {
  const header = request.headers.get('x-admin-session');
  if (!header) return null;
  try { return JSON.parse(atob(header)); } catch { return null; }
}

function isAdmin(session: any): boolean {
  return session?.role === 'owner' || session?.role === 'admin';
}
