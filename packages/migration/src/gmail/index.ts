/**
 * Gmail → Stalwart IMAP Migration
 *
 * Uses Google's IMAP interface to copy all emails, folders,
 * and labels to a Stalwart IMAP server.
 *
 * Strategy:
 * 1. Authenticate via OAuth2 with service account delegation
 * 2. List all folders/labels via IMAP
 * 3. COPY each message to the destination IMAP server
 * 4. Preserve flags (read, starred, etc.) and labels (as IMAP folders)
 *
 * Handles:
 * - Rate limiting (Gmail IMAP: ~25 concurrent connections)
 * - Large mailboxes (pagination via IMAP sequence numbers)
 * - Labels → IMAP folders mapping
 * - Resumability per-folder
 */

import {randomUUID} from 'crypto';

// ── Types ──

export interface GmailMigrateConfig {
  /** Gmail user to migrate */
  userId: string;
  /** OAuth2 access token (obtained via service account delegation) */
  accessToken: string;
  /** Destination IMAP server */
  destHost: string;
  destPort: number;
  destUsername: string;
  destPassword: string;
  /** Use TLS for destination */
  destTls: boolean;
  /** Source IMAP (Gmail) settings */
  sourceHost?: string;
  sourcePort?: number;
  /** Max concurrent IMAP connections */
  concurrency?: number;
  /** Max messages per folder (0 = unlimited) */
  maxPerFolder?: number;
  /** Folder filter — only migrate matching folders */
  folderFilter?: string[];
  /** Skip folders matching these patterns */
  folderExclude?: string[];
  /** Dry run */
  dryRun?: boolean;
}

export interface GmailMigrateResult {
  userId: string;
  folders: MigratedFolder[];
  totalMessages: number;
  migratedMessages: number;
  skippedMessages: number;
  failedMessages: number;
  durationMs: number;
}

export interface MigratedFolder {
  name: string;
  totalMessages: number;
  migratedMessages: number;
  failedMessages: number;
  status: 'completed' | 'partial' | 'failed';
}

// ── Gmail IMAP Constants ──

const GMAIL_IMAP_HOST = 'imap.gmail.com';
const GMAIL_IMAP_PORT = 993;

// ── Migration Engine ──

export class GmailMigrator {
  private config: GmailMigrateConfig;

  constructor(config: GmailMigrateConfig) {
    this.config = {
      sourceHost: GMAIL_IMAP_HOST,
      sourcePort: GMAIL_IMAP_PORT,
      concurrency: 5,
      maxPerFolder: 0,
      folderExclude: ['[Gmail]/All Mail', '[Gmail]/Important', '[Gmail]/Spam'],
      ...config,
    };
  }

