/**
 * WebRTC Signaling Server — in-memory offer/answer/ICE exchange.
 *
 * POST /api/call/signal — exchange WebRTC signals
 * GET  /api/call/signal — poll for signals (SSE-based)
 * POST /api/call/start  — initiate a call
 * POST /api/call/end    — end a call
 * GET  /api/call/status — active call status
 *
 * Architecture:
 * - In-memory signal store (swap for Valkey in prod)
 * - SSE fan-out for real-time signal delivery
 * - STUN: Google public servers
 * - TURN: coturn config via env
 */

export interface CallSignal {
  id: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end' | 'screen-share-start' | 'screen-share-end';
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
}

export interface ActiveCall {
  id: string;
  initiatorId: string;
  receiverId: string;
  status: 'ringing' | 'active' | 'ended';
  startedAt: number;
  endedAt?: number;
  hasVideo: boolean;
  hasScreenShare: boolean;
}

// ── In-memory store ──

// Per-user signal queues: userId → signal[]
const signalQueues = new Map<string, CallSignal[]>();

// Active calls
const activeCalls = new Map<string, ActiveCall>();

// SSE subscribers: userId → enqueue fn
const sseSubscribers = new Map<string, (signal: CallSignal) => void>();

function enqueueSignal(signal: CallSignal): void {
  // Deliver to SSE subscriber if connected
  const sub = sseSubscribers.get(signal.to);
  if (sub) {
    sub(signal);
    return;
  }

  // Otherwise queue for polling
  if (!signalQueues.has(signal.to)) {
    signalQueues.set(signal.to, []);
  }
  const queue = signalQueues.get(signal.to)!;
  queue.push(signal);
  // Keep last 50 signals only
  if (queue.length > 50) queue.splice(0, queue.length - 50);
}

function dequeueSignals(userId: string): CallSignal[] {
  const signals = signalQueues.get(userId) ?? [];
  signalQueues.delete(userId);
  return signals;
}

export function subscribeCallSignals(userId: string, fn: (signal: CallSignal) => void): () => void {
  sseSubscribers.set(userId, fn);
  // Flush queued signals
  const queued = dequeueSignals(userId);
  for (const sig of queued) fn(sig);
  return () => sseSubscribers.delete(userId);
}

export function publishSignal(signal: Omit<CallSignal, 'id' | 'timestamp'>): CallSignal {
  const full: CallSignal = {
    ...signal,
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  enqueueSignal(full);
  return full;
}

export function startCall(initiatorId: string, receiverId: string, hasVideo = true): ActiveCall {
  const call: ActiveCall = {
    id: `call_${Date.now()}`,
    initiatorId,
    receiverId,
    status: 'ringing',
    startedAt: Date.now(),
    hasVideo,
    hasScreenShare: false,
  };
  activeCalls.set(call.id, call);
  return call;
}

export function getActiveCall(userId: string): ActiveCall | null {
  for (const call of activeCalls.values()) {
    if ((call.initiatorId === userId || call.receiverId === userId) && call.status !== 'ended') {
      return call;
    }
  }
  return null;
}

export function updateCall(callId: string, updates: Partial<ActiveCall>): void {
  const call = activeCalls.get(callId);
  if (call) activeCalls.set(callId, { ...call, ...updates });
}

export function endCall(callId: string): void {
  const call = activeCalls.get(callId);
  if (call) {
    activeCalls.set(callId, { ...call, status: 'ended', endedAt: Date.now() });
    // Clean up after 30s
    setTimeout(() => activeCalls.delete(callId), 30_000);
  }
}

export { activeCalls };
