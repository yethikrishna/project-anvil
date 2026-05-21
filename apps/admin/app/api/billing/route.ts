/**
 * Admin API — Billing status and management.
 */

import {NextRequest, NextResponse} from 'next/server';
import {PLANS, type PlanId} from '../../../../../../../packages/billing/src/index';

interface BillingStatus {
  planId: PlanId;
  planName: string;
  seats: number;
  maxSeats: number;
  storageUsedGB: number;
  maxStorageGB: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  stripeCustomerId?: string;
  paymentMethod?: {brand: string; last4: string};
  invoices: Array<{id: string; date: string; amount: number; status: string}>;
}

const billing: BillingStatus = {
  planId: 'free',
  planName: 'Free',
  seats: 5,
  maxSeats: 5,
  storageUsedGB: 4.9,
  maxStorageGB: 5,
  currentPeriodStart: '2026-05-01',
  currentPeriodEnd: '2026-06-01',
  invoices: [],
};

export async function GET() {
  const plan = PLANS[billing.planId];
  return NextResponse.json({
    ...billing,
    planDetails: plan,
    usage: {
      seats: {current: billing.seats, limit: billing.maxSeats, pct: Math.round(billing.seats / billing.maxSeats * 100)},
      storage: {current: billing.storageUsedGB, limit: billing.maxStorageGB, pct: Math.round(billing.storageUsedGB / billing.maxStorageGB * 100)},
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {action, planId, seats} = body;

  switch (action) {
    case 'change_plan': {
      if (!planId || !PLANS[planId as PlanId]) {
        return NextResponse.json({error: 'Invalid plan'}, {status: 400});
      }
      // In production: Create Stripe checkout session
      return NextResponse.json({
        checkoutUrl: 'https://billing.stripe.com/session/xxx',
        message: `Redirecting to checkout for ${PLANS[planId as PlanId].name} plan`,
      });
    }
    case 'update_seats': {
      if (!seats || seats < 1) {
        return NextResponse.json({error: 'Invalid seat count'}, {status: 400});
      }
      billing.seats = seats;
      return NextResponse.json({seats});
    }
    case 'portal': {
      // In production: Create Stripe customer portal session
      return NextResponse.json({
        portalUrl: 'https://billing.stripe.com/portal/xxx',
      });
    }
    default:
      return NextResponse.json({error: 'Unknown action'}, {status: 400});
  }
}