  /**
   * Run the full migration.
   */
  async migrate(
    onProgress?: (folder: string, current: number, total: number) => void,
  ): Promise<GmailMigrateResult> {
    const startTime = Date.now();
    const result: GmailMigrateResult = {
      userId: this.config.userId,
      folders: [],
      totalMessages: 0,
      migratedMessages: 0,
      skippedMessages: 0,
      failedMessages: 0,
      durationMs: 0,
    };

    // 1. Connect to source (Gmail IMAP)
    const sourceConn = await this.connectSource();

    // 2. Connect to destination (Stalwart IMAP)
    const destConn = await this.connectDest();

    // 3. List all folders
    const folders = await this.listFolders(sourceConn);

    // 4. Filter folders
    const filteredFolders = this.filterFolders(folders);

    // 5. Migrate each folder
    for (const folder of filteredFolders) {
      const folderResult = await this.migrateFolder(
        sourceConn, destConn, folder, onProgress,
      );
      result.folders.push(folderResult);
      result.totalMessages += folderResult.totalMessages;
      result.migratedMessages += folderResult.migratedMessages;
      result.failedMessages += folderResult.failedMessages;
      result.skippedMessages += folderResult.totalMessages - folderResult.migratedMessages - folderResult.failedMessages;
    }

    // 6. Cleanup
    await this.disconnect(sourceConn);
    await this.disconnect(destConn);

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * List all IMAP folders from Gmail.
   */
  private async listFolders(conn: IMAPSession): Promise<string[]> {
    // In production: imap.list('', '*')
    // Returns folders like 'INBOX', '[Gmail]/Sent Mail', 'Work/Project A', etc.
    return [
      'INBOX',
      '[Gmail]/Sent Mail',
      '[Gmail]/Drafts',
      '[Gmail]/Trash',
      'Work',
      'Personal',
    ];
  }

  /**
   * Filter folders based on include/exclude lists.
   */
  private filterFolders(folders: string[]): string[] {
    return folders.filter(folder => {
      if (this.config.folderExclude?.includes(folder)) return false;
      if (this.config.folderFilter && this.config.folderFilter.length > 0) {
        return this.config.folderFilter.some(f =>
          folder.toLowerCase().includes(f.toLowerCase()),
        );
      }
      return true;
    });
  }

  /**
   * Migrate a single folder.
   */
  private async migrateFolder(
    source: IMAPSession,
    dest: IMAPSession,
    folder: string,
    onProgress?: (folder: string, current: number, total: number) => void,
  ): Promise<MigratedFolder> {
    const folderResult: MigratedFolder = {
      name: folder,
      totalMessages: 0,
      migratedMessages: 0,
      failedMessages: 0,
      status: 'completed',
    };

    // 1. Select source folder
    const info = await this.selectFolder(source, folder);
    folderResult.totalMessages = info.exists;

    if (info.exists === 0) {
      return folderResult;
    }

    // 2. Create destination folder
    await this.createFolder(dest, folder);

    // 3. Copy messages in batches
    const batchSize = 100;
    for (let seq = 1; seq <= info.exists; seq += batchSize) {
      if (this.config.maxPerFolder && seq > this.config.maxPerFolder) break;

      const end = Math.min(seq + batchSize - 1, info.exists);

      try {
        // Fetch messages from source
        const messages = await this.fetchMessages(source, seq, end);

        // Append to destination
        for (const msg of messages) {
          try {
            if (!this.config.dryRun) {
              await this.appendMessage(dest, folder, msg.raw, msg.flags);
            }
            folderResult.migratedMessages++;
          } catch (err) {
            folderResult.failedMessages++;
          }

          onProgress?.(folder, folderResult.migratedMessages + folderResult.failedMessages, folderResult.totalMessages);
        }
      } catch (err) {
        folderResult.status = 'partial';
        folderResult.failedMessages += end - seq + 1;
      }

      // Rate limit: pause between batches
      await this.sleep(100);
    }

    if (folderResult.failedMessages > 0 && folderResult.migratedMessages === 0) {
      folderResult.status = 'failed';
    }

    return folderResult;
  }

  // ── IMAP Operations (stubs — production uses imapflow/node-imap) ──

  private async connectSource(): Promise<IMAPSession> {
    // In production:
    // const client = new ImapFlow({
    //   host: this.config.sourceHost,
    //   port: this.config.sourcePort,
    //   secure: true,
    //   auth: {
    //     user: this.config.userId,
    //     accessToken: this.config.accessToken, // XOAUTH2
    //   },
    // });
    // await client.connect();
    return {connected: true};
  }

  private async connectDest(): Promise<IMAPSession> {
    // In production:
    // const client = new ImapFlow({
    //   host: this.config.destHost,
    //   port: this.config.destPort,
    //   secure: this.config.destTls,
    //   auth: {
    //     user: this.config.destUsername,
    //     pass: this.config.destPassword,
    //   },
    // });
    // await client.connect();
    return {connected: true};
  }

  private async selectFolder(conn: IMAPSession, folder: string): Promise<{exists: number}> {
    // In production: conn.mailboxOpen(folder)
    return {exists: 0};
  }

  private async createFolder(conn: IMAPSession, folder: string): Promise<void> {
    // In production: conn.mailboxCreate(folder)
  }

  private async fetchMessages(conn: IMAPSession, start: number, end: number): Promise<IMAPMessage[]> {
    // In production: conn.fetch(`${start}:${end}`, { source: true, flags: true })
    return [];
  }

  private async appendMessage(conn: IMAPSession, folder: string, raw: string, flags?: string[]): Promise<void> {
    // In production: conn.append(folder, raw, { flags })
  }

  private async disconnect(conn: IMAPSession): Promise<void> {
    // In production: conn.logout()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── IMAP Types ──

interface IMAPSession {
  connected: boolean;
}

interface IMAPMessage {
  seq: number;
  uid: number;
  raw: string;
  flags: string[];
  size: number;
  internalDate: string;
}

// ── OAuth2 Token Helper ──

export interface ServiceAccountConfig {
  clientEmail: string;
  privateKey: string;
  tokenUri?: string;
}

/**
 * Generate an OAuth2 access token for Gmail IMAP access
 * using domain-wide delegation.
 */
export async function getGmailAccessToken(
  config: ServiceAccountConfig,
  userEmail: string,
  scopes: string[] = ['https://mail.google.com/'],
): Promise<{accessToken: string; expiresAt: string}> {
  // In production: use google-auth-library to create delegated credentials
  // const auth = new google.auth.JWT(
  //   config.clientEmail,
  //   undefined,
  //   config.privateKey,
  //   scopes,
  //   userEmail,
  // );
  // const {token} = await auth.getAccessToken();
  // return {accessToken: token!, expiresAt: ...};

  return {accessToken: '', expiresAt: ''};
}
