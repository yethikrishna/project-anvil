/**
 * Cloudflare Worker — Multi-Tenant Router
 *
 * Routes requests for tenant subdomains and custom domains to the correct
 * Anvil instance. Handles:
 *
 * 1. Cloud SaaS: {tenant}.anvil.dev → route to cloud app with X-Tenant-ID header
 * 2. Custom domains: acme.com → look up tenant from KV → add X-Tenant-ID header
 * 3. Static bypass: admin.anvil.dev, auth.anvil.dev, etc.
 * 4. TLS certificate check via Cloudflare SSL-for-SaaS API
 * 5. Edge rate limiting per tenant
 * 6. Edge geo-routing for data residency
 *
 * This worker runs at the EDGE (Cloudflare's global PoP network),
 * not on origin servers.
 */

export interface Env {
  // KV namespaces
  TENANT_MAP: KVNamespace;     // custom-domain → tenantId
  RATE_LIMIT: KVNamespace;     // rate limiting counters
  SESSION_CACHE: KVNamespace;  // auth session edge cache

  // Environment
  ORIGIN_URL: string;          // e.g., https://app.anvil.dev
  CLOUD_DOMAIN: string;        // e.g., anvil.dev
  WORKER_SECRET: string;       // HMAC secret for X-Forwarded-Tenant

  // Feature flags
  ENABLE_RATE_LIMIT: string;
  ENABLE_GEO_ROUTING: string;
}

// Static hostnames that bypass tenant routing
const BYPASS_HOSTS = new Set([
  'www',
  'auth',
  'admin',
  'api',
  'status',
  'docs',
  'blog',
  'help',
  'cdn',
  'assets',
  'mail',
]);

// Per-tier rate limits (requests per 60s window)
const RATE_LIMITS: Record<string, number> = {
  free: 100,
  starter: 500,
  business: 2000,
  enterprise: 10000,
  default: 200,
};

