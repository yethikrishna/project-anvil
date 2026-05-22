import {NextRequest, NextResponse} from 'next/server';
import {
  parseSAMLResponse,
  provisionUserFromSAML,
  type SAMLConfig,
  type IdPConfig,
} from '@anvil/auth/saml';

/**
 * POST /api/auth/saml/acs — Assertion Consumer Service
 *
 * Receives SAML assertions from the IdP after user authentication.
 * Validates the assertion, provisions/maps the user, and creates a session.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const samlResponse = formData.get('SAMLResponse') as string;
  const relayState = formData.get('RelayState') as string;

  if (!samlResponse) {
    return Response.json({error: 'Missing SAMLResponse'}, {status: 400});
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL ?? 'https://localhost:3000';

  // Look up the IdP config based on relay state or organization context
  // In production: query saml_idps table by tenant
  const idpConfig: IdPConfig = {
    entityId: process.env.SAML_IDP_ENTITY_ID ?? '',
    ssoUrl: process.env.SAML_IDP_SSO_URL ?? '',
    certificate: process.env.SAML_IDP_CERTIFICATE ?? '',
    name: 'Default IdP',
    orgId: process.env.DEFAULT_ORG_ID ?? '',
  };

  const spConfig: SAMLConfig = {
    entityId: `${baseUrl}/api/auth/saml/metadata`,
    acsUrl: `${baseUrl}/api/auth/saml/acs`,
    sloUrl: `${baseUrl}/api/auth/saml/slo`,
    wantAssertionsSigned: true,
    wantResponsesSigned: false,
  };

  try {
    // 1. Parse and validate the SAML assertion
    const assertion = parseSAMLResponse(samlResponse, idpConfig, spConfig);

    // 2. Provision or map the user (JIT provisioning)
    const user = provisionUserFromSAML(assertion, idpConfig);

    // 3. Create or update user in database
    // const dbUser = await db.upsertUser({
    //   email: user.email,
    //   name: user.displayName,
    //   firstName: user.firstName,
    //   lastName: user.lastName,
    //   tenantId: user.orgId,
    //   authMethod: 'saml',
    //   samlNameId: assertion.nameId,
    //   samlSessionIndex: assertion.sessionIndex,
    // });

    // 4. Create session / JWT
    // const session = await createSession(dbUser);

    // 5. Record audit event
    // await recordAudit(orgId, dbUser.id, 'auth.saml_login', 'user', dbUser.id);

    // 6. Redirect to the app with session
    const redirectUrl = relayState || '/';
    const response = NextResponse.redirect(new URL(redirectUrl, baseUrl));

    // Set session cookie
    // response.cookies.set('anvil_session', session.token, {
    //   httpOnly: true,
    //   secure: true,
    //   sameSite: 'lax',
    //   maxAge: 86400, // 24 hours
    //   path: '/',
    // });

    return response;
  } catch (err: any) {
    console.error('SAML ACS error:', err.message);

    // Redirect to login page with error
    return NextResponse.redirect(
      new URL(`/login?error=saml_failed&message=${encodeURIComponent(err.message)}`, baseUrl),
    );
  }
}
