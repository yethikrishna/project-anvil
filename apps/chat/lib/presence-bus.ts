/**
 * In-process SSE broadcast bus for real-time channel events.
 *
 * Channels/messages/typing events are published here and fanned out
 * to all connected SSE clients (see /api/channels/events).
 *
 * In production, swap for Valkey pub/sub via @anvil/events.
 * For single-server dev, this in-memory bus is zero-latency.
 */

export type BusEvent =
  | { type: 'message'; channelId: string; message: unknown }
  | { type: 'message_edited'; id: string; content: string; editedAt: number }
  | { type: 'message_deleted'; id: string }
  | { type: 'reaction'; messageId: string; reactions: Record<string, string[]> }
  | { type: 'typing'; channelId: string; userId: string; isTyping: boolean }
  | { type: 'presence'; userId: string; status: string; lastSeen: number }
  | { type: 'channel_created'; channel: unknown }
  | { type: 'channel_updated'; channel: unknown };

// SSE subscriber map: subscriptionId → { channelIds, enqueue fn }
const subscribers = new Map<string, {
  channelIds: Set<string> | null; // null = all channels
  enqueue: (event: BusEvent) => void;
}>();

let subIdCounter = 0;

export function presenceSubscribe(
  enqueue: (event: BusEvent) => void,
  channelIds?: string[],
): () => void {
  const id = `sub_${++subIdCounter}`;
  subscribers.set(id, {
    channelIds: channelIds ? new Set(channelIds) : null,
    enqueue,
  });
  return () => subscribers.delete(id);
}

export function presenceBroadcast(event: BusEvent): void {
  for (const [, sub] of subscribers) {
    // Filter by channel if subscriber requested specific channels
    if (sub.channelIds !== null) {
      const channelId = 'channelId' in event ? event.channelId : undefined;
      if (channelId && !sub.channelIds.has(channelId)) continue;
    }
    try {
      sub.enqueue(event);
    } catch {
      // Client disconnected
    }
  }
}

// Typing indicator: auto-clear after 4 seconds
const typingTimers = new Map<string, NodeJS.Timeout>();

export function setTyping(channelId: string, userId: string, isTyping: boolean): void {
  const key = `${channelId}:${userId}`;

  if (typingTimers.has(key)) {
    clearTimeout(typingTimers.get(key)!);
    typingTimers.delete(key);
  }

  presenceBroadcast({ type: 'typing', channelId, userId, isTyping });

  if (isTyping) {
    // Auto-clear after 4s if no follow-up
    typingTimers.set(key, setTimeout(() => {
      presenceBroadcast({ type: 'typing', channelId, userId, isTyping: false });
      typingTimers.delete(key);
    }, 4000));
  }
}
