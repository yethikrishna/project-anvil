'use client';

/**
 * Drive — FileSystemAccessPanel
 *
 * UI for the File System Access API integration:
 * - "Open from device" button (native OS file picker → upload to Drive → auto-sync)
 * - "Save to device" button (download from Drive → native save dialog → auto-sync)
 * - Sync status panel showing tracked files with sync state
 * - Conflict resolution UI
 */

import { useState, useCallback } from 'react';
import { useFileSystemAccess } from '@anvil/fs-access/hooks';
import type { SyncedFileHandle, SyncResult } from '@anvil/fs-access';
import { isFileSystemAccessSupported } from '@anvil/fs-access/sync-engine';

interface FileSystemAccessPanelProps {
  apiBaseUrl: string;
  currentPath: string;
  /** Currently selected Drive file for "Save to device" */
  selectedFileId?: string | null;
  selectedFileName?: string | null;
  onFilesChanged: () => void;
}

export function FileSystemAccessPanel({
  apiBaseUrl,
  currentPath,
  selectedFileId,
  selectedFileName,
  onFilesChanged,
}: FileSystemAccessPanelProps) {
  const supported = typeof window !== 'undefined' && isFileSystemAccessSupported();

  const {
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
  } = useFileSystemAccess({
    apiBaseUrl,
    drivePath: currentPath,
    syncInterval: 30_000,
    onFilesChanged,
    onSync: (result, handleId) => {
      if (result.status === 'success') {
        onFilesChanged();
      }
    },
  });

  const [expanded, setExpanded] = useState(false);

  // ── Handlers ────────────────────────────────────────

  const handleOpenFromDevice = useCallback(async () => {
    const result = await openFromDevice();
    if (!result) {
      // Fallback: trigger a regular file input
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = () => {
        // Standard upload via the existing FileUpload component
        // This is the fallback path when FS Access API is not available
        input.remove();
      };
      input.click();
    }
  }, [openFromDevice]);

  const handleSaveToDevice = useCallback(async () => {
    if (!selectedFileId) return;
    await saveToDevice(selectedFileId, selectedFileName ?? undefined);
  }, [saveToDevice, selectedFileId, selectedFileName]);

  // ── Render ──────────────────────────────────────────

  if (!supported) {
    // Graceful fallback: show a note but don't block the UI
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenFromDevice}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Open a file from your device and sync it with Drive"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {loading ? 'Opening...' : 'Open from device'}
        </button>

        {selectedFileId && (
          <button
            onClick={handleSaveToDevice}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Save this file to your device with auto-sync"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {loading ? 'Saving...' : 'Save to device'}
          </button>
        )}

        {/* Sync status indicator */}
        {syncHandles.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {syncHandles.length} synced file{syncHandles.length !== 1 ? 's' : ''}
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => {}} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Sync panel (expanded) */}
      {expanded && syncHandles.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Synced Files</h3>
              <span className="text-xs text-gray-500">
                {syncing ? 'Auto-syncing every 30s' : 'Sync paused'}
              </span>
            </div>
            <button
              onClick={() => syncAll()}
              disabled={loading}
              className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              Sync now
            </button>
          </div>

          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {syncHandles.map(handle => (
              <SyncedFileRow
                key={handle.id}
                handle={handle}
                onSync={() => syncOne(handle.id)}
                onRemove={() => removeSync(handle.id)}
                onResolve={(dir) => resolveConflict(handle.id, dir)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Synced file row ────────────────────────────────────

function SyncedFileRow({
  handle,
  onSync,
  onRemove,
  onResolve,
}: {
  handle: SyncedFileHandle;
  onSync: () => void;
  onRemove: () => void;
  onResolve: (direction: 'upload' | 'download') => void;
}) {
  const timeSince = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86400_000)}d ago`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusIcon = () => {
    switch (handle.status) {
      case 'idle':
        return <span className="w-2 h-2 rounded-full bg-green-500" title="Synced" />;
      case 'syncing':
        return <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Syncing..." />;
      case 'conflict':
        return <span className="w-2 h-2 rounded-full bg-yellow-500" title="Conflict" />;
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-red-500" title={handle.error} />;
    }
  };

  return (
    <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
      {statusIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{handle.name}</p>
        <p className="text-xs text-gray-500">
          {formatSize(handle.size)} · synced {timeSince(handle.lastSyncedAt)}
          {handle.error && <span className="text-red-500 ml-1">· {handle.error}</span>}
        </p>
      </div>

      {handle.status === 'conflict' && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onResolve('upload')}
            className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
            title="Keep local version"
          >
            ↑ Local
          </button>
          <button
            onClick={() => onResolve('download')}
            className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100"
            title="Keep Drive version"
          >
            ↓ Drive
          </button>
        </div>
      )}

      <button
        onClick={onSync}
        disabled={handle.status === 'syncing'}
        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        title="Sync now"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500"
        title="Remove sync"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
