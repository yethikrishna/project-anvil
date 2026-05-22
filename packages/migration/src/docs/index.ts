/**
 * Google Docs → Anvil Docs Migration
 *
 * Exports Google Docs, Sheets, and Slides via the Google Drive API
 * and converts them to Anvil Docs format.
 *
 * Export formats:
 * - Google Docs → HTML (preserves formatting) → Markdown for Anvil Docs
 * - Google Sheets → CSV (per sheet) → Anvil tables
 * - Google Slides → PDF (static export) → stored in Drive
 *
 * Strategy:
 * 1. List all Google Docs/Sheets/Slides from Drive
 * 2. Export each via the Drive API export endpoint
 * 3. Convert to Anvil Doc format (Markdown + metadata)
 * 4. Save via Anvil Docs API
 * 5. Store original in MinIO for reference
 */

import {randomUUID} from 'crypto';

// ── Types ──

export interface DocsMigrateConfig {
  userId: string;
  accessToken: string;
  /** Anvil Docs API endpoint */
  docsApiUrl: string;
  /** MinIO for storing originals */
  minioEndpoint: string;
  minioBucket: string;
  /** Dry run */
  dryRun?: boolean;
  /** Concurrency */
  concurrency?: number;
}

export interface DocsMigrateResult {
  userId: string;
  totalDocs: number;
  migratedDocs: number;
  failedDocs: number;
  skippedDocs: number;
  sheetsExported: number;
  slidesExported: number;
  durationMs: number;
  errors: Array<{docId: string; docName: string; error: string}>;
}

export interface GoogleDoc {
  id: string;
  name: string;
  mimeType: GoogleDocMimeType;
  parents: string[];
  createdTime: string;
  modifiedTime: string;
  lastModifyingUser?: {emailAddress: string; displayName: string};
}

export type GoogleDocMimeType =
  | 'application/vnd.google-apps.document'
  | 'application/vnd.google-apps.spreadsheet'
  | 'application/vnd.google-apps.presentation';

export interface ExportedDoc {
  id: string;
  name: string;
  mimeType: GoogleDocMimeType;
  /** Exported content (HTML for docs, CSV for sheets, PDF for slides) */
  content: Buffer;
  /** Export MIME type */
  exportMimeType: string;
  /** Converted Anvil Doc content (Markdown) */
  markdown?: string;
}

// ── MIME Type → Export Format Mapping ──

const EXPORT_FORMATS: Record<GoogleDocMimeType, {mimeType: string; extension: string}> = {
  'application/vnd.google-apps.document': {
    mimeType: 'text/html',
    extension: 'html',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'text/csv',
    extension: 'csv',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/pdf',
    extension: 'pdf',
  },
};

// ── Migration Engine ──

export class DocsMigrator {
  private config: DocsMigrateConfig;

  constructor(config: DocsMigrateConfig) {
    this.config = {concurrency: 3, ...config};
  }

  /**
   * Run the full docs migration.
   */
  async migrate(
    onProgress?: (docName: string, current: number, total: number) => void,
  ): Promise<DocsMigrateResult> {
    const startTime = Date.now();
    const result: DocsMigrateResult = {
      userId: this.config.userId,
      totalDocs: 0,
      migratedDocs: 0,
      failedDocs: 0,
      skippedDocs: 0,
      sheetsExported: 0,
      slidesExported: 0,
      durationMs: 0,
      errors: [],
    };

    // 1. List all Google Docs files
    const docs = await this.listGoogleDocs();
    result.totalDocs = docs.length;

    // 2. Export and convert each document
    let processed = 0;
    for (const doc of docs) {
      processed++;

      try {
        const exported = await this.exportDoc(doc);

        if (!this.config.dryRun) {
          // Convert to Anvil format and save
          await this.convertAndSave(exported);
        }

        result.migratedDocs++;
        if (doc.mimeType === 'application/vnd.google-apps.spreadsheet') result.sheetsExported++;
        if (doc.mimeType === 'application/vnd.google-apps.presentation') result.slidesExported++;
      } catch (err: any) {
        result.failedDocs++;
        result.errors.push({
          docId: doc.id,
          docName: doc.name,
          error: err.message ?? 'Unknown error',
        });
      }

      onProgress?.(doc.name, processed, result.totalDocs);

      // Rate limiting
      if (processed % 5 === 0) {
        await this.sleep(500);
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * List all Google Docs/Sheets/Slides.
   */
  private async listGoogleDocs(): Promise<GoogleDoc[]> {
    const mimeTypes = Object.keys(EXPORT_FORMATS).map(m => `mimeType='${m}'`).join(' or ');
    const query = `trashed=false and (${mimeTypes})`;

    // In production:
    // const response = await fetch(
    //   `https://www.googleapis.com/drive/v3/files?` +
    //   `fields=nextPageToken,files(id,name,mimeType,parents,createdTime,modifiedTime,lastModifyingUser)` +
    //   `&pageSize=500&q=${encodeURIComponent(query)}`,
    //   {headers: {Authorization: `Bearer ${this.config.accessToken}`}},
    // );

    return [];
  }

  /**
   * Export a Google Doc via the Drive API export endpoint.
   */
  private async exportDoc(doc: GoogleDoc): Promise<ExportedDoc> {
    const format = EXPORT_FORMATS[doc.mimeType];

    // In production:
    // const response = await fetch(
    //   `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(format.mimeType)}`,
    //   {headers: {Authorization: `Bearer ${this.config.accessToken}`}},
    // );
    // const content = Buffer.from(await response.arrayBuffer());

    const exported: ExportedDoc = {
      id: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      content: Buffer.alloc(0),
      exportMimeType: format.mimeType,
    };

    // Convert Google Docs HTML to Markdown
    if (doc.mimeType === 'application/vnd.google-apps.document') {
      exported.markdown = this.htmlToMarkdown(exported.content.toString('utf-8'));
    }

    return exported;
  }

  /**
   * Convert HTML to Markdown (simplified).
   * In production, use turndown or similar library.
   */
  private htmlToMarkdown(html: string): string {
    return html
      // Headers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      // Bold / italic
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      // Links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      // Images
      .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
      // Lists
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      // Paragraphs
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      // Line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      // Strip remaining tags
      .replace(/<[^>]+>/g, '')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Convert exported doc to Anvil format and save.
   */
  private async convertAndSave(exported: ExportedDoc): Promise<void> {
    // In production: POST to Anvil Docs API
    // await fetch(`${this.config.docsApiUrl}/api/docs`, {
    //   method: 'POST',
    //   headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${...}`},
    //   body: JSON.stringify({
    //     title: exported.name,
    //     content: exported.markdown ?? exported.content.toString('utf-8'),
    //     format: exported.mimeType === 'application/vnd.google-apps.document' ? 'markdown' : 'raw',
    //     metadata: {
    //       source: 'google-docs',
    //       sourceId: exported.id,
    //       exportFormat: exported.exportMimeType,
    //     },
    //   }),
    // });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Batch Helper ──

/**
 * Estimate migration size without running it.
 */
export async function estimateDocsMigration(
  accessToken: string,
  userId: string,
): Promise<{docCount: number; sheetCount: number; slideCount: number; estimatedTimeMinutes: number}> {
  // In production: query Drive API for counts
  return {docCount: 0, sheetCount: 0, slideCount: 0, estimatedTimeMinutes: 0};
}
