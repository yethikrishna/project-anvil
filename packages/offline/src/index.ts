/**
 * @anvil/offline — Dexie.js-powered offline layer for Anvil apps.
 *
 * Provides:
 * - Per-app database namespaces (docs, email, drive, search)
 * - Typed CRUD with offline-first writes
 * - Sync queue (pending writes replay when online)
 * - Storage quota tracking
 * - Conflict resolution hooks
 *
 * Usage:
 *   import { offline } from '@anvil/offline';
 *   await offline.init();
 *   await offline.save('drive', 'files', { id: 'f1', name: 'doc.pdf', ... });
 *   const files = await offline.list('drive', 'files');
 */

import Dexie, { type Table } from 'dexie';

// ── Types ──

export interface OfflineRecord {
  id: string;
  app: string;
  collection: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  version: number;
}

export interface SyncQueueItem {
  id?: number;
  operation: 'create' | 'update' | 'delete';
  app: string;
  collection: string;
  recordId: string;
  data?: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
  lastError?: string;
}

export type ConflictResolution = 'server-wins' | 'client-wins' | 'merge' | 'manual';

export interface OfflineConfig {
  dbName?: string;
  maxStorageMB?: number;
  syncIntervalMs?: number;
  conflictResolution?: ConflictResolution;
  onSync?: (items: SyncQueueItem[]) => Promise<void>;
}

// ── Dexie Database ──

class AnvilDB extends Dexie {
  records!: Table<OfflineRecord, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      records: 'id, app, collection, [app+collection], syncStatus, updatedAt',
      syncQueue: '++id, app, collection, recordId, timestamp',
    });
  }
}

// ── Offline Manager ──

export class OfflineManager {
  private db: AnvilDB;
  private config: Required<Pick<OfflineConfig, 'maxStorageMB' | 'syncIntervalMs' | 'conflictResolution'>> & OfflineConfig;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(config: OfflineConfig = {}) {
    this.config = {
      dbName: 'anvil-offline',
      maxStorageMB: 50,
      syncIntervalMs: 30000,
      conflictResolution: 'server-wins',
      ...config,
    };
    this.db = new AnvilDB(this.config.dbName!);
  }

  /** Initialize the offline layer and start auto-sync. */
  async init(): Promise<void> {
    if (this.initialized) return;
    // Dexie opens lazily, but we force-open to verify schema
    await this.db.open();
    this.initialized = true;

    if (this.config.syncIntervalMs > 0 && typeof window !== 'undefined') {
      this.syncTimer = setInterval(() => this.trySync(), this.config.syncIntervalMs);
      window.addEventListener('online', () => this.trySync());
    }
  }

  /** Save a new record offline. */
  async save(app: string, collection: string, data: Record<string, unknown>): Promise<OfflineRecord> {
    const now = new Date().toISOString();
    const id = (data.id as string) || `${app}_${collection}_${Date.now()}`;

    const record: OfflineRecord = {
      id,
      app,
      collection,
      data,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      version: 1,
    };

    await this.db.records.put(record);
    await this.enqueue('create', app, collection, id, data, now);
    return record;
  }

  /** Update an existing record offline. */
  async update(app: string, collection: string, id: string, data: Partial<Record<string, unknown>>): Promise<OfflineRecord | null> {
    const existing = await this.db.records.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: OfflineRecord = {
      ...existing,
      data: { ...existing.data, ...data },
      updatedAt: now,
      syncStatus: 'pending',
      version: existing.version + 1,
    };

    await this.db.records.put(updated);
    await this.enqueue('update', app, collection, id, updated.data, now);
    return updated;
  }

  /** Get a single record by ID. */
  async get(app: string, collection: string, id: string): Promise<OfflineRecord | null> {
    const record = await this.db.records.get(id);
    if (record && record.app === app && record.collection === collection) {
      return record;
    }
    return null;
  }

  /** List all records for an app + collection. */
  async list(app: string, collection: string): Promise<OfflineRecord[]> {
    return this.db.records
      .where('[app+collection]')
      .equals([app, collection])
      .toArray();
  }

