/**
 * @anvil/migration — Google Workspace → Anvil migration toolkit.
 *
 * Handles bulk migration of:
 * - Gmail → Stalwart IMAP (via IMAP copy)
 * - Google Docs → Anvil Docs (via export API)
 * - Google Drive → MinIO (via download API)
 * - Google Calendar → Anvil Calendar (via iCal export)
 *
 * All migrations are resumable — each records progress per-item
 * so interrupted runs can continue where they left off.
 */

export * from './gmail';
export * from './drive';
export * from './docs';
export * from './calendar';

// ── Shared Types ──

export interface MigrationConfig {
  /** Google Workspace domain */
  domain: string;
  /** Google service account key (JSON) */
  serviceAccountKey: Record<string, unknown>;
  /** Subject (admin email to impersonate) */
  adminEmail: string;
  /** Target Anvil tenant ID */
  tenantId: string;
  /** Users to migrate (emails) */
  users: string[];
  /** Concurrent operation limit */
  concurrency?: number;
  /** Dry run — report what would be migrated without doing it */
  dryRun?: boolean;
}

export interface MigrationProgress {
  migrationId: string;
  type: 'gmail' | 'drive' | 'docs' | 'calendar';
  userId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt?: string;
  completedAt?: string;
  errors: Array<{itemId: string; error: string; timestamp: string}>;
}

export interface MigrationResult {
  migrationId: string;
  type: 'gmail' | 'drive' | 'docs' | 'calendar';
  totalUsers: number;
  totalItems: number;
  migratedItems: number;
  failedItems: number;
  skippedItems: number;
  durationMs: number;
  errors: Array<{userId: string; itemId: string; error: string}>;
}

// ── Migration Status Store ──

const progressStore = new Map<string, MigrationProgress>();

export function getProgress(migrationId: string): MigrationProgress | undefined {
  return progressStore.get(migrationId);
}

export function getAllProgress(): MigrationProgress[] {
  return Array.from(progressStore.values());
}
