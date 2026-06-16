/**
 * Multi-party video calling with mediasoup SFU (Selective Forwarding Unit).
 *
 * Architecture:
 * - Each participant sends ONE video+audio stream to the SFU
 * - SFU forwards each stream to all other participants
 * - No P2P mesh needed (scales to N participants)
 *
 * Server-side:
 * - mediasoup Worker → Router → {WebRtcTransport × N} → {Producer, Consumer}
 * - REST API for room/transport/producer/consumer management
 * - WebSocket (or SSE) for mediasoup RTP capabilities exchange
 *
 * Client-side:
 * - mediasoup-client Device loads RTP capabilities
 * - Creates SendTransport (one per participant) for uploading
 * - Creates RecvTransport (one per participant) for each remote stream
 * - Produces tracks, consumes remote producers
 *
 * This implementation uses the "rooms" model:
 * - /api/rooms                   — list/create rooms
 * - /api/rooms/[id]/join          — join, get router RTP capabilities
 * - /api/rooms/[id]/transports    — create WebRTC transport
 * - /api/rooms/[id]/producers     — announce new producer
 * - /api/rooms/[id]/consumers     — subscribe to a producer
 * - /api/rooms/[id]/participants  — list active participants
 * - /api/rooms/[id]/events        — SSE for room events (peer join/leave/produce)
 */

// ── In-memory room store (no mediasoup Worker yet — just SFU plumbing) ──
// Full mediasoup integration requires a separate Node.js server process.
// This file provides the data model and REST API surface that the
// mediasoup server exposes. The Docker compose sets up the mediasoup server
// as a separate service (apps/call-server/).

export interface Room {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  participants: Participant[];
  maxParticipants: number;
}

export interface Participant {
  id: string;           // userId
  socketId: string;     // transport handle
  displayName: string;
  joinedAt: number;
  producers: ProducerInfo[];
  hasVideo: boolean;
  hasAudio: boolean;
  hasScreen: boolean;
}

export interface ProducerInfo {
  id: string;           // mediasoup Producer id
  kind: 'audio' | 'video';
  type: 'camera' | 'screen';
  paused: boolean;
}

// ── In-memory store ──

const rooms = new Map<string, Room>();

export function createRoom(name: string, createdBy: string, maxParticipants = 10): Room {
  const room: Room = {
    id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: Date.now(),
    createdBy,
    participants: [],
    maxParticipants,
  };
  rooms.set(room.id, room);
  return room;
}

export function getRoom(id: string): Room | null {
  return rooms.get(id) ?? null;
}

export function listRooms(): Room[] {
  return Array.from(rooms.values());
}

export function joinRoom(
  roomId: string,
  userId: string,
  displayName: string,
): { room: Room; participant: Participant } | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  // Remove stale entry if exists
  room.participants = room.participants.filter(p => p.id !== userId);

  if (room.participants.length >= room.maxParticipants) return null;

  const participant: Participant = {
    id: userId,
    socketId: `sock_${Date.now()}`,
    displayName,
    joinedAt: Date.now(),
    producers: [],
    hasVideo: false,
    hasAudio: false,
    hasScreen: false,
  };

  room.participants.push(participant);
  roomSseSubscribers.get(roomId)?.forEach(fn =>
    fn({ type: 'peer-joined', participant })
  );

  return { room, participant };
}

export function leaveRoom(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.participants = room.participants.filter(p => p.id !== userId);
  roomSseSubscribers.get(roomId)?.forEach(fn =>
    fn({ type: 'peer-left', userId })
  );
}

export function addProducer(
  roomId: string,
  userId: string,
  producer: ProducerInfo,
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const p = room.participants.find(p => p.id === userId);
  if (!p) return;
  p.producers.push(producer);
  if (producer.kind === 'video') {
    p.hasVideo = producer.type === 'camera';
    p.hasScreen = producer.type === 'screen';
  } else {
    p.hasAudio = true;
  }
  roomSseSubscribers.get(roomId)?.forEach(fn =>
    fn({ type: 'new-producer', userId, producer })
  );
}

// ── SSE pub/sub for room events ──

type RoomEvent =
  | { type: 'peer-joined'; participant: Participant }
  | { type: 'peer-left'; userId: string }
  | { type: 'new-producer'; userId: string; producer: ProducerInfo }
  | { type: 'producer-closed'; userId: string; producerId: string };

const roomSseSubscribers = new Map<string, Set<(event: RoomEvent) => void>>();

export function subscribeRoomEvents(
  roomId: string,
  fn: (event: RoomEvent) => void,
): () => void {
  if (!roomSseSubscribers.has(roomId)) {
    roomSseSubscribers.set(roomId, new Set());
  }
  roomSseSubscribers.get(roomId)!.add(fn);
  return () => {
    const subs = roomSseSubscribers.get(roomId);
    if (subs) {
      subs.delete(fn);
      if (subs.size === 0) roomSseSubscribers.delete(roomId);
    }
  };
}

export { rooms };
