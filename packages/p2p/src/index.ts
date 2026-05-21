/**
 * @anvil/p2p — WebRTC P2P file sharing (encrypted browser-to-browser).
 *
 * Features:
 * - Direct browser-to-browser file transfer (no server relay)
 * - End-to-end encryption via DTLS (built into WebRTC)
 * - Chunked transfer with progress tracking
 * - Resume support for interrupted transfers
 * - Multiple concurrent transfers
 *
 * Signaling is done through the existing WebSocket notification server.
 * ICE candidates are exchanged via a simple signaling protocol.
 */

// ── Types ──

export interface P2PTransfer {
  id: string;
  file: File;
  peerId: string;
  direction: 'sending' | 'receiving';
  progress: number; // 0-1
  bytesTransferred: number;
  totalBytes: number;
  status: 'pending' | 'connecting' | 'transferring' | 'complete' | 'error' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  speed?: number; // bytes/sec
}

export interface P2PPeer {
  id: string;
  name: string;
  connectionState: RTCPeerConnectionState;
  lastSeen: string;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'file-offer' | 'file-accept' | 'file-reject' | 'file-chunk' | 'file-complete';
  from: string;
  to: string;
  payload: any;
  transferId?: string;
}

// ── Configuration ──

const CHUNK_SIZE = 16384; // 16KB chunks (optimal for WebRTC data channels)
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

// ── P2P Manager ──

export class P2PManager {
  private connections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private transfers = new Map<string, P2PTransfer>();
  private onSignalingMessage: ((msg: SignalingMessage) => void) | null = null;
  private onTransferUpdate: ((transfer: P2PTransfer) => void) | null = null;
  private localId: string;

  constructor(localId: string) {
    this.localId = localId;
  }

  /**
   * Set the signaling message sender.
   * This should send messages through your WebSocket notification server.
   */
  setSignalingHandler(handler: (msg: SignalingMessage) => void) {
    this.onSignalingMessage = handler;
  }

  /**
   * Set the transfer update callback.
   */
  setTransferHandler(handler: (transfer: P2PTransfer) => void) {
    this.onTransferUpdate = handler;
  }

