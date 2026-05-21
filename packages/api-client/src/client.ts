/**
 * @anvil/api-client — Type-safe fetch wrapper with auth token injection
 *
 * Usage:
 *   const client = createApiClient({ baseUrl: 'http://localhost:3100' });
 *   const files = await client.get<FileEntry[]>('/files?path=/');
 *   const result = await client.post<FileUploadResult>('/files/upload', formData);
 */

import type { ApiResponse } from './types.js';
import {
  ApiClientError,
  AuthenticationError,
  TimeoutError,
  createErrorFromResponse,
} from './errors.js';

// ── Configuration ─────────────────────────────────────────

export interface ApiClientConfig {
  /** Base URL for the API (e.g. 'http://localhost:3100') */
  baseUrl: string;
  /** Custom access token — overrides getToken() */
  accessToken?: string;
  /** Function to retrieve the current access token (e.g. from session) */
  getToken?: () => Promise<string | null | undefined>;
  /** Default headers to include in every request */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30_000) */
  timeout?: number;
  /** Number of retry attempts for transient failures (default: 2) */
  retries?: number;
}

// ── HTTP Method Types ─────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestInit extends globalThis.RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

// ── API Client ────────────────────────────────────────────

export interface ApiClient {
  get<T>(url: string, init?: RequestInit): Promise<T>;
  post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T>(url: string, init?: RequestInit): Promise<T>;
  /** Upload files via multipart/form-data */
  upload<T>(url: string, formData: FormData, init?: RequestInit): Promise<T>;
  /** Get the raw Response object for streaming etc. */
  raw(url: string, init?: RequestInit): Promise<Response>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const {
    baseUrl,
    defaultHeaders = {},
    timeout: defaultTimeout = 30_000,
    retries: defaultRetries = 2,
  } = config;

  // ── Token resolution ──────────────────────────────────

  async function resolveToken(): Promise<string | null> {
    if (config.accessToken) return config.accessToken;
    if (config.getToken) return (await config.getToken()) ?? null;
    return null;
  }

  // ── URL builder ───────────────────────────────────────

  function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  // ── Core request ──────────────────────────────────────

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    init?: RequestInit,
    attempt = 0
  ): Promise<T> {
    const maxRetries = init?.timeout !== undefined ? 0 : defaultRetries;
    const requestTimeout = init?.timeout ?? defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    const url = buildUrl(path, init?.params);
    const token = await resolveToken();

    const headers: Record<string, string> = {
      ...defaultHeaders,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let serializedBody: BodyInit | undefined;
    if (body instanceof FormData) {
      // Let the browser set the Content-Type with boundary
      serializedBody = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { ...headers, ...init?.headers as Record<string, string> },
        body: serializedBody,
        signal: init?.signal ?? controller.signal,
      });

      if (!response.ok) {
        let errorBody: Record<string, unknown> = {};
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { message: response.statusText };
        }

        // Retry on 5xx and 429 (with backoff)
        const shouldRetry =
          attempt < maxRetries &&
          (response.status >= 500 || response.status === 429);

        if (shouldRetry) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise(r => setTimeout(r, delay));
          return request<T>(method, path, body, init, attempt + 1);
        }

        throw createErrorFromResponse(response.status, errorBody);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      const json = await response.json();

      // If the API wraps responses in { data, meta }, unwrap it
      if (json && typeof json === 'object' && 'data' in json) {
        return (json as ApiResponse<T>).data;
      }

      return json as T;
    } catch (err) {
      if (err instanceof ApiClientError) throw err;

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new TimeoutError(requestTimeout);
      }

      // Network error — retry
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
        await new Promise(r => setTimeout(r, delay));
        return request<T>(method, path, body, init, attempt + 1);
      }

      throw new ApiClientError(
        err instanceof Error ? err.message : 'Network request failed',
        0,
        'NETWORK_ERROR'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Public interface ──────────────────────────────────

  return {
    get<T>(url: string, init?: RequestInit) {
      return request<T>('GET', url, undefined, init);
    },
    post<T>(url: string, body?: unknown, init?: RequestInit) {
      return request<T>('POST', url, body, init);
    },
    put<T>(url: string, body?: unknown, init?: RequestInit) {
      return request<T>('PUT', url, body, init);
    },
    patch<T>(url: string, body?: unknown, init?: RequestInit) {
      return request<T>('PATCH', url, body, init);
    },
    delete<T>(url: string, init?: RequestInit) {
      return request<T>('DELETE', url, undefined, init);
    },
    upload<T>(url: string, formData: FormData, init?: RequestInit) {
      return request<T>('POST', url, formData, init);
    },
    raw(url: string, init?: RequestInit) {
      const fullUrl = buildUrl(url, init?.params);
      return fetch(fullUrl, init);
    },
  };
}

// ── Pre-configured client factories ──────────────────────

/** Create a client pre-configured for the Drive API */
export function createDriveClient(
  getToken?: () => Promise<string | null | undefined>
): ApiClient {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_DRIVE_API_URL ?? 'http://localhost:3100',
    getToken,
    defaultHeaders: { 'X-App': 'drive' },
  });
}

/** Create a client pre-configured for the Docs API */
export function createDocsClient(
  getToken?: () => Promise<string | null | undefined>
): ApiClient {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_DOCS_API_URL ?? 'http://localhost:3200',
    getToken,
    defaultHeaders: { 'X-App': 'docs' },
  });
}

/** Create a client pre-configured for the YouTube API proxy */
export function createYouTubeClient(
  getToken?: () => Promise<string | null | undefined>
): ApiClient {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_YOUTUBE_API_URL ?? 'http://localhost:3300',
    getToken,
    defaultHeaders: { 'X-App': 'youtube' },
  });
}

/** Create a client pre-configured for the Maps API */
export function createMapsClient(
  getToken?: () => Promise<string | null | undefined>
): ApiClient {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_MAPS_API_URL ?? 'http://localhost:3400',
    getToken,
    defaultHeaders: { 'X-App': 'maps' },
  });
}

/** Create a client pre-configured for the Search API */
export function createSearchClient(
  getToken?: () => Promise<string | null | undefined>
): ApiClient {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_SEARCH_API_URL ?? 'http://localhost:3500',
    getToken,
    defaultHeaders: { 'X-App': 'search' },
  });
}

/** Create a client pre-configured for the Gmail API */
export function createGmailClient(
  getToken?: () => Promise<string | null | undefined>
): ApiClient {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_GMAIL_API_URL ?? 'http://localhost:3600',
    getToken,
    defaultHeaders: { 'X-App': 'gmail' },
  });
}
