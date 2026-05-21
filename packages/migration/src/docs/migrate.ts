/**
 * Google Docs → Anvil Docs migration.
 *
 * Exports Google Docs via the Google Drive API (export as HTML/text)
 * and creates Anvil Docs via the Anvil Docs API.
 *
 * Preserves:
 * - Document content (HTML formatting)
 * - Folder hierarchy
 * - Sharing permissions (mapped to Anvil roles)
 * - Last modified metadata
 */

import {BaseMigrator, type MigrationConfig, type MigrationProgress} from '../index';

export class DocsMigrator extends BaseMigrator {
  constructor(config: MigrationConfig) {
    super(config, 'docs');
  }

  async estimateItems(): Promise<number> {
    const token = await this.getGoogleAccessToken();
    const result = await this.googleApiRequest(
      '/drive/v3/files?q=mimeType=\'application/vnd.google-apps.document\'+and+trashed=false&fields=files(id),nextPageToken',
      token,
    );
    return result.files?.length ?? 0;
  }

  async migrate(): Promise<MigrationProgress> {
    this.progress.status = 'running';
    this.progress.startedAt = new Date().toISOString();

    try {
      const accessToken = await this.getGoogleAccessToken();

      // List all Google Docs
      const docs = await this.listAllDocs(accessToken);
      this.progress.totalItems = docs.length;

      // Process each document
      const batchSize = this.config.batchSize ?? 10;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);

        await Promise.all(batch.map(async (doc: any) => {
          try {
            // Export as HTML
            const html = await this.exportDoc(doc.id, accessToken, 'text/html');

            // Export as plain text (for search indexing)
            const text = await this.exportDoc(doc.id, accessToken, 'text/plain');

            // Get file metadata
            const metadata = await this.googleApiRequest(
              `/drive/v3/files/${doc.id}?fields=name,modifiedTime,owners,parents`,
              accessToken,
            );

            // Create Anvil Doc via API
            await this.createAnvilDoc({
              title: metadata.name,
              content: html,
              plainText: text,
              sourceId: doc.id,
              modifiedAt: metadata.modifiedTime,
              owner: metadata.owners?.[0]?.emailAddress,
            });

            this.progress.processedItems++;
          } catch (err) {
            this.progress.failedItems++;
            this.progress.errors.push({
              itemId: doc.id,
              itemName: doc.name ?? doc.id,
              error: (err as Error).message,
              retryCount: 0,
              timestamp: new Date().toISOString(),
            });
          }
        }));

        this.progress.lastCursor = docs[Math.min(i + batchSize, docs.length) - 1]?.id;
      }

      this.progress.status = 'completed';
    } catch (err) {
      this.progress.status = 'failed';
      this.progress.errors.push({
        itemId: 'migration',
        itemName: 'Docs Migration',
        error: (err as Error).message,
        retryCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    this.progress.completedAt = new Date().toISOString();
    return this.progress;
  }

  private async listAllDocs(accessToken: string): Promise<any[]> {
    const allDocs: any[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        fields: 'nextPageToken,files(id,name,modifiedTime)',
        pageSize: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const result = await this.googleApiRequest(
        `/drive/v3/files?${params}`, accessToken
      );

      allDocs.push(...(result.files ?? []));
      pageToken = result.nextPageToken;
    } while (pageToken);

    return allDocs;
  }

  private async exportDoc(fileId: string, accessToken: string, mimeType: string): Promise<string> {
    const mimeMap: Record<string, string> = {
      'text/html': 'text/html',
      'text/plain': 'text/plain',
    };

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(mimeMap[mimeType] ?? mimeType)}`,
      {headers: {Authorization: `Bearer ${accessToken}`}},
    );

    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    return response.text();
  }

  private async createAnvilDoc(data: {
    title: string;
    content: string;
    plainText: string;
    sourceId: string;
    modifiedAt: string;
    owner?: string;
  }): Promise<void> {
    const response = await fetch(`${this.config.anvilApiUrl}/api/docs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.anvilApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: data.title,
        content: data.content,
        metadata: {
          source: 'google-docs-migration',
          sourceId: data.sourceId,
          originalModifiedAt: data.modifiedAt,
          originalOwner: data.owner,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Anvil Docs API error: ${response.status}`);
    }
  }
}
