/**
 * Stripe webhook signature verification and event processing.
 *
 * Security:
 * - Verifies webhook signature using timing-safe comparison
 * - Processes events idempotently
 * - Logs all billing events to audit trail
 *
 * Supported events:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - customer.subscription.paused
 * - customer.subscription.resumed
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 * - checkout.session.completed
 * - customer.updated
 */

import {createHmac, timingSafeEqual} from 'crypto';

// ── Types ──

export interface StripeWebhookConfig {
  webhookSecret: string;
  apiVersion: string;
}

export interface StripeEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
  pending_webhooks: number;
  request: { id: string | null; idempotency_key: string | null };
}

export type EventHandler = (event: StripeEvent) => Promise<void>;

// ── Signature Verification ──

/**
 * Verify Stripe webhook signature.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @see https://docs.stripe.com/webhooks/signatures
 */
export function verifyWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds: number = 300
): { verified: boolean; error?: string } {
  const parts = sigHeader.split(',');
  const sigMap: Record<string, string> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    sigMap[key.trim()] = value.trim();
  }

  const timestamp = sigMap['t'];
  const signature = sigMap['v1'];

  if (!timestamp || !signature) {
    return { verified: false, error: 'Missing timestamp or signature in header' };
  }

  // Check timestamp tolerance (replay protection)
  const eventTime = parseInt(timestamp, 10) * 1000;
  const now = Date.now();
  if (Math.abs(now - eventTime) > toleranceSeconds * 1000) {
    return { verified: false, error: 'Webhook timestamp outside tolerance window' };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Timing-safe comparison
  try {
    const expected = Buffer.from(expectedSig, 'hex');
    const actual = Buffer.from(signature, 'hex');

    if (expected.length !== actual.length) {
      return { verified: false, error: 'Signature length mismatch' };
    }

    if (!timingSafeEqual(expected, actual)) {
      return { verified: false, error: 'Signature verification failed' };
    }
  } catch {
    return { verified: false, error: 'Invalid signature format' };
  }

  return { verified: true };
}

// ── Event Router ──

export class StripeWebhookHandler {
  private handlers = new Map<string, EventHandler[]>();
  private processedEvents = new Set<string>();

  /**
   * Register a handler for a Stripe event type.
   */
  on(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Process a verified webhook event.
   * Ensures idempotent processing by tracking event IDs.
   */
  async processEvent(event: StripeEvent): Promise<{ processed: boolean; error?: string }> {
    // Idempotency check
    if (this.processedEvents.has(event.id)) {
      return { processed: false, error: 'Event already processed (idempotent)' };
    }

    const handlers = this.handlers.get(event.type) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];
    const allHandlers = [...wildcardHandlers, ...handlers];

    if (allHandlers.length === 0) {
      return { processed: false, error: `No handler for event type: ${event.type}` };
    }

    try {
      for (const handler of allHandlers) {
        await handler(event);
      }
      this.processedEvents.add(event.id);
      return { processed: true };
    } catch (err) {
      return { processed: false, error: (err as Error).message };
    }
  }

  /**
   * Parse and verify a raw webhook request.
   */
  async handleRawRequest(
    payload: string,
    sigHeader: string,
    secret: string
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    // Verify signature
    const verification = verifyWebhookSignature(payload, sigHeader, secret);
    if (!verification.verified) {
      return { status: 401, body: { error: verification.error } };
    }

    // Parse event
    let event: StripeEvent;
    try {
      event = JSON.parse(payload);
    } catch {
      return { status: 400, body: { error: 'Invalid JSON payload' } };
    }

    // Process
    const result = await this.processEvent(event);

    if (result.processed) {
      return { status: 200, body: { received: true, event_id: event.id } };
    } else {
      return { status: result.error?.includes('idempotent') ? 200 : 422, body: { error: result.error } };
    }
  }
}

// ── Standard Event Handlers ──

/**
 * Create the standard set of billing event handlers.
 */
export function createStandardHandlers(deps: {
  updateSubscription: (data: Record<string, unknown>) => Promise<void>;
  updateBillingAccount: (data: Record<string, unknown>) => Promise<void>;
  recordPayment: (data: Record<string, unknown>) => Promise<void>;
  auditLog: (action: string, details: Record<string, unknown>) => Promise<void>;
}): Map<string, EventHandler> {
  const handlers = new Map<string, EventHandler[]>();

  // Subscription lifecycle
  const subscriptionEvents = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
  ];

  for (const eventType of subscriptionEvents) {
    handlers.set(eventType, [
      async (event) => {
        await deps.updateSubscription(event.data.object);
        await deps.auditLog(`billing.${eventType.split('.').pop()}`, {
          subscriptionId: (event.data.object as any).id,
          status: (event.data.object as any).status,
        });
      },
    ]);
  }

  // Payment events
  handlers.set('invoice.payment_succeeded', [
    async (event) => {
      await deps.recordPayment(event.data.object);
      await deps.auditLog('billing.payment_succeeded', {
        invoiceId: (event.data.object as any).id,
        amount: (event.data.object as any).amount_paid,
      });
    },
  ]);

  handlers.set('invoice.payment_failed', [
    async (event) => {
      await deps.auditLog('billing.payment_failed', {
        invoiceId: (event.data.object as any).id,
        attempt: (event.data.object as any).attempt_count,
      });
    },
  ]);

  // Checkout
  handlers.set('checkout.session.completed', [
    async (event) => {
      await deps.updateBillingAccount(event.data.object);
      await deps.auditLog('billing.checkout_completed', {
        sessionId: (event.data.object as any).id,
        mode: (event.data.object as any).mode,
      });
    },
  ]);

  return handlers;
}
