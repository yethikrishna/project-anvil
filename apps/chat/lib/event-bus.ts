/**
 * event-bus.ts — Lightweight in-process event bus for real-time UI updates.
 *
 * Used to push signals from API routes → frontend without full SSE infrastructure.
 * Works via a browser-side EventSource on /api/events/stream.
 *
 * Event types:
 * - attention_alert: urgent email / calendar conflict detected
 * - tool_complete: background tool finished
 * - briefing_refresh: briefing data updated
 * - ai_suggestion: proactive AI suggestion ready
 */

export type BusEventType =
  | 'attention_alert'
  | 'tool_complete'
  | 'briefing_refresh'
  | 'ai_suggestion'
  | 'heartbeat';

export interface BusEvent<T = unknown> {
  type: BusEventType;
  payload: T;
  id: string;
  ts: number;
}

export interface AttentionAlert {
  subject: string;
  from: string;
  snippet: string;
  priority: 'urgent' | 'high';
  actionPrompt: string;
}

export interface AISuggestion {
  text: string;
  actionPrompt: string;
  confidence: number;
}

// ── Server-side: broadcast queue ──
// Shared across all server routes (module-level singleton in Node.js runtime).

type Listener = (event: BusEvent) => void;
const listeners = new Set<Listener>();
const recentEvents: BusEvent[] = [];
const MAX_RECENT = 50;

export function busEmit<T>(type: BusEventType, payload: T): void {
  const event: BusEvent<T> = {
    type,
    payload,
    id: crypto.randomUUID(),
    ts: Date.now(),
  };

  recentEvents.push(event as BusEvent);
  if (recentEvents.length > MAX_RECENT) recentEvents.shift();

  for (const listener of listeners) {
    try { listener(event as BusEvent); } catch { /* ignore */ }
  }
}

export function busSubscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function busGetRecent(since?: number): BusEvent[] {
  if (!since) return [...recentEvents];
  return recentEvents.filter(e => e.ts > since);
}
