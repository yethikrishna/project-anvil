# PeerJS for WebRTC P2P File Sharing — Drive Clone

**Date:** 2026-05-21
**Status:** Evaluated with implementation

---

## What is PeerJS?

PeerJS simplifies WebRTC peer-to-peer connections with a signaling server and a clean client API. No need to manage ICE candidates, SDP offers/answers manually.

### Why P2P for Drive Clone?

1. **Direct sharing:** User A sends file directly to User B — no server upload needed
2. **Large files:** No server storage limit for P2P transfers
3. **Privacy:** File data never touches the server (E2E in transit)
4. **Speed:** LAN transfers go directly, not via cloud

---

## Architecture

```
User A (Browser)                    User B (Browser)
     │                                   │
     │──── Signaling (PeerJS Server) ────│
     │         (connection setup)         │
     │                                   │
     │═════════ WebRTC Data Channel ═════│
     │         (direct file transfer)     │
     │                                   │
```

### PeerJS Signaling Server

```typescript
// packages/p2p/src/signaling-server.ts
import { ExpressPeerServer } from 'peer';

const server = ExpressPeerServer(serverInstance, {
  debug: true,
  path: '/peerjs',
  allow_discovery: true, // Allow peers to find each other
  corsOptions: {
    origin: '*',
  },
});

// Events
server.on('connection', (client) => {
  console.log(`Peer connected: ${client.getId()}`);
});

server.on('disconnect', (client) => {
  console.log(`Peer disconnected: ${client.getId()}`);
});
```

### Docker Compose Addition

```yaml
  peerjs:
    image: peerjs/peerjs-server:latest
    ports:
      - "9002:9002"
    environment:
      PEERJS_PORT: 9002
      PEERJS_PATH: /peerjs
      PEERJS_ALLOW_DISCOVERY: "true"
    networks:
      - anvil-net
```

---

## Client Implementation

### File Transfer Module

