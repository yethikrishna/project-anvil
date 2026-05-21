/**
 * @anvil/fs-access — Sync Engine
 *
 * Bidirectional sync between local File System Access handles
 * and the Anvil Drive API. Supports:
 *   - Upload: local file changed → push to Drive
 *   - Download: Drive file changed → write to local file
 *   - Conflict detection (local + remote both changed)
 *   - Periodic background sync via configurable interval
 */

import type {
  FileSystemFileHandle,
  SyncedFileHandle,
  SyncResult,
  DriveFileEntry,
  SyncStatusCallback,
} from './types';
import {
  putSyncedHandle,
  getSyncedHandle,
  getAllSyncedHandles,
  deleteSyncedHandle,
} from './store';

// ── Configuration ────────────────────────────────────────

export interface SyncEngineConfig {
  /** Drive API base URL */
  apiBaseUrl: string;
  /** Auth token getter (reads from session storage by default) */
  getToken?: () => string | null;
  /** Sync check interval in ms (default: 30s) */
  syncInterval?: number;
  /** Maximum file size for auto-sync in bytes (default: 50MB) */
  maxFileSize?: number;
}

const DEFAULT_SYNC_INTERVAL = 30_000;
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;

// ── Helper: auth headers ─────────────────────────────────

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Helper: generate unique ID ───────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

// ── API calls ────────────────────────────────────────────

async function fetchDriveFile(fileId: string, apiBase: string, token: string | null): Promise<DriveFileEntry> {
  const res = await fetch(`${apiBase}/files/${fileId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch Drive file: ${res.status}`);
  const data = await res.json();
  return data.data as DriveFileEntry;
}

async function uploadToDrive(
  apiBase: string,
  token: string | null,
  file: File,
  drivePath: string,
  existingFileId?: string,
): Promise<DriveFileEntry> {
  const formData = new FormData();
  formData.append('file', file);

  const url = existingFileId
    ? `${apiBase}/files/sync?fileId=${existingFileId}&path=${encodeURIComponent(drivePath)}`
    : `${apiBase}/files/upload?path=${encodeURIComponent(drivePath)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.data as DriveFileEntry;
}

async function getDownloadUrl(apiBase: string, fileId: string, token: string | null): Promise<string> {
  const res = await fetch(`${apiBase}/files/${fileId}/download`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to get download URL: ${res.status}`);
  const data = await res.json();
  return data.data?.url;
}

// ── Sync operations ──────────────────────────────────────

/**
 * Open a native file picker, let the user pick a file,
 * upload it to Drive, and create a sync binding.
 */
export async function openAndSync(
  config: SyncEngineConfig,
  drivePath: string,
  onStatusChange?: SyncStatusCallback,
): Promise<{ syncHandle: SyncedFileHandle; driveFile: DriveFileEntry } | null> {
  const win = window as unknown as {
    showOpenFilePicker?(opts?: {
      multiple?: boolean;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }): Promise<FileSystemFileHandle[]>;
  };

  if (!win.showOpenFilePicker) {
    console.warn('File System Access API not supported in this browser');
    return null;
  }

  const handles = await win.showOpenFilePicker({ multiple: false });
  if (!handles.length) return null;

  const handle = handles[0];
  const token = config.getToken?.() ?? sessionStorage.getItem('anvil_access_token');
  const file = await handle.getFile();

  // Upload to Drive first
  const driveFile = await uploadToDrive(config.apiBaseUrl, token, file, drivePath);

  const syncHandle: SyncedFileHandle = {
    id: uid(),
    driveFileId: driveFile.id,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    localLastModified: file.lastModified,
    lastSyncedAt: Date.now(),
    drivePath,
    handle,
    direction: 'bidirectional',
    status: 'idle',
  };

  await putSyncedHandle(syncHandle);
  return { syncHandle, driveFile };
}

/**
 * Open a native save picker, fetch the Drive file content,
 * save it locally, and create a sync binding.
 */
