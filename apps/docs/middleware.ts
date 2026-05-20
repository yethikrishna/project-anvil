import {createAuthMiddleware} from '@anvil/auth';

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
  return authMiddleware(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
