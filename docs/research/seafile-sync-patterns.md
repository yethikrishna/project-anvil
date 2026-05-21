# Seafile Sync Engine Patterns — Drive Clone Desktop/Mobile Sync

**Date:** 2026-05-21
**Status:** Researched

---

## Executive Summary

Seafile is an open-source file sync platform (Apache 2.0, C/Python) known for its efficient sync engine. Unlike Dropbox's full-file approach, Seafile uses content-addressable block-level deduplication and delta sync, achieving 3-5× faster sync for large files. These patterns are directly applicable to Project Anvil's Drive clone for desktop and mobile sync.

---

## Core Sync Architecture

```
Client (Desktop/Mobile)              Server
┌──────────────────┐               ┌──────────────────┐
│ File Watcher      │               │ Sync Server       │
│ (inotify/FSEvents)│               │ (SeafDAV/HTTP)    │
│        ↓          │    HTTP/WS    │        ↓          │
│ Block Splitter    │◄─────────────►│ Block Store       │
│ (content-defined  │               │ (content-addressed│
│  chunking)        │               │  via SHA-1)       │
│        ↓          │               │        ↓          │
│ Transfer Queue    │               │ Commit Log        │
│ (only new blocks) │               │ (versioned trees) │
│        ↓          │               │        ↓          │
│ Local SQLite DB   │               │ PostgreSQL        │
└──────────────────┘               └──────────────────┘
```

---

## Key Patterns

### 1. Content-Defined Chunking (CDC)

Instead of fixed-size blocks, Seafile uses Rabin fingerprinting for content-defined chunking:

```
File: [AAAABBBBCCCCDDDD]        Fixed chunks: [AAAABBBB] [CCCCDDDD]
                                  Insert "X":  [AAAABBBX] [BCCCCDDD] ← all changed

File: [AAAABBBBCCCCDDDD]        CDC chunks:  [AAAA] [BBBB] [CCCC] [DDDD]
                                  Insert "X":  [AAAA] [BXBBB] [CCCC] [DDDD] ← only 1 changed!
```

**Impact:** When a user edits a 1GB file, only the affected ~4KB blocks need to transfer. This is 250× less data than full-file sync.

**Implementation approach:**
```typescript
// Simplified CDC using rolling hash
function contentDefinedChunking(data: Uint8Array, minBlock = 4 * 1024, maxBlock = 8 * 1024 * 1024, targetBlock = 256 * 1024): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let start = 0;

  while (start < data.length) {
    // Find chunk boundary using rolling hash
    let end = Math.min(start + maxBlock, data.length);

    for (let i = start + minBlock; i < end; i++) {
      if (rollingHash(data, i) % targetBlock === 0) {
        end = i;
        break;
      }
    }

    chunks.push(data.slice(start, end));
    start = end;
  }

  return chunks;
}

function rollingHash(data: Uint8Array, pos: number): number {
  // Simple Rabin-like fingerprint
  let hash = 0;
  const window = 48;
  for (let i = Math.max(0, pos - window); i < pos; i++) {
    hash = ((hash * 31) + data[i]) & 0xFFFFFFFF;
  }
  return hash;
}
```

### 2. Content-Addressable Storage (CAS)

Every block is stored by its SHA-256 hash:
```
Block: "Hello, World!" → SHA-256: dffd6021bb2b...
Storage path: blocks/df/df/dffd6021bb2b...
```

**Benefits:**
- Automatic deduplication (identical blocks stored once)
- Integrity verification (hash mismatch = corruption)
- Efficient sync (compare block IDs, not contents)

**Block metadata:**
```typescript
interface FileBlock {
  id: string;           // SHA-256 hex
  size: number;
  compressedSize: number;
  checksum: string;
}

interface FileVersion {
  fileId: string;       // File identifier (persistent across versions)
  version: number;
  blocks: FileBlock[];  // Ordered list of blocks
  blockSize: number;    // Total file size
  modifiedAt: string;
  modifiedBy: string;
}
```

### 3. Delta Sync Protocol

```
Client                                    Server
  │                                          │
  │  1. GET /sync/remote-state?path=/docs    │
  │◄─────────────────────────────────────────│
  │  Remote: [v5, blocks: [a1,b2,c3,d4]]    │
  │                                          │
  │  2. Local:  [v4, blocks: [a1,b2,c3,e5]] │
  │     Diff: blocks changed: d4 vs e5       │
  │                                          │
  │  3. PUT /sync/block/e5                   │
  │─────────────────────────────────────────►│
  │  (sends only changed block ~256KB)       │
  │                                          │
  │  4. POST /sync/commit                    │
  │─────────────────────────────────────────►│
  │  {path: "/docs/file.txt", blocks: [a1,b2,c3,e5], parent: v4}
  │                                          │
  │  5. 200 OK {version: v5}                │
  │◄─────────────────────────────────────────│
```

### 4. Conflict Resolution

```
Client A edits file (creates v5)
Client B edits same file (also creates v5)

Server detects conflict:
1. Keep both versions
2. Create conflict file: "file (A's conflicted copy).txt"
3. Notify both clients
4. Let user merge manually
```

Seafile's approach:
- Last-write-wins for non-overlapping changes at block level
- Full file conflict for overlapping changes
- Conflict files stored with user attribution

### 5. Selective Sync

Users choose which folders to sync locally:
```
/anvil-drive/
├── Documents/    ← sync (local)
├── Photos/       ← cloud-only (no local sync)
├── Work/         ← sync (local)
└── Archive/      ← cloud-only
```

**Implementation:**
```typescript
interface SyncConfig {
  rootPath: string;
  syncedFolders: string[];   // Folders to sync locally
  excludedPatterns: string[]; // Glob patterns to exclude
  maxFileSize: number;       // Skip files larger than this
  syncInterval: number;      // Poll interval in seconds
}
```

---

## Recommended Architecture for Anvil Drive

### Phase 1: Web-Only (Current)
- Browser-based file management
- Upload/download via REST API
- No local sync

### Phase 2: Progressive Web App
- Background Sync API for upload queue
- Cache API for offline file access
- Service Worker for read-only offline mode

### Phase 3: Desktop Client (Tauri)
- Local filesystem watcher (notify crate)
- SQLite metadata cache
- CDC block-level sync via REST/WebSocket
- Tray icon + system notifications

### Phase 4: Mobile (React Native / Expo)
- Background upload/download
- Photo auto-backup
- Selective sync (favorites only)
- Offline access via local storage

---

## Key Takeaways

| Pattern | Seafile Approach | Anvil Implementation |
|---------|-----------------|---------------------|
| Chunking | Content-defined (Rabin) | Fixed 256KB blocks (simpler) |
| Storage | Content-addressable (SHA-1) | Content-addressable (SHA-256) |
| Sync protocol | Custom HTTP API | REST + WebSocket |
| Conflicts | Block-level diff + conflict files | Same approach |
| Selective sync | Per-folder config | Per-folder config |
| Local cache | SQLite | SQLite (same) |

**For demo:** Skip local sync. Use PWA Background Sync for upload resilience.

**For production:** Tauri desktop client with CDC block-level sync.

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/seafile-sync-patterns.md` | This document |