export async function saveFromDrive(
  config: SyncEngineConfig,
  driveFileId: string,
  drivePath: string,
  suggestedName?: string,
  onStatusChange?: SyncStatusCallback,
): Promise<{ syncHandle: SyncedFileHandle } | null> {
  const win = window as unknown as {
    showSaveFilePicker?(opts?: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }): Promise<FileSystemFileHandle>;
  };

  if (!win.showSaveFilePicker) {
    console.warn('File System Access API not supported in this browser');
    return null;
  }

  const token = config.getToken?.() ?? sessionStorage.getItem('anvil_access_token');

  // Get Drive file metadata
  const driveFile = await fetchDriveFile(driveFileId, config.apiBaseUrl, token);
  const fileName = suggestedName ?? driveFile.name;

  // Get download URL and fetch the content
  const downloadUrl = await getDownloadUrl(config.apiBaseUrl, driveFileId, token);
  const response = await fetch(downloadUrl);
  const blob = await response.blob();

  // Show save picker
  const handle = await win.showSaveFilePicker({ suggestedName: fileName });

  // Write the content to the local file
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();

  const localFile = await handle.getFile();

  const syncHandle: SyncedFileHandle = {
    id: uid(),
    driveFileId: driveFile.id,
    name: fileName,
    mimeType: driveFile.mimeType ?? blob.type,
    size: blob.size,
    localLastModified: localFile.lastModified,
    lastSyncedAt: Date.now(),
    drivePath,
    handle,
    direction: 'bidirectional',
    status: 'idle',
  };

  await putSyncedHandle(syncHandle);
  return { syncHandle };
}

/**
 * Perform a single sync check on one handle.
 * Detects changes and syncs in the appropriate direction.
 */
