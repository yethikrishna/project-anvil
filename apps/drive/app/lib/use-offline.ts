'use client';

/**
 * Drive offline hook — uses @anvil/offline Dexie layer
 * to cache file listings and queue uploads when offline.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { offline, type OfflineRecord } from '@anvil/offline';

const APP = 'drive';
const COLLECTION = 'files';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string | null;
  size: number;
  isDirectory: boolean;
  createdAt: string;
  updatedAt: string;
  path: string;
}

export function useDriveOffline() {
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    offline.init().then(() => setReady(true));

    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  /** Cache files from server response into IndexedDB. */
  const cacheFiles = useCallback(async (files: DriveFile[]) => {
    if (!ready) return;
    await offline.upsertFromServer(APP, COLLECTION, files as unknown as Record<string, unknown>[]);
  }, [ready]);

  /** Get cached file listing (fallback when offline). */
  const getCachedFiles = useCallback(async (): Promise<DriveFile[]> => {
    if (!ready) return [];
    const records = await offline.list(APP, COLLECTION);
    return records.map(r => r.data as unknown as DriveFile);
  }, [ready]);

  /** Queue a file for upload when back online. */
  const queueUpload = useCallback(async (file: {
    name: string;
    path: string;
    size: number;
    mimeType: string;
  }) => {
    if (!ready) return;
    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await offline.save(APP, 'pending-uploads', {
      id,
      ...file,
      status: 'queued',
      createdAt: new Date().toISOString(),
    });
    return id;
  }, [ready]);

  /** Get pending uploads. */
  const getPendingUploads = useCallback(async () => {
    if (!ready) return [];
    return offline.list(APP, 'pending-uploads');
  }, [ready]);

  /** Remove a pending upload from queue. */
  const removePendingUpload = useCallback(async (id: string) => {
    if (!ready) return;
    await offline.remove(APP, 'pending-uploads', id);
  }, [ready]);

  /** Get sync stats. */
  const getStats = useCallback(async () => {
    if (!ready) return { totalRecords: 0, pendingSync: 0, byApp: {} as Record<string, number> };
    return offline.getStats();
  }, [ready]);

  return {
    ready,
    isOnline,
    cacheFiles,
    getCachedFiles,
    queueUpload,
    getPendingUploads,
    removePendingUpload,
    getStats,
  };
}
