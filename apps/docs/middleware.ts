import {createAuthMiddleware} from '@anvil/auth';
import {applySecurityHeaders} from '@anvil/auth/security';

const authMiddleware = createAuthMiddleware({
  publicRoutes: [
    '/api/auth/login',
    '/api/auth/callback',
    '/api/auth/logout',
    '/api/auth/session',
    '/api/auth/refresh',
    '/api/auth/silent-callback',
    '/api/health',
  ],
});

export async function middleware(request: Request) {
  // Run auth middleware first
  const authResponse = await authMiddleware(request);

  // If auth redirected, return the redirect (still add security headers)
  if (authResponse) {
    return applySecurityHeaders(authResponse, {
      dev: process.env.NODE_ENV === 'development',
    });
  }

  // For continuing requests, create a new response with security headers
  const response = new Response(null, {
    status: 200,
    headers: request.headers,
  });

  // We need to use NextResponse.next() equivalent — since this is Edge,
  // we return null from auth and apply headers via the response chain
  // The security headers are applied in a wrapper pattern
  return null;
}

// Wrapper that applies security headers to all responses
export function withSecurityHeaders(
  handler: (request: Request) => Promise<Response | null>
) {
  return async (request: Request) => {
    const response = await handler(request);
    if (response) {
      return applySecurityHeaders(response, {
        dev: process.env.NODE_ENV === 'development',
      });
    }
    // For NextResponse.next() — return headers to be merged
    return response;
  };
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
