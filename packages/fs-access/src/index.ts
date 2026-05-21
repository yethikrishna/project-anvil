/**
 * @anvil/fs-access — File System Access API integration
 *
 * Provides:
 * - React hooks for native OS file open/save pickers
 * - Bidirectional auto-sync between local files and Anvil Drive
 * - IndexedDB persistence for FileSystemHandle objects
 * - Conflict detection and resolution
 *
 * Browser support: Chromium-based browsers (Chrome, Edge, Opera, Brave)
 * Fallback: standard <input type="file"> and download links
 */

// Types
export type {
  FileSystemFileHandle,
  FileSystemDirectoryHandle,
  FileSystemWritableFileStream,
  FilePickerAcceptType,
  ShowOpenFilePickerOptions,
  ShowSaveFilePickerOptions,
  SyncedFileHandle,
  SyncResult,
  DriveFileEntry,
  SyncStatusCallback,
} from './types';

// Sync engine (can be used without React)
export { SyncEngine, openAndSync, saveFromDrive, syncOne, isFileSystemAccessSupported } from './sync-engine';
export type { SyncEngineConfig } from './sync-engine';

// IndexedDB store (low-level, for custom implementations)
export {
  putSyncedHandle,
  getSyncedHandle,
  getAllSyncedHandles,
  getHandlesForDriveFile,
  deleteSyncedHandle,
  updateSyncStatus,
  clearAllHandles,
} from './store';

// React hooks
export { useFileSystemAccess } from './hooks';
export type { UseFileSystemAccessOptions, UseFileSystemAccessReturn } from './hooks';
