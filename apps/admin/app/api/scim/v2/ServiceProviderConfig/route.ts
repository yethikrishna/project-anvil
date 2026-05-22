/**
 * SCIM 2.0 ServiceProviderConfig & Schemas — discovery endpoints.
 *
 * IdPs call these during setup to understand what the SP supports.
 * GET /api/scim/v2/ServiceProviderConfig
 */

import {NextRequest, NextResponse} from 'next/server';
import {SERVICE_PROVIDER_CONFIG} from '@anvil/auth/scim';

const SCIM_CT = 'application/scim+json';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(SERVICE_PROVIDER_CONFIG, {
    status: 200,
    headers: {'Content-Type': SCIM_CT},
  });
}
