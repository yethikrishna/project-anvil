/**
 * Shared Worker — Single WebSocket connection shared across all Anvil tabs.
 *
 * Instead of each browser tab maintaining its own WebSocket to the
 * Hocuspocus/notifications server, this Shared Worker maintains one
 * connection and broadcasts messages to all connected tabs.
 *
 * Usage in tabs:
 * ```ts
 * const worker = new SharedWorker('/workers/anvil-shared.js');
 * worker.port.onmessage = (e) => handleUpdate(e.data);
 * worker.port.start();
 * worker.port.postMessage({type: 'subscribe', channel: 'docs:123'});
 * ```
 */

// @ts-ignore — Shared Worker global scope
const ports = new Set<MessagePort>();
const subscriptions = new Map<string, Set<MessagePort>>(); // channel -> ports

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const WS_URL = 'ws://localhost:4020'; // Hocuspocus/notifications

// ── WebSocket Connection ──

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    // Resubscribe to all channels
    for (const channel of subscriptions.keys()) {
      ws?.send(JSON.stringify({type: 'subscribe', channel}));
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const channel = data.channel;

      if (channel && subscriptions.has(channel)) {
        // Send to all tabs subscribed to this channel
        for (const port of subscriptions.get(channel)!) {
          port.postMessage({type: 'message', data});
        }
      }

      // Also broadcast to all tabs (global messages)
      for (const port of ports) {
        port.postMessage({type: 'message', data});
      }
    } catch {
      // Non-JSON message, broadcast raw
      for (const port of ports) {
        port.postMessage({type: 'raw', data: event.data});
      }
    }
  };

  ws.onclose = () => {
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

// ── Shared Worker Message Handling ──

// @ts-ignore — Shared Worker connect event
self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.add(port);

  port.onmessage = (e: MessageEvent) => {
    const {type, channel, data} = e.data;

    switch (type) {
      case 'subscribe':
        if (!subscriptions.has(channel)) {
          subscriptions.set(channel, new Set());
        }
        subscriptions.get(channel)!.add(port);

        // Send subscribe to WebSocket
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({type: 'subscribe', channel}));
        }
        break;

      case 'unsubscribe':
        if (subscriptions.has(channel)) {
          subscriptions.get(channel)!.delete(port);
          if (subscriptions.get(channel)!.size === 0) {
            subscriptions.delete(channel);
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({type: 'unsubscribe', channel}));
            }
          }
        }
        break;

      case 'send':
        // Tab wants to send a message through the shared WebSocket
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        }
        break;

      case 'ping':
        port.postMessage({type: 'pong', timestamp: Date.now()});
        break;
    }
  };

  port.onclose = () => {
    ports.delete(port);
    // Remove from all subscriptions
    for (const [channel, channelPorts] of subscriptions) {
      channelPorts.delete(port);
      if (channelPorts.size === 0) {
        subscriptions.delete(channel);
      }
    }
  };

  port.start();
  connect(); // Ensure connection is alive
};

// ── Client-side Hook (for use in React components) ──

/**
 * React hook stub for using the Shared Worker.
 * Import this from a client component file.
 */
export const SHARED_WORKER_CLIENT_CODE = `
import { useEffect, useRef, useCallback } from 'react';

export function useSharedWorker() {
  const workerRef = useRef(null);
  const listenersRef = useRef(new Map());

  useEffect(() => {
    try {
      const worker = new SharedWorker('/workers/anvil-shared.js');
      workerRef.current = worker;

      worker.port.onmessage = (e) => {
        const { type, data, channel } = e.data;
        const key = channel || '__global__';
        const fns = listenersRef.current.get(key);
        if (fns) {
          for (const fn of fns) fn(data);
        }
      };

      worker.port.start();
      return () => worker.port.close();
    } catch {
      // SharedWorker not supported, fall back to direct WebSocket
    }
  }, []);

  const subscribe = useCallback((channel, callback) => {
    if (!listenersRef.current.has(channel)) {
      listenersRef.current.set(channel, new Set());
    }
    listenersRef.current.get(channel).add(callback);

    workerRef.current?.port.postMessage({ type: 'subscribe', channel });
  }, []);

  const unsubscribe = useCallback((channel, callback) => {
    listenersRef.current.get(channel)?.delete(callback);
    workerRef.current?.port.postMessage({ type: 'unsubscribe', channel });
  }, []);

  const send = useCallback((data) => {
    workerRef.current?.port.postMessage({ type: 'send', data });
  }, []);

  return { subscribe, unsubscribe, send };
}
`;
