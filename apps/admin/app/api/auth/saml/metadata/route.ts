import {NextRequest} from 'next/server';
import {
  parseSAMLResponse,
  provisionUserFromSAML,
  generateSPMetadata,
  type SAMLConfig,
  type IdPConfig,
} from '@anvil/auth/saml';

/**
 * GET /api/auth/saml/metadata — SP metadata endpoint
 *
 * Returns the SAML Service Provider metadata XML.
 * IdP administrators use this URL to configure the Anvil SP.
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? 'https://localhost:3000';

  const spConfig: SAMLConfig = {
    entityId: `${baseUrl}/api/auth/saml/metadata`,
    acsUrl: `${baseUrl}/api/auth/saml/acs`,
    sloUrl: `${baseUrl}/api/auth/saml/slo`,
    wantAssertionsSigned: true,
    wantResponsesSigned: false,
  };

  const metadata = generateSPMetadata(spConfig);

  return new Response(metadata, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