```typescript
// apps/drive/lib/p2p-file-share.ts
import Peer, { DataConnection } from 'peerjs';

export interface FileTransferProgress {
  fileId: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  speed: number;       // bytes/sec
  eta: number;         // seconds remaining
  status: 'connecting' | 'transferring' | 'complete' | 'error';
}

export class P2PFileShare {
  private peer: Peer;
  private connections: Map<string, DataConnection> = new Map();
  private onProgress?: (progress: FileTransferProgress) => void;

  constructor(userId: string, signalingServer?: string) {
    this.peer = new Peer(`anvil-${userId}`, {
      host: signalingServer || window.location.hostname,
      port: 9002,
      path: '/peerjs',
    });

    this.peer.on('open', (id) => {
      console.log(`P2P connected as ${id}`);
    });

    // Receive files
    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });
  }

  // Send a file to another user
  async sendFile(targetUserId: string, file: File): Promise<void> {
    const conn = this.peer.connect(`anvil-${targetUserId}`);
    this.connections.set(targetUserId, conn);

    return new Promise((resolve, reject) => {
      conn.on('open', () => {
        // Send file metadata first
        conn.send({
          type: 'file-meta',
          fileId: crypto.randomUUID(),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        // Read and send file in chunks
        const CHUNK_SIZE = 64 * 1024; // 64KB chunks
        const reader = file.stream().getReader();
        let transferred = 0;

        const sendChunk = async () => {
          const { done, value } = await reader.read();
          if (done) {
            conn.send({ type: 'file-end' });
            resolve();
            return;
          }

          conn.send({
            type: 'file-chunk',
            data: value,
            offset: transferred,
          });

          transferred += value.length;
          this.onProgress?.({
            fileId: '',
            fileName: file.name,
            totalBytes: file.size,
            transferredBytes: transferred,
            speed: 0,
            eta: 0,
            status: 'transferring',
          });

          // Flow control: wait for buffer to drain
          if (conn.dataChannel.bufferedAmount > 1024 * 1024) {
            await new Promise<void>((r) => {
              conn.dataChannel.bufferedAmountLowThreshold = 0;
              conn.dataChannel.onbufferedamountlow = () => r();
            });
          }

          sendChunk();
        };

        sendChunk();
      });

      conn.on('error', reject);
    });
  }

  // Handle incoming file
  private handleIncomingConnection(conn: DataConnection): void {
    let fileMeta: { fileId: string; fileName: string; fileSize: number; mimeType: string } | null = null;
    const chunks: Uint8Array[] = [];

    conn.on('data', (data: any) => {
      switch (data.type) {
        case 'file-meta':
          fileMeta = data;
          break;
        case 'file-chunk':
          chunks.push(new Uint8Array(data.data));
          if (fileMeta) {
            const transferred = chunks.reduce((sum, c) => sum + c.length, 0);
            this.onProgress?.({
              fileId: fileMeta.fileId,
              fileName: fileMeta.fileName,
              totalBytes: fileMeta.fileSize,
              transferredBytes: transferred,
              speed: 0,
              eta: 0,
              status: 'transferring',
            });
          }
          break;
        case 'file-end':
          if (fileMeta) {
            const blob = new Blob(chunks, { type: fileMeta.mimeType });
            // Trigger download or save to Drive
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileMeta.fileName;
            a.click();
            URL.revokeObjectURL(url);

            this.onProgress?.({
              fileId: fileMeta.fileId,
              fileName: fileMeta.fileName,
              totalBytes: fileMeta.fileSize,
              transferredBytes: fileMeta.fileSize,
              speed: 0,
              eta: 0,
              status: 'complete',
            });
          }
          break;
      }
    });
  }

  // Get this peer's shareable ID
  getPeerId(): string {
    return this.peer.id;
  }

  // Set progress callback
  setProgressCallback(cb: (progress: FileTransferProgress) => void): void {
    this.onProgress = cb;
  }

  // Cleanup
  destroy(): void {
    this.connections.forEach((conn) => conn.close());
    this.peer.destroy();
  }
}
```

---

## Integration into Drive Clone

```typescript
// apps/drive/lib/use-p2p-share.ts
import { useState, useEffect } from 'react';
import { P2PFileShare, FileTransferProgress } from './p2p-file-share';

export function useP2PShare(userId: string) {
  const [p2p, setP2p] = useState<P2PFileShare | null>(null);
  const [transfers, setTransfers] = useState<FileTransferProgress[]>([]);

  useEffect(() => {
    const share = new P2PFileShare(userId);
    share.setProgressCallback((progress) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.fileId === progress.fileId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = progress;
          return next;
        }
        return [...prev, progress];
      });
    });
    setP2p(share);
    return () => share.destroy();
  }, [userId]);

  return { p2p, transfers, peerId: p2p?.getPeerId() };
}
```

---

## Evaluation

| Factor | Rating | Notes |
|--------|--------|-------|
| Ease of implementation | ⭐⭐⭐⭐ | PeerJS handles signaling, we handle data |
| Performance | ⭐⭐⭐⭐⭐ | Direct P2P, no server bottleneck |
| Browser support | ⭐⭐⭐⭐ | WebRTC in all modern browsers |
| Mobile support | ⭐⭐⭐ | iOS WebView can be tricky |
| NAT traversal | ⭐⭐⭐ | STUN/TURN needed for strict NATs |
| File size limit | ⭐⭐⭐⭐⭐ | No practical limit (chunked transfer) |

### Recommendation

**Add for demo:** Implement basic P2P file sharing between browser tabs (same machine). Shows the architecture without needing external users.

**For production:** Add TURN server (coturn) for NAT traversal and WebTorrent for multi-peer distribution of shared files.

---

## Files

| File | Purpose |
|------|---------|
| `docs/research/peerjs-p2p-drive.md` | This document |
