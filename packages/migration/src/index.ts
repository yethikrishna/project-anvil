/**
 * @anvil/migration — Google Workspace → Anvil migration toolkit.
 *
 * Handles bulk migration of:
 * - Gmail → Stalwart IMAP
 * - Google Docs → Anvil Docs
 * - Google Drive → MinIO
 * - Google Calendar → Anvil Calendar
 *
 * Features:
 * - OAuth2 authentication with Google APIs
 * - Incremental sync (delta migration)
 * - Progress tracking and resume capability
 * - Error handling with retry logic
 * - Migration report generation
 */

// ── Common Types ──

export interface MigrationConfig {
  orgId: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  anvilApiUrl: string;
  anvilApiKey: string;
  /** Max concurrent operations */
  concurrency?: number;
  /** Batch size for bulk operations */
  batchSize?: number;
}

export interface MigrationProgress {
  orgId: string;
  type: 'gmail' | 'docs' | 'drive' | 'calendar';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt?: string;
  completedAt?: string;
  lastCursor?: string;     // For resumption
  errors: MigrationError[];
}

export interface MigrationError {
  itemId: string;
  itemName: string;
  error: string;
  retryCount: number;
  timestamp: string;
}

export interface MigrationReport {
  orgId: string;
  startedAt: string;
  completedAt: string;
  summary: {
    gmail: {migrated: number; failed: number; skipped: number};
    docs: {migrated: number; failed: number; skipped: number};
    drive: {migrated: number; failed: number; skipped: number};
    calendar: {migrated: number; failed: number; skipped: number};
  };
  totalSize: number;
  durationMinutes: number;
  errors: MigrationError[];
}

// ── Migration Base ──

export abstract class BaseMigrator {
  protected config: MigrationConfig;
  protected progress: MigrationProgress;

  constructor(config: MigrationConfig, type: MigrationProgress['type']) {
    this.config = config;
    this.progress = {
      orgId: config.orgId,
      type,
      status: 'pending',
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      errors: [],
    };
  }

  abstract migrate(): Promise<MigrationProgress>;
  abstract estimateItems(): Promise<number>;

  getProgress(): MigrationProgress {
    return {...this.progress};
  }

  protected async googleApiRequest(endpoint: string, accessToken: string): Promise<any> {
    const response = await fetch(`https://www.googleapis.com${endpoint}`, {
      headers: {Authorization: `Bearer ${accessToken}`},
    });

    if (response.status === 429) {
      // Rate limited — exponential backoff
      await new Promise(r => setTimeout(r, 2000));
      return this.googleApiRequest(endpoint, accessToken);
    }

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  protected async getGoogleAccessToken(): Promise<string> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: this.config.googleClientId,
        client_secret: this.config.googleClientSecret,
        refresh_token: this.config.googleRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) throw new Error('Failed to refresh Google access token');
    const data = await response.json();
    return data.access_token;
  }
}
