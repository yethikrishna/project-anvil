/**
 * Security headers + CSP nonce for all Anvil apps.
 *
 * Adds a comprehensive set of security headers to every response:
 * - Content-Security-Policy with per-request nonce
 * - Strict-Transport-Security
 * - X-Content-Type-Options
 * - X-Frame-Options
 * - Referrer-Policy
 * - Permissions-Policy
 * - Cross-Origin headers
 *
 * Target: A+ on SecurityHeaders.com
 */

import {createHash, randomBytes} from 'crypto';

// ── Nonce Generation ──

export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

// ── CSP Builder ──

export interface CSPOptions {
  nonce?: string;
  reportUri?: string;
  /** Allow specific additional domains */
  extraOrigins?: {
    script?: string[];
    style?: string[];
    img?: string[];
    connect?: string[];
    font?: string[];
    frame?: string[];
    media?: string[];
  };
  /** Development mode (more permissive) */
  dev?: boolean;
}

export function buildCSP(options: CSPOptions = {}): string {
  const {nonce, reportUri, extraOrigins = {}, dev = false} = options;

  const directives: string[] = [];

  // Default src
  directives.push(`default-src 'self'`);

  // Script src
  const scripts = ["'self'"];
  if (nonce) scripts.push(`'nonce-${nonce}'`);
  if (dev) {
    scripts.push("'unsafe-eval'");
    scripts.push("'unsafe-inline'");
  }
  scripts.push(...(extraOrigins.script ?? []));
  // Vercel live reload in dev
  if (dev) scripts.push('ws://localhost:*');
  directives.push(`script-src ${scripts.join(' ')}`);

  // Style src
  const styles = ["'self'", "'unsafe-inline'"]; // Tailwind needs inline
  if (nonce) styles.push(`'nonce-${nonce}'`);
  styles.push(...(extraOrigins.style ?? []));
  directives.push(`style-src ${styles.join(' ')}`);

  // Img src
  const images = ["'self'", 'data:', 'blob:'];
  images.push(...(extraOrigins.img ?? []));
  directives.push(`img-src ${images.join(' ')}`);

  // Connect src (APIs, WebSocket)
  const connect = ["'self'"];
  if (dev) connect.push('ws://localhost:*', 'http://localhost:*');
  connect.push(...(extraOrigins.connect ?? []));
  directives.push(`connect-src ${connect.join(' ')}`);

  // Font src
  const fonts = ["'self'"];
  fonts.push(...(extraOrigins.font ?? []));
  directives.push(`font-src ${fonts.join(' ')}`);

  // Frame src
  const frames: string[] = ["'none'"];
  frames.push(...(extraOrigins.frame ?? []));
  directives.push(`frame-src ${frames.join(' ')}`);

  // Media src
  const media = ["'self'", 'blob:'];
  media.push(...(extraOrigins.media ?? []));
  directives.push(`media-src ${media.join(' ')}`);

  // Object & frame ancestors
  directives.push("object-src 'none'");
  directives.push("base-uri 'self'");
  directives.push("form-action 'self'");
  directives.push("frame-ancestors 'none'");

  // Upgrade insecure requests in production
  if (!dev) {
    directives.push('upgrade-insecure-requests');
  }

  // Report URI
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join('; ');
}

// ── Full Security Headers ──

export interface SecurityHeadersOptions extends CSPOptions {
  /** HSTS max-age in seconds (default 31536000 = 1 year) */
  hstsMaxAge?: number;
  /** Include subdomains in HSTS */
  hstsIncludeSubdomains?: boolean;
  /** Enable HSTS preload */
  hstsPreload?: boolean;
}

export function getSecurityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> & {nonce?: string} {
  const {
    hstsMaxAge = 31536000,
    hstsIncludeSubdomains = true,
    hstsPreload = true,
    ...cspOptions
  } = options;

  const nonce = cspOptions.nonce ?? generateNonce();

  const hstsParts = [`max-age=${hstsMaxAge}`];
  if (hstsIncludeSubdomains) hstsParts.push('includeSubDomains');
  if (hstsPreload) hstsParts.push('preload');

  return {
    nonce,
    'Content-Security-Policy': buildCSP({...cspOptions, nonce}),
    'Strict-Transport-Security': hstsParts.join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0', // Deprecated, CSP handles this
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=(self)',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
    ].join(', '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };
}

// ── Next.js Middleware Integration ──

/**
 * Apply security headers to a Next.js middleware response.
 *
 * Usage in middleware.ts:
 * ```ts
 * import { applySecurityHeaders } from '@anvil/auth/security';
 *
 * export function middleware(request: NextRequest) {
 *   const response = NextResponse.next();
 *   return applySecurityHeaders(response, { dev: process.env.NODE_ENV === 'development' });
 * }
 * ```
 */
export function applySecurityHeaders(
  response: Response,
  options: SecurityHeadersOptions = {}
): Response {
  const headers = getSecurityHeaders(options);

  // Set nonce as a header so the app can read it (for inline scripts)
  response.headers.set('x-csp-nonce', headers.nonce ?? '');

  // Set all security headers
  for (const [key, value] of Object.entries(headers)) {
    if (key === 'nonce') continue;
    response.headers.set(key, value);
  }

  return response;
}
