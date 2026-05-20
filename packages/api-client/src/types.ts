/**
 * @anvil/api-client — Auto-generated types from OpenAPI schema
 *
 * These types mirror the OpenAPI 3.1 contract for Project Anvil services.
 * When the API spec changes, regenerate with: pnpm generate:api
 */

// ── Common ────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

// ── Auth / User ───────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

// ── Drive ─────────────────────────────────────────────────

export interface FileEntry {
  id: string;
  userId: string;
  name: string;
  path: string;
  mimeType: string | null;
  size: number;
  s3Key: string | null;
  isDirectory: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileUploadResult {
  id: string;
  name: string;
  s3Key: string;
  size: number;
  mimeType: string;
}

export interface ShareLink {
  id: string;
  fileId: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface FolderCreateRequest {
  name: string;
  parentPath: string;
}

export interface FileRenameRequest {
  name: string;
}

export interface ShareLinkCreateRequest {
  fileId: string;
  expiresInHours?: number;
}

export interface FileListParams {
  path?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'size' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

// ── Docs ──────────────────────────────────────────────────

export interface Document {
  id: string;
  userId: string;
  title: string;
  version: number;
  collaborators: DocumentCollaborator[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentCollaborator {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
}

// ── YouTube ───────────────────────────────────────────────

export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  thumbnails: { url: string; width: number; height: number }[];
}

// ── Maps ──────────────────────────────────────────────────

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  address: Record<string, string>;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  name: string;
}

export interface Route {
  distance: number;
  duration: number;
  geometry: string;
  steps: RouteStep[];
}

// ── Search ────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  snippet: string;
  score: number;
}

export interface SearchParams {
  query: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, string>;
}

// ── Gmail ─────────────────────────────────────────────────

export interface EmailMessage {
  id: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  labels: string[];
  read: boolean;
  starred: boolean;
  date: string;
}

export interface EmailCompose {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
}

// ── API Request/Response envelopes ────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export type ApiRequest<T> = T;