export async function syncOne(
  handle: SyncedFileHandle,
  config: SyncEngineConfig,
): Promise<SyncResult> {
  const token = config.getToken?.() ?? sessionStorage.getItem('anvil_access_token');
  const maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  try {
    // Check permission to read the local file
    const permStatus = await handle.handle.queryPermission({ mode: 'read' });
    if (permStatus !== 'granted') {
      // Try requesting permission
      const reqStatus = await handle.handle.requestPermission({ mode: 'readwrite' });
      if (reqStatus !== 'granted') {
        return { direction: 'none', status: 'error', message: 'Permission denied for local file' };
      }
    }

    const localFile = await handle.handle.getFile();
    const localModified = localFile.lastModified;

    // Fetch remote metadata
    const remoteFile = await fetchDriveFile(handle.driveFileId, config.apiBaseUrl, token);
    const remoteModified = new Date(remoteFile.updatedAt).getTime();
    const lastSync = handle.lastSyncedAt;

    // Determine what changed
    const localChanged = localModified > lastSync;
    const remoteChanged = remoteModified > lastSync;

    if (!localChanged && !remoteChanged) {
      return { direction: 'none', status: 'no-change' };
    }

    // Conflict: both changed since last sync
    if (localChanged && remoteChanged) {
      await updateHandleStatus(handle.id, 'conflict');
      return {
        direction: 'none',
        status: 'conflict',
        message: 'Both local and remote files changed since last sync',
        localModified,
        remoteModified: remoteFile.updatedAt,
      };
    }

    // Local changed → upload to Drive
    if (localChanged) {
      if (localFile.size > maxFileSize) {
        await updateHandleStatus(handle.id, 'error', `File too large for auto-sync (${(localFile.size / 1024 / 1024).toFixed(1)} MB)`);
        return { direction: 'upload', status: 'error', message: 'File exceeds max auto-sync size' };
      }

      await updateHandleStatus(handle.id, 'syncing');

      // Upload using sync endpoint (updates existing file)
      const updated = await uploadToDrive(
        config.apiBaseUrl,
        token,
        localFile,
        handle.drivePath,
        handle.driveFileId,
      );

      // Update sync metadata
      const updatedHandle: SyncedFileHandle = {
        ...handle,
        size: localFile.size,
        localLastModified: localModified,
        lastSyncedAt: Date.now(),
        status: 'idle',
        error: undefined,
      };
      await putSyncedHandle(updatedHandle);

      return {
        direction: 'upload',
        status: 'success',
        localModified,
        remoteModified: updated.updatedAt,
      };
    }

    // Remote changed → download to local
    if (remoteChanged) {
      await updateHandleStatus(handle.id, 'syncing');

      const downloadUrl = await getDownloadUrl(config.apiBaseUrl, handle.driveFileId, token);
      const response = await fetch(downloadUrl);
      const blob = await response.blob();

      // Write to local file
      const writable = await handle.handle.createWritable();
      await writable.write(blob);
      await writable.close();

      const refreshed = await handle.handle.getFile();

      const updatedHandle: SyncedFileHandle = {
        ...handle,
        size: refreshed.size,
        localLastModified: refreshed.lastModified,
        lastSyncedAt: Date.now(),
        status: 'idle',
        error: undefined,
      };
      await putSyncedHandle(updatedHandle);

      return {
        direction: 'download',
        status: 'success',
        remoteModified: remoteFile.updatedAt,
      };
    }

    return { direction: 'none', status: 'no-change' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateHandleStatus(handle.id, 'error', message);
    return { direction: 'none', status: 'error', message };
  }
}

// ── Background sync loop ─────────────────────────────────

export class SyncEngine {
  private config: SyncEngineConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onStatusChange?: SyncStatusCallback;
  private running = false;

  constructor(config: SyncEngineConfig, onStatusChange?: SyncStatusCallback) {
    this.config = config;
    this.onStatusChange = onStatusChange;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const interval = this.config.syncInterval ?? DEFAULT_SYNC_INTERVAL;

    // Run once immediately
    this.syncAll();

    this.intervalId = setInterval(() => this.syncAll(), interval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Sync all registered handles */
  async syncAll(): Promise<SyncResult[]> {
    let handles: SyncedFileHandle[];
    try {
      handles = await getAllSyncedHandles();
    } catch {
      // IndexedDB not available (Node.js env, privacy mode, etc.)
      return [];
    }
    const results: SyncResult[] = [];

    for (const handle of handles) {
      if (handle.status === 'conflict') continue; // skip conflicted until resolved
      const result = await syncOne(handle, this.config);
      if (result.status !== 'no-change') {
        this.onStatusChange?.(handle.id, (result.status === 'success' ? 'idle' : result.status === 'conflict' ? 'conflict' : 'error') as SyncedFileHandle['status'], result.message);
      }
      results.push(result);
    }

    return results;
  }

  /** Force sync a single handle */
  async syncSingle(handleId: string): Promise<SyncResult> {
    const handle = await getSyncedHandle(handleId);
    if (!handle) return { direction: 'none', status: 'error', message: 'Handle not found' };
    const result = await syncOne(handle, this.config);
    const singleStatus: SyncedFileHandle['status'] =
      result.status === 'success' || result.status === 'no-change' ? 'idle' :
      result.status === 'conflict' ? 'conflict' : 'error';
    this.onStatusChange?.(handle.id, singleStatus, result.message);
    return result;
  }

  /** Remove a sync binding */
  async removeHandle(handleId: string): Promise<void> {
    await deleteSyncedHandle(handleId);
  }

  /** Resolve a conflict by choosing a direction */
  async resolveConflict(handleId: string, direction: 'upload' | 'download'): Promise<SyncResult> {
    const handle = await getSyncedHandle(handleId);
    if (!handle || handle.status !== 'conflict') {
      return { direction: 'none', status: 'error', message: 'No conflict to resolve' };
    }

    // Force the chosen direction by resetting lastSyncedAt to 0
    const forcedHandle: SyncedFileHandle = {
      ...handle,
      lastSyncedAt: 0,
      direction,
      status: 'idle',
    };
    await putSyncedHandle(forcedHandle);

    return this.syncSingle(handleId);
  }

  /** Get all current sync handles */
  async getHandles(): Promise<SyncedFileHandle[]> {
    return getAllSyncedHandles();
  }

  /** Update config at runtime */
  updateConfig(config: Partial<SyncEngineConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.running && config.syncInterval) {
      this.stop();
      this.start();
    }
  }
}

// ── Internal helper ──────────────────────────────────────

async function updateHandleStatus(id: string, status: SyncedFileHandle['status'], error?: string): Promise<void> {
  const handle = await getSyncedHandle(id);
  if (!handle) return;
  handle.status = status;
  if (error !== undefined) handle.error = error;
  await putSyncedHandle(handle);
}

// ── Feature detection ────────────────────────────────────

/**
 * Check if the File System Access API is available in the current browser.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}