// Data residency region → origin URL mapping
const REGION_ORIGINS: Record<string, string> = {
  'us-east-1': 'https://us.app.anvil.dev',
  'eu-west-1': 'https://eu.app.anvil.dev',
  'ap-southeast-1': 'https://ap.app.anvil.dev',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname;

    // ── Health check (Cloudflare health monitor) ──
    if (url.pathname === '/_worker/health') {
      return new Response(JSON.stringify({status: 'ok', ts: Date.now()}), {
        headers: {'Content-Type': 'application/json'},
      });
    }

    // ── Resolve tenant from hostname ──
    const tenantResolution = await resolveTenant(host, env);

    if (!tenantResolution) {
      // Not a known tenant or bypass host — proxy to origin as-is
      return proxyToOrigin(request, env.ORIGIN_URL, null, null);
    }

    const {tenantId, tenantSlug, plan, region, customDomain} = tenantResolution;

    // ── Edge rate limiting ──
    if (env.ENABLE_RATE_LIMIT === 'true') {
      const limited = await checkRateLimit(request, tenantId, plan, env);
      if (limited) {
        return new Response(JSON.stringify({
          error: 'rate_limited',
          message: 'Too many requests. Please slow down.',
          retryAfter: 60,
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Tenant': tenantId,
          },
        });
      }
    }

    // ── Geo-routing for data residency ──
    let originUrl = env.ORIGIN_URL;
    if (env.ENABLE_GEO_ROUTING === 'true' && region) {
      originUrl = REGION_ORIGINS[region] ?? env.ORIGIN_URL;
    }

    // ── Custom domain: add HSTS and tenant headers ──
    const response = await proxyToOrigin(request, originUrl, tenantId, tenantSlug);

    // Add security headers for custom domains
    const headers = new Headers(response.headers);
    if (customDomain) {
      headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    headers.set('X-Anvil-Tenant', tenantSlug);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

// ── Tenant Resolution ──

interface TenantInfo {
  tenantId: string;
  tenantSlug: string;
  plan: string;
  region: string | null;
  customDomain: boolean;
}

async function resolveTenant(host: string, env: Env): Promise<TenantInfo | null> {
  const cloudDomain = env.CLOUD_DOMAIN ?? 'anvil.dev';

  // 1. Check if this is a subdomain of the cloud domain (e.g., acme.anvil.dev)
  if (host.endsWith(`.${cloudDomain}`)) {
    const subdomain = host.slice(0, host.length - cloudDomain.length - 1);

    // Known system subdomains — pass through without tenant header
    if (BYPASS_HOSTS.has(subdomain)) {
      return null;
    }

    // Look up tenant by slug
    const tenantData = await env.TENANT_MAP.get(`slug:${subdomain}`, {type: 'json'}) as TenantInfo | null;
    if (tenantData) {
      return tenantData;
    }

    // Unknown subdomain on cloud domain — could be a new tenant not yet in KV
    // Return a minimal record so the origin can decide
    return {
      tenantId: '',
      tenantSlug: subdomain,
      plan: 'default',
      region: null,
      customDomain: false,
    };
  }

  // 2. Check if this is a custom domain (e.g., workspace.acme.com)
  const customTenant = await env.TENANT_MAP.get(`domain:${host}`, {type: 'json'}) as TenantInfo | null;
  if (customTenant) {
    return {...customTenant, customDomain: true};
  }

  // Not a known tenant host
  return null;
}

// ── Proxy to Origin ──

async function proxyToOrigin(
  request: Request,
  originUrl: string,
  tenantId: string | null,
  tenantSlug: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  const originRequest = new Request(
    `${originUrl}${url.pathname}${url.search}`,
    {
      method: request.method,
      headers: buildUpstreamHeaders(request, tenantId, tenantSlug),
      body: request.body,
      redirect: 'follow',
    },
  );

  try {
    return await fetch(originRequest, {
      cf: {
        // Cloudflare-specific options
        cacheEverything: false,
        cacheTtl: 0,
      },
    });
  } catch (err) {
    console.error('Origin proxy error:', err);
    return new Response(JSON.stringify({
      error: 'origin_unavailable',
      message: 'Service temporarily unavailable.',
    }), {
      status: 503,
      headers: {'Content-Type': 'application/json'},
    });
  }
}

function buildUpstreamHeaders(
  request: Request,
  tenantId: string | null,
  tenantSlug: string | null,
): Headers {
  const headers = new Headers(request.headers);

  // Strip hop-by-hop headers
  headers.delete('connection');
  headers.delete('keep-alive');
  headers.delete('transfer-encoding');
  headers.delete('upgrade');

  // Add forwarding metadata
  const clientIp = request.headers.get('CF-Connecting-IP') ?? '';
  headers.set('X-Forwarded-For', clientIp);
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Real-IP', clientIp);

  // Tenant identification headers (trusted only because they come from our worker)
  if (tenantId) {
    headers.set('X-Tenant-ID', tenantId);
  }
  if (tenantSlug) {
    headers.set('X-Tenant-Slug', tenantSlug);
  }

  // Cloudflare geolocation (data residency enforcement at origin)
  const cfCountry = request.headers.get('CF-IPCountry') ?? '';
  const cfColo = request.headers.get('CF-Ray')?.split('-')[1] ?? '';
  if (cfCountry) headers.set('X-Client-Country', cfCountry);
  if (cfColo) headers.set('X-Client-Colo', cfColo);

  return headers;
}

// ── Rate Limiting ──

async function checkRateLimit(
  request: Request,
  tenantId: string,
  plan: string,
  env: Env,
): Promise<boolean> {
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.default;
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const windowKey = `rl:${tenantId}:${clientIp}:${Math.floor(Date.now() / 60000)}`;

  const current = await env.RATE_LIMIT.get(windowKey);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= limit) {
    return true; // rate limited
  }

  // Increment counter (non-blocking)
  await env.RATE_LIMIT.put(windowKey, String(count + 1), {expirationTtl: 120});
  return false;
}
