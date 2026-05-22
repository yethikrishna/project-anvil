/**
 * Demo Signup API — POST /api/demo-signup
 *
 * Handles trial/demo signups from the landing and pricing pages.
 * In production:
 *   1. Validates input
 *   2. Creates a pending tenant record
 *   3. Sends a welcome email via Stalwart/SMTP
 *   4. Posts to CRM (HubSpot/Salesforce) via webhook
 *   5. Provisions a cloud trial instance asynchronously
 *
 * Rate limited to 10 requests/IP/hour to prevent abuse.
 */

import {NextRequest, NextResponse} from 'next/server';
import {createHash} from 'crypto';

// ── Types ──

interface DemoSignupBody {
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  useCase?: string;
  plan?: 'free' | 'starter' | 'business' | 'enterprise';
  deployType?: 'cloud' | 'self-hosted';
}

interface SignupResult {
  success: boolean;
  message: string;
  trialId?: string;
  nextSteps?: string[];
}

// ── Simple in-memory rate limiter (replace with Redis in production) ──

const rateLimitMap = new Map<string, {count: number; resetAt: number}>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, {count: 1, resetAt: now + RATE_WINDOW_MS});
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Validation ──

function validateEmail(email: string): boolean {
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

function sanitize(str: string, maxLen: number): string {
  return str.trim().slice(0, maxLen).replace(/<[^>]*>/g, '');
}

// ── Trial ID generation ──

function generateTrialId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TRL-${ts}-${rand}`;
}

// ── Webhook to CRM (production) ──

async function notifyCRM(data: DemoSignupBody, trialId: string): Promise<void> {
  const webhookUrl = process.env.CRM_WEBHOOK_URL;
  if (!webhookUrl) return; // Not configured in dev

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        event: 'demo_signup',
        trialId,
        timestamp: new Date().toISOString(),
        lead: data,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — log and continue
    console.error('[demo-signup] CRM webhook failed');
  }
}

// ── Send welcome email (production) ──

async function sendWelcomeEmail(data: DemoSignupBody, trialId: string): Promise<void> {
  const smtpApiUrl = process.env.SMTP_API_URL;
  const smtpApiKey = process.env.SMTP_API_KEY;
  if (!smtpApiUrl || !smtpApiKey) return;

  const isEnterprise = data.plan === 'enterprise';
  const subject = isEnterprise
    ? `Thanks for reaching out — we'll be in touch shortly`
    : `Welcome to Anvil — your trial is being set up`;

  const textBody = isEnterprise
    ? `Hi ${data.name},\n\nThanks for your interest in Anvil Enterprise. Our team will reach out within 1 business day to schedule a demo.\n\nTrial ID: ${trialId}\n\nBest,\nThe Anvil Team`
    : `Hi ${data.name},\n\nYour 14-day Anvil trial is being provisioned. You'll receive your login details within 5 minutes.\n\nTrial ID: ${trialId}\n\nWhile you wait, check out our quick-start guide:\nhttps://docs.anvil.dev/quickstart\n\nBest,\nThe Anvil Team`;

  try {
    await fetch(`${smtpApiUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${smtpApiKey}`,
      },
      body: JSON.stringify({
        from: 'noreply@anvil.dev',
        to: data.email,
        subject,
        text: textBody,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    console.error('[demo-signup] Welcome email failed');
  }
}

// ── Route Handler ──

export async function POST(request: NextRequest): Promise<NextResponse<SignupResult>> {
  // Rate limiting
  const rlKey = getRateLimitKey(request);
  if (!checkRateLimit(rlKey)) {
    return NextResponse.json(
      {success: false, message: 'Too many requests. Try again in an hour.'},
      {status: 429},
    );
  }

  // Parse body
  let body: DemoSignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({success: false, message: 'Invalid JSON'}, {status: 400});
  }

  // Validate required fields
  if (!body.name || !body.email) {
    return NextResponse.json(
      {success: false, message: 'Name and email are required.'},
      {status: 400},
    );
  }

  const name = sanitize(body.name, 100);
  const email = sanitize(body.email, 254);
  const company = body.company ? sanitize(body.company, 200) : undefined;
  const teamSize = body.teamSize ? sanitize(body.teamSize, 20) : undefined;
  const useCase = body.useCase ? sanitize(body.useCase, 500) : undefined;
  const plan = body.plan ?? 'starter';
  const deployType = body.deployType ?? 'cloud';

  if (!validateEmail(email)) {
    return NextResponse.json(
      {success: false, message: 'Invalid email address.'},
      {status: 400},
    );
  }

  const trialId = generateTrialId();

  // Non-blocking side effects
  void notifyCRM({name, email, company, teamSize, useCase, plan, deployType}, trialId);
  void sendWelcomeEmail({name, email, plan}, trialId);

  // Async provisioning (cloud or self-hosted license) — fire and forget
  // In production this would enqueue a job to a worker queue (BullMQ / pg-boss)
  if (process.env.NODE_ENV === 'production') {
    void (async () => {
      try {
        const {getTenantProvisioner} = await import('@anvil/billing/provisioner');
        const provisioner = getTenantProvisioner();
        await provisioner.provision({trialId, name, email, company, planId: plan, deployType, teamSize});
      } catch (e) {
        console.error('[demo-signup] provisioner error:', e);
      }
    })();
  }

  const isEnterprise = plan === 'enterprise';

  const nextSteps = isEnterprise
    ? [
        'Our enterprise team will contact you within 1 business day',
        'We\'ll schedule a 30-min demo tailored to your use case',
        'Custom pricing and SLA discussion',
      ]
    : deployType === 'self-hosted'
    ? [
        'Check your inbox for the self-hosted install guide',
        'Run: curl -fsSL https://get.anvil.dev | bash',
        'Your trial license key is in the email',
      ]
    : [
        'Check your inbox — credentials arrive in ~5 minutes',
        'Explore the quick-start guide: docs.anvil.dev/quickstart',
        'Import from Google Workspace with one command',
      ];

  return NextResponse.json({
    success: true,
    message: isEnterprise
      ? 'Thanks! Our team will reach out within 1 business day.'
      : 'You\'re in! Check your email for your trial details.',
    trialId,
    nextSteps,
  });
}

// Allow CORS for embedded signup forms
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