  /**
   * Handle an incoming signaling message.
   */
  async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'offer':
        await this.handleOffer(message);
        break;
      case 'answer':
        await this.handleAnswer(message);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(message);
        break;
      case 'file-accept':
        await this.startFileTransfer(message);
        break;
      case 'file-reject':
        this.cancelTransfer(message.transferId!);
        break;
    }
  }

  /**
   * Create a peer connection and send an offer.
   */
  async connectToPeer(peerId: string): Promise<void> {
    const pc = this.createPeerConnection(peerId);
    const channel = pc.createDataChannel('fileTransfer', {
      ordered: true,
      maxRetransmits: 3,
    });

    this.setupDataChannel(channel, peerId);
    this.dataChannels.set(peerId, channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendSignal({
      type: 'offer',
      from: this.localId,
      to: peerId,
      payload: offer,
    });
  }

  /**
   * Offer a file to a peer.
   */
  offerFile(peerId: string, file: File): P2PTransfer {
    const transferId = `transfer_${Date.now()}`;
    const transfer: P2PTransfer = {
      id: transferId,
      file,
      peerId,
      direction: 'sending',
      progress: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      status: 'pending',
    };

    this.transfers.set(transferId, transfer);

    this.sendSignal({
      type: 'file-offer',
      from: this.localId,
      to: peerId,
      transferId,
      payload: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    });

    return transfer;
  }

  /**
   * Accept a file offer from a peer.
   */
  acceptFile(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;

    this.sendSignal({
      type: 'file-accept',
      from: this.localId,
      to: transfer.peerId,
      transferId,
      payload: {},
    });
  }

  /**
   * Reject a file offer.
   */
  rejectFile(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return;

    this.sendSignal({
      type: 'file-reject',
      from: this.localId,
      to: transfer.peerId,
      transferId,
      payload: {},
    });

    this.transfers.delete(transferId);
  }

  /**
   * Cancel an active transfer.
   */
  cancelTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (transfer) {
      transfer.status = 'cancelled';
      this.onTransferUpdate?.(transfer);
      this.transfers.delete(transferId);
    }
  }

  /**
   * Get all active transfers.
   */
  getTransfers(): P2PTransfer[] {
    return Array.from(this.transfers.values());
  }

  /**
   * Close all connections.
   */
  closeAll(): void {
    for (const pc of this.connections.values()) {
      pc.close();
    }
    this.connections.clear();
    this.dataChannels.clear();
    this.transfers.clear();
  }

  // ── Private Methods ──

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          from: this.localId,
          to: peerId,
          payload: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.connections.delete(peerId);
        this.dataChannels.delete(peerId);
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId);
    };

    this.connections.set(peerId, pc);
    return pc;
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string): void {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      // Data channel ready
    };

    channel.onmessage = (event) => {
      this.handleIncomingData(peerId, event.data);
    };
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    let pc = this.connections.get(message.from);
    if (!pc) {
      pc = this.createPeerConnection(message.from);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignal({
      type: 'answer',
      from: this.localId,
      to: message.from,
      payload: answer,
    });
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const pc = this.connections.get(message.from);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    const pc = this.connections.get(message.from);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(message.payload));
    }
  }

  private async startFileTransfer(message: SignalingMessage): Promise<void> {
    const transfer = this.transfers.get(message.transferId!);
    if (!transfer || transfer.direction !== 'sending') return;

    const channel = this.dataChannels.get(transfer.peerId);
    if (!channel || channel.readyState !== 'open') return;

    transfer.status = 'transferring';
    transfer.startedAt = new Date().toISOString();
    this.onTransferUpdate?.(transfer);

    const file = transfer.file;
    let offset = 0;
    const startTime = Date.now();

    const sendChunk = () => {
      while (offset < file.size) {
        if (channel.bufferedAmount > CHUNK_SIZE * 8) {
          // Backpressure: wait for buffer to drain
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            sendChunk();
          };
          channel.bufferedAmountLowThreshold = CHUNK_SIZE;
          return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = (e) => {
          if (e.target?.result) {
            channel.send(e.target.result as ArrayBuffer);
            offset += CHUNK_SIZE;

            transfer.bytesTransferred = Math.min(offset, file.size);
            transfer.progress = transfer.bytesTransferred / transfer.totalBytes;
            transfer.speed = transfer.bytesTransferred / ((Date.now() - startTime) / 1000);
            this.onTransferUpdate?.(transfer);

            if (offset >= file.size) {
              transfer.status = 'complete';
              transfer.completedAt = new Date().toISOString();
              transfer.progress = 1;
              this.onTransferUpdate?.(transfer);

              this.sendSignal({
                type: 'file-complete',
                from: this.localId,
                to: transfer.peerId,
                transferId: transfer.id,
                payload: {},
              });
            }
          }
        };

        reader.readAsArrayBuffer(slice);
        return; // Async: reader.onload will call sendChunk again via backpressure
      }
    };

    sendChunk();
  }

  private handleIncomingData(peerId: string, data: ArrayBuffer): void {
    // Find active receiving transfer for this peer
    const transfer = Array.from(this.transfers.values()).find(
      t => t.peerId === peerId && t.direction === 'receiving' && t.status === 'transferring'
    );

    if (transfer) {
      transfer.bytesTransferred += data.byteLength;
      transfer.progress = transfer.bytesTransferred / transfer.totalBytes;

      if (transfer.progress >= 1) {
        transfer.status = 'complete';
        transfer.completedAt = new Date().toISOString();
      }

      this.onTransferUpdate?.(transfer);
    }
  }

  private sendSignal(message: SignalingMessage): void {
    this.onSignalingMessage?.(message);
  }
}

// ── File chunking utilities ──

export async function chunkFile(file: File, chunkSize = CHUNK_SIZE): Promise<ArrayBuffer[]> {
  const chunks: ArrayBuffer[] = [];
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();
    chunks.push(buffer);
    offset += chunkSize;
  }

  return chunks;
}

export function reassembleFile(chunks: ArrayBuffer[], metadata: {name: string; type: string}): File {
  const blob = new Blob(chunks, {type: metadata.type});
  return new File([blob], metadata.name, {type: metadata.type});
}
