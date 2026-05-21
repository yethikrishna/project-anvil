/**
 * Admin API — Organization settings.
 */

import {NextRequest, NextResponse} from 'next/server';

interface OrgSettings {
  name: string;
  domain: string;
  timezone: string;
  plan: string;
  seats: number;
  features: Record<string, boolean>;
  auth: {
    ssoEnabled: boolean;
    samlEntityId?: string;
    samlSsoUrl?: string;
    mfaPolicy: string;
    sessionTimeout: number;
  };
  dataResidency: {
    region: string;
    jurisdiction: string;
  };
}

const settings: OrgSettings = {
  name: 'Anvil Corp',
  domain: 'anvil.dev',
  timezone: 'UTC',
  plan: 'free',
  seats: 5,
  features: {
    sso: false,
    mfa: false,
    auditLog: true,
    e2ee: false,
    customDomain: false,
    api: false,
    ai: false,
    marketplace: false,
  },
  auth: {
    ssoEnabled: false,
    mfaPolicy: 'disabled',
    sessionTimeout: 30,
  },
  dataResidency: {
    region: 'us-east-1',
    jurisdiction: 'US',
  },
};

export async function GET() {
  return NextResponse.json({settings});
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();

  // Merge updates
  if (body.name) settings.name = body.name;
  if (body.timezone) settings.timezone = body.timezone;
  if (body.features) Object.assign(settings.features, body.features);
  if (body.auth) Object.assign(settings.auth, body.auth);
  if (body.dataResidency) Object.assign(settings.dataResidency, body.dataResidency);

  return NextResponse.json({settings});
}
