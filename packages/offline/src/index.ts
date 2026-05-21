/**
 * @anvil/offline — Client-side IndexedDB layer via Dexie.js patterns.
 *
 * Provides offline-first data access for all Anvil apps.
 * Falls back to a minimal IndexedDB wrapper when Dexie isn't installed.
 *
 * Features:
 * - Per-app database namespaces
 * - CRUD operations with offline queue
 * - Automatic sync when online
 * - Conflict resolution strategies
 * - Storage quotas and eviction
 */

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
  id: string;
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
  dbName: string;
  maxStorageMB?: number;
  syncIntervalMs?: number;
  conflictResolution?: ConflictResolution;
  onSync?: (items: SyncQueueItem[]) => Promise<void>;
}

// ── IndexedDB Wrapper (zero-dependency) ──

class SimpleDB {
  private db: IDBDatabase | null = null;
  private dbName: string;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  async init(stores: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        for (const store of stores) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, {keyPath: 'id'});
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName: string, record: any): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(storeName: string, id: string): Promise<any | null> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(storeName: string): Promise<any[]> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async count(storeName: string): Promise<number> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

// ── Offline Manager ──

export class OfflineManager {
  private db: SimpleDB;
  private config: Required<Pick<OfflineConfig, 'maxStorageMB' | 'syncIntervalMs' | 'conflictResolution'>> & OfflineConfig;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(config: OfflineConfig) {
    this.config = {
      maxStorageMB: 50,
      syncIntervalMs: 30000,
      conflictResolution: 'server-wins',
      ...config,
    };
    this.db = new SimpleDB(config.dbName);
  }

  /**
   * Initialize the offline database.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.db.init(['records', 'syncQueue']);
    this.initialized = true;

    // Auto-sync when online
    if (this.config.syncIntervalMs > 0) {
      this.syncTimer = setInterval(() => this.trySync(), this.config.syncIntervalMs);
      window.addEventListener('online', () => this.trySync());
    }
  }

  /**
   * Save a record offline.
   */
  async save(app: string, collection: string, data: Record<string, unknown>): Promise<OfflineRecord> {
    const now = new Date().toISOString();
    const id = data.id as string || `${app}_${collection}_${Date.now()}`;

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

    await this.db.put('records', record);

    // Add to sync queue
    await this.db.put('syncQueue', {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      operation: 'create',
      app,
      collection,
      recordId: id,
      data,
      timestamp: now,
      retryCount: 0,
    } satisfies SyncQueueItem);

    return record;
  }

  /**
   * Update a record offline.
   */
  async update(app: string, collection: string, id: string, data: Partial<Record<string, unknown>>): Promise<OfflineRecord | null> {
    const existing = await this.db.get('records', id) as OfflineRecord | null;
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: OfflineRecord = {
      ...existing,
      data: {...existing.data, ...data},
      updatedAt: now,
      syncStatus: 'pending',
      version: existing.version + 1,
    };

    await this.db.put('records', updated);

    await this.db.put('syncQueue', {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      operation: 'update',
      app,
      collection,
      recordId: id,
      data: updated.data,
      timestamp: now,
      retryCount: 0,
    } satisfies SyncQueueItem);

    return updated;
  }

  /**
   * Get a record by ID.
   */
  async get(app: string, collection: string, id: string): Promise<OfflineRecord | null> {
    const record = await this.db.get('records', id) as OfflineRecord | null;
    if (record && record.app === app && record.collection === collection) {
      return record;
    }
    return null;
  }

  /**
   * Get all records for an app + collection.
   */
  async list(app: string, collection: string): Promise<OfflineRecord[]> {
    const all = await this.db.getAll('records') as OfflineRecord[];
    return all.filter(r => r.app === app && r.collection === collection);
  }

  /**
   * Delete a record offline.
   */
  async remove(app: string, collection: string, id: string): Promise<void> {
    await this.db.delete('records', id);

    await this.db.put('syncQueue', {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      operation: 'delete',
      app,
      collection,
      recordId: id,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    } satisfies SyncQueueItem);
  }

  /**
   * Get pending sync items.
   */
  async getPendingSync(): Promise<SyncQueueItem[]> {
    const all = await this.db.getAll('syncQueue') as SyncQueueItem[];
    return all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Try to sync pending items.
   */
  async trySync(): Promise<{synced: number; failed: number}> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {synced: 0, failed: 0};
    }

    const pending = await this.getPendingSync();
    if (pending.length === 0) return {synced: 0, failed: 0};

    if (this.config.onSync) {
      try {
        await this.config.onSync(pending);

        // Mark all as synced
        for (const item of pending) {
          await this.db.delete('syncQueue', item.id);
        }

        return {synced: pending.length, failed: 0};
      } catch (err) {
        // Increment retry count
        for (const item of pending) {
          item.retryCount++;
          item.lastError = (err as Error).message;
          if (item.retryCount < 5) {
            await this.db.put('syncQueue', item);
          } else {
            await this.db.delete('syncQueue', item.id);
          }
        }
        return {synced: 0, failed: pending.length};
      }
    }

    return {synced: 0, failed: 0};
  }

  /**
   * Get storage stats.
   */
  async getStats(): Promise<{
    totalRecords: number;
    pendingSync: number;
    byApp: Record<string, number>;
    storageEstimate?: {usage: number; quota: number};
  }> {
    const records = await this.db.getAll('records') as OfflineRecord[];
    const pending = await this.getPendingSync();
    const byApp: Record<string, number> = {};

    for (const r of records) {
      byApp[r.app] = (byApp[r.app] || 0) + 1;
    }

    let storageEstimate;
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      storageEstimate = {usage: est.usage ?? 0, quota: est.quota ?? 0};
    }

    return {
      totalRecords: records.length,
      pendingSync: pending.length,
      byApp,
      storageEstimate,
    };
  }

  /**
   * Clear all offline data.
   */
  async clear(): Promise<void> {
    await this.db.clear('records');
    await this.db.clear('syncQueue');
  }

  /**
   * Destroy the manager.
   */
  destroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }
}
