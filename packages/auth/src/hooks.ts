/**
 * @anvil/auth — React hooks for OIDC authentication
 *
 * Provides useAuth (session state), usePKCE (login flow),
 * useTokenRefresh (automatic refresh), and useSilentAuth (prompt=none).
 */

'use client';

import {useState, useEffect, useCallback, useRef, createContext, useContext} from 'react';

// ── Types ──

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthSession {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextValue extends AuthSession {
  login: (callbackUrl?: string) => void;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

// ── PKCE Storage ──

const PKCE_KEY = 'anvil:pkce';
const STATE_KEY = 'anvil:state';

function savePKCE(verifier: string, state: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PKCE_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
}

function loadPKCE(): {verifier: string; state: string} | null {
  if (typeof window === 'undefined') return null;
  const verifier = sessionStorage.getItem(PKCE_KEY);
  const state = sessionStorage.getItem(STATE_KEY);
  if (!verifier || !state) return null;
  return {verifier, state};
}

function clearPKCE() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PKCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

// ── Auth Context ──

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <SessionProvider>');
  return ctx;
}

// ── Session Provider ──

export interface SessionProviderProps {
  children: React.ReactNode;
  /** Base URL of the app (for callback) */
  baseUrl?: string;
}

export function SessionProvider({children, baseUrl}: SessionProviderProps) {
  const [session, setSession] = useState<AuthSession>({
    user: null,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch current session from /api/auth/session
  const fetchSession = useCallback(async () => {
    try {
      const resp = await fetch('/api/auth/session');
      if (resp.ok) {
        const data = await resp.json();
        setSession({
          user: data.user ?? null,
          accessToken: data.accessToken ?? null,
          refreshToken: data.refreshToken ?? null,
          idToken: data.idToken ?? null,
          isAuthenticated: !!data.user,
          isLoading: false,
          error: null,
        });
      } else {
        setSession(prev => ({
          ...prev,
          isAuthenticated: false,
          isLoading: false,
          user: null,
        }));
      }
    } catch {
      setSession(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch session',
      }));
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Auto-refresh: schedule token refresh 5 minutes before expiry
  useEffect(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    if (session.isAuthenticated && session.accessToken) {
      // Try to decode JWT expiry
      try {
        const payload = JSON.parse(atob(session.accessToken.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        const now = Date.now();
        const refreshIn = Math.max(expiresAt - now - 5 * 60 * 1000, 60 * 1000);
        refreshTimerRef.current = setTimeout(() => fetchSession(), refreshIn);
      } catch {
        // If we can't decode, refresh every 4 minutes
        refreshTimerRef.current = setTimeout(() => fetchSession(), 4 * 60 * 1000);
      }
    }

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [session.isAuthenticated, session.accessToken, fetchSession]);

  // Login — redirect to PKCE flow
  const login = useCallback((callbackUrl?: string) => {
    const cb = callbackUrl ?? window.location.pathname;
    window.location.href = `/api/auth/login?callbackUrl=${encodeURIComponent(cb)}`;
  }, []);

  // Logout
  const logout = useCallback(() => {
    window.location.href = '/api/auth/logout';
  }, []);

  // Manual refresh
  const refreshSession = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  const value: AuthContextValue = {
    ...session,
    login,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── usePKCE — handles the callback side of PKCE ──

export function usePKCE() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCallback = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(params.get('error_description') ?? errorParam);
      return;
    }

    if (!code || !state) {
      setError('Missing code or state parameter');
      return;
    }

    const stored = loadPKCE();
    if (!stored || stored.state !== state) {
      setError('State mismatch — possible CSRF attack');
      return;
    }

    setIsProcessing(true);
    try {
      const resp = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code, state, codeVerifier: stored.verifier}),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Callback failed');
      }

      clearPKCE();
      // Redirect to the original page
      const callbackUrl = params.get('callbackUrl') ?? '/';
      window.location.href = callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {handleCallback, isProcessing, error};
}

// ── useSilentAuth — prompt=none iframe check ──

export function useSilentAuth() {
  const [isChecking, setIsChecking] = useState(false);

  const checkSession = useCallback(async () => {
    setIsChecking(true);
    try {
      // Create a hidden iframe to check SSO session
      const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080';
      const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'anvil';
      const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'anvil-app';
      const redirectUri = `${window.location.origin}/api/auth/silent-callback`;

      const checkUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth?` +
        `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code&scope=openid&prompt=none`;

      return new Promise<boolean>((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = checkUrl;

        const timeout = setTimeout(() => {
          document.body.removeChild(iframe);
          resolve(false);
        }, 5000);

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'anvil:silent-auth') {
            clearTimeout(timeout);
            document.body.removeChild(iframe);
            window.removeEventListener('message', handleMessage);
            resolve(event.data.authenticated === true);
          }
        };

        window.addEventListener('message', handleMessage);
        document.body.appendChild(iframe);
      });
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {checkSession, isChecking};
}

// ── useTokenRefresh — hook for manual + auto token refresh ──

export function useTokenRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const resp = await fetch('/api/auth/refresh', {method: 'POST'});
      if (!resp.ok) throw new Error('Token refresh failed');
      setLastRefreshed(new Date());
      return true;
    } catch {
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return {refresh, isRefreshing, lastRefreshed};
}
