/**
 * @anvil/fs-access — File System Access API types
 *
 * Extends the standard DOM types for the File System Access API
 * and defines Anvil-specific sync types.
 */

// ── File System Access API browser types ──────────────────

export interface FileSystemFileHandle extends globalThis.FileSystemFileHandle {
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemDirectoryHandle extends globalThis.FileSystemDirectoryHandle {
  kind: 'directory';
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string | { type: string; data?: BufferSource | Blob | string; position?: number; size?: number }): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

export interface ShowOpenFilePickerOptions {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  id?: string;
}

export interface ShowSaveFilePickerOptions {
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  id?: string;
}

// ── Extended window interface ─────────────────────────────

export interface FileSystemAccessWindow {
  showOpenFilePicker(options?: ShowOpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: ShowSaveFilePickerOptions): Promise<FileSystemFileHandle>;
}

// ── Anvil sync types ──────────────────────────────────────

/** Metadata about a local file handle stored in IndexedDB */
export interface SyncedFileHandle {
  /** Unique ID for this sync binding */
  id: string;
  /** Drive file ID this local file is synced with */
  driveFileId: string;
  /** Original file name */
  name: string;
  /** MIME type from last sync */
  mimeType: string;
  /** File size from last sync */
  size: number;
  /** Last known modification time of the local file */
  localLastModified: number;
  /** Last sync timestamp (ms since epoch) */
  lastSyncedAt: number;
  /** Drive path for the synced file */
  drivePath: string;
  /** Serialized FileSystemHandle (IndexedDB can store these) */
  handle: FileSystemFileHandle;
  /** Sync direction */
  direction: 'upload' | 'download' | 'bidirectional';
  /** Current sync status */
  status: 'idle' | 'syncing' | 'conflict' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

/** Result of a sync operation */
export interface SyncResult {
  direction: 'upload' | 'download' | 'none';
  status: 'success' | 'conflict' | 'error' | 'no-change';
  message?: string;
  localModified?: number;
  remoteModified?: string;
}

/** Drive API file entry (subset we need) */
export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string | null;
  size: number;
  updatedAt: string;
  path: string;
  s3Key?: string | null;
  isDirectory: boolean;
}

/** Callback for sync status changes */
export type SyncStatusCallback = (handleId: string, status: SyncedFileHandle['status'], error?: string) => void;
