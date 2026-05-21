/**
 * @anvil/fs-access — React hooks for File System Access API
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  SyncedFileHandle,
  SyncResult,
  DriveFileEntry,
  SyncStatusCallback,
} from './types';
import {
  SyncEngine,
  openAndSync,
  saveFromDrive,
  isFileSystemAccessSupported,
} from './sync-engine';
import type { SyncEngineConfig } from './sync-engine';
import { getAllSyncedHandles, deleteSyncedHandle } from './store';

export type { SyncEngineConfig } from './sync-engine';
export type { SyncedFileHandle, SyncResult, DriveFileEntry } from './types';

// ── useFileSystemAccess hook ─────────────────────────────

export interface UseFileSystemAccessOptions {
  /** Drive API base URL */
  apiBaseUrl: string;
  /** Current Drive path (where to upload files) */
  drivePath: string;
  /** Auth token getter (default: reads sessionStorage) */
  getToken?: () => string | null;
  /** Auto-sync interval in ms (default: 30s). Set 0 to disable. */
  syncInterval?: number;
  /** Maximum file size for auto-sync (default: 50MB) */
  maxFileSize?: number;
  /** Called when a sync operation completes */
  onSync?: (result: SyncResult, handleId: string) => void;
  /** Called when files change (after upload/download) */
  onFilesChanged?: () => void;
}

export interface UseFileSystemAccessReturn {
  /** Whether the File System Access API is supported */
  supported: boolean;
  /** Currently tracked sync handles */
  syncHandles: SyncedFileHandle[];
  /** Whether background sync is running */
  syncing: boolean;
  /** Whether an operation is in progress */
  loading: boolean;
  /** Last error */
  error: string | null;
  /** Open native file picker → upload to Drive → track for sync */
  openFromDevice: () => Promise<{ syncHandle: SyncedFileHandle; driveFile: DriveFileEntry } | null>;
  /** Download from Drive → save to local device → track for sync */
  saveToDevice: (driveFileId: string, suggestedName?: string) => Promise<{ syncHandle: SyncedFileHandle } | null>;
  /** Manually trigger sync for all handles */
  syncAll: () => Promise<SyncResult[]>;
  /** Manually trigger sync for one handle */
  syncOne: (handleId: string) => Promise<SyncResult>;
  /** Remove a sync binding */
  removeSync: (handleId: string) => Promise<void>;
  /** Resolve a conflict */
  resolveConflict: (handleId: string, direction: 'upload' | 'download') => Promise<SyncResult>;
  /** Refresh the list of sync handles */
  refresh: () => Promise<void>;
}

export function useFileSystemAccess(options: UseFileSystemAccessOptions): UseFileSystemAccessReturn {
  const {
    apiBaseUrl,
    drivePath,
    getToken,
    syncInterval = 30_000,
    maxFileSize,
    onSync,
    onFilesChanged,
  } = options;

  const supported = useMemo(() => isFileSystemAccessSupported(), []);
  const [syncHandles, setSyncHandles] = useState<SyncedFileHandle[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  // Build sync engine config
  const engineConfig: SyncEngineConfig = useMemo(() => ({
    apiBaseUrl,
    getToken: getToken ?? (() => sessionStorage.getItem('anvil_access_token')),
    syncInterval: syncInterval || undefined,
    maxFileSize,
  }), [apiBaseUrl, getToken, syncInterval, maxFileSize]);

  // Status callback
  const onStatusChange = useCallback<SyncStatusCallback>((handleId, status, err) => {
    // Refresh handles whenever status changes
    getAllSyncedHandles().then(setSyncHandles);
    if (status === 'error' && err) {
      setError(err);
    }
  }, []);

  // Initialize engine and load handles
  useEffect(() => {
    if (!supported) return;

    // Load existing handles
    getAllSyncedHandles().then(setSyncHandles);

    // Create and start the sync engine
    const engine = new SyncEngine(engineConfig, onStatusChange);
    engineRef.current = engine;

    if (syncInterval > 0) {
      engine.start();
      setSyncing(true);
    }

    return () => {
      engine.stop();
      engineRef.current = null;
      setSyncing(false);
    };
  }, [supported, engineConfig, syncInterval, onStatusChange]);

  const refresh = useCallback(async () => {
    const handles = await getAllSyncedHandles();
    setSyncHandles(handles);
  }, []);

  const openFromDevice = useCallback(async () => {
    if (!supported) return null;
    setLoading(true);
    setError(null);

    try {
      const result = await openAndSync(engineConfig, drivePath, onStatusChange);
      if (result) {
        await refresh();
        onFilesChanged?.();
        onSync?.({ direction: 'upload', status: 'success' }, result.syncHandle.id);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [supported, engineConfig, drivePath, onStatusChange, refresh, onFilesChanged, onSync]);

  const saveToDevice = useCallback(async (driveFileId: string, suggestedName?: string) => {
    if (!supported) return null;
    setLoading(true);
    setError(null);

    try {
      const result = await saveFromDrive(engineConfig, driveFileId, drivePath, suggestedName, onStatusChange);
      if (result) {
        await refresh();
        onSync?.({ direction: 'download', status: 'success' }, result.syncHandle.id);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [supported, engineConfig, drivePath, onStatusChange, refresh, onSync]);

  const syncAll = useCallback(async () => {
    if (!engineRef.current) return [];
    return engineRef.current.syncAll();
  }, []);

  const syncOne = useCallback(async (handleId: string) => {
    if (!engineRef.current) return { direction: 'none' as const, status: 'error' as const, message: 'Engine not initialized' };
    const result = await engineRef.current.syncSingle(handleId);
    await refresh();
    onSync?.(result, handleId);
    return result;
  }, [refresh, onSync]);

  const removeSync = useCallback(async (handleId: string) => {
    await engineRef.current?.removeHandle(handleId);
    await deleteSyncedHandle(handleId);
    await refresh();
  }, [refresh]);

  const resolveConflict = useCallback(async (handleId: string, direction: 'upload' | 'download') => {
    if (!engineRef.current) return { direction: 'none' as const, status: 'error' as const, message: 'Engine not initialized' };
    const result = await engineRef.current.resolveConflict(handleId, direction);
    await refresh();
    onSync?.(result, handleId);
    onFilesChanged?.();
    return result;
  }, [refresh, onSync, onFilesChanged]);

  return {
    supported,
    syncHandles,
    syncing,
    loading,
    error,
    openFromDevice,
    saveToDevice,
    syncAll,
    syncOne,
    removeSync,
    resolveConflict,
    refresh,
  };
}
