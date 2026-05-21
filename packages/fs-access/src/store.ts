/**
 * IndexedDB store for File System Access handles.
 *
 * File System Access handles (FileSystemFileHandle, FileSystemDirectoryHandle)
 * are structured-cloneable and can be stored directly in IndexedDB.
 * This persists them across page reloads and sessions.
 */

import type { SyncedFileHandle } from './types.js';

const DB_NAME = 'anvil-fs-access';
const DB_VERSION = 1;
const STORE_NAME = 'synced-handles';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('driveFileId', 'driveFileId', { unique: false });
        store.createIndex('drivePath', 'drivePath', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error}`));
    };
  });
}

/** Get a transaction + object store */
async function getStore(mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

/** Wrap an IDB request in a promise */
function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Public API ──────────────────────────────────────────

/** Store a synced file handle */
export async function putSyncedHandle(handle: SyncedFileHandle): Promise<void> {
  const store = await getStore('readwrite');
  await reqToPromise(store.put(handle));
}

/** Get a synced file handle by its unique ID */
export async function getSyncedHandle(id: string): Promise<SyncedFileHandle | undefined> {
  const store = await getStore('readonly');
  return reqToPromise(store.get(id));
}

/** Get all synced file handles */
export async function getAllSyncedHandles(): Promise<SyncedFileHandle[]> {
  const store = await getStore('readonly');
  return reqToPromise(store.getAll());
}

/** Get all handles for a specific Drive file */
export async function getHandlesForDriveFile(driveFileId: string): Promise<SyncedFileHandle[]> {
  const store = await getStore('readonly');
  const index = store.index('driveFileId');
  return reqToPromise(index.getAll(driveFileId));
}

/** Remove a synced file handle */
export async function deleteSyncedHandle(id: string): Promise<void> {
  const store = await getStore('readwrite');
  await reqToPromise(store.delete(id));
}

/** Update the status of a synced handle */
export async function updateSyncStatus(
  id: string,
  status: SyncedFileHandle['status'],
  error?: string,
): Promise<void> {
  const handle = await getSyncedHandle(id);
  if (!handle) return;
  handle.status = status;
  if (error !== undefined) handle.error = error;
  await putSyncedHandle(handle);
}

/** Clear all synced handles */
export async function clearAllHandles(): Promise<void> {
  const store = await getStore('readwrite');
  await reqToPromise(store.clear());
}