  /** Delete a record offline. */
  async remove(app: string, collection: string, id: string): Promise<void> {
    await this.db.records.delete(id);
    await this.enqueue('delete', app, collection, id, undefined, new Date().toISOString());
  }

  /** Count records for an app + collection. */
  async count(app: string, collection: string): Promise<number> {
    return this.db.records
      .where('[app+collection]')
      .equals([app, collection])
      .count();
  }

  /** Get all pending sync items, ordered by timestamp. */
  async getPendingSync(): Promise<SyncQueueItem[]> {
    return this.db.syncQueue.orderBy('timestamp').toArray();
  }

  /** Try to sync pending items. */
  async trySync(): Promise<{ synced: number; failed: number }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingSync();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    if (!this.config.onSync) return { synced: 0, failed: 0 };

    try {
      await this.config.onSync(pending);
      // Mark records as synced and remove queue items
      const ids = pending.map(p => p.recordId);
      await this.db.transaction('rw', [this.db.records, this.db.syncQueue], async () => {
        for (const id of ids) {
          const r = await this.db.records.get(id);
          if (r) {
            r.syncStatus = 'synced';
            r.syncedAt = new Date().toISOString();
            await this.db.records.put(r);
          }
        }
        for (const item of pending) {
          if (item.id) await this.db.syncQueue.delete(item.id);
        }
      });
      return { synced: pending.length, failed: 0 };
    } catch (err) {
      // Increment retry counts
      await this.db.transaction('rw', this.db.syncQueue, async () => {
        for (const item of pending) {
          item.retryCount++;
          item.lastError = (err as Error).message;
          if (item.id) {
            if (item.retryCount < 5) {
              await this.db.syncQueue.put(item);
            } else {
              await this.db.syncQueue.delete(item.id);
            }
          }
        }
      });
      return { synced: 0, failed: pending.length };
    }
  }

  /** Mark records from server as synced (for seeding / initial fetch). */
  async upsertFromServer(app: string, collection: string, records: Record<string, unknown>[]): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    await this.db.transaction('rw', this.db.records, async () => {
      for (const data of records) {
        const id = (data.id as string) || `${app}_${collection}_${Date.now()}_${count}`;
        const existing = await this.db.records.get(id);
        if (existing) {
          // Server-wins: update local with server data
          if (this.config.conflictResolution === 'server-wins' || existing.syncStatus === 'synced') {
            await this.db.records.put({
              ...existing,
              data: { ...existing.data, ...data },
              updatedAt: now,
              syncedAt: now,
              syncStatus: 'synced',
            });
          }
          // client-wins: keep local if pending
        } else {
          await this.db.records.put({
            id,
            app,
            collection,
            data,
            createdAt: now,
            updatedAt: now,
            syncedAt: now,
            syncStatus: 'synced',
            version: 1,
          });
        }
        count++;
      }
    });
    return count;
  }

  /** Get storage stats. */
  async getStats(): Promise<{
    totalRecords: number;
    pendingSync: number;
    byApp: Record<string, number>;
    storageEstimate?: { usage: number; quota: number };
  }> {
    const allRecords = await this.db.records.toArray();
    const pending = await this.getPendingSync();
    const byApp: Record<string, number> = {};
    for (const r of allRecords) {
      byApp[r.app] = (byApp[r.app] || 0) + 1;
    }

    let storageEstimate;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      storageEstimate = { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }

    return {
      totalRecords: allRecords.length,
      pendingSync: pending.length,
      byApp,
      storageEstimate,
    };
  }

  /** Clear all offline data. */
  async clear(): Promise<void> {
    await this.db.records.clear();
    await this.db.syncQueue.clear();
  }

  /** Destroy the manager (stop sync). */
  destroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.db.close();
    this.initialized = false;
  }

  // ── Internals ──

  private async enqueue(
    operation: SyncQueueItem['operation'],
    app: string,
    collection: string,
    recordId: string,
    data: Record<string, unknown> | undefined,
    timestamp: string,
  ): Promise<void> {
    await this.db.syncQueue.add({
      operation,
      app,
      collection,
      recordId,
      data,
      timestamp,
      retryCount: 0,
    });
  }
}

// ── Default singleton ──

export const offline = new OfflineManager();
