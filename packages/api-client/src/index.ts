/**
 * @anvil/api-client — Type-safe API client for Project Anvil
 *
 * Provides a fetch-based HTTP client with:
 * - Automatic auth token injection (Keycloak OIDC)
 * - Type-safe request/response via generics
 * - Retry with exponential backoff
 * - Request timeout handling
 * - Structured error classes
 * - Pre-configured client factories per service
 */

export { createApiClient, createDriveClient, createDocsClient, createYouTubeClient, createMapsClient, createSearchClient, createGmailClient } from './client.js';
export type { ApiClient, ApiClientConfig } from './client.js';

export * from './types.js';
export * from './errors.js';
