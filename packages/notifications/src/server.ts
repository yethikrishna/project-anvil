/**
 * @anvil/notifications — Notification system for Project Anvil
 *
 * Fastify WebSocket server on port 4020, React hook useNotifications,
 * toast alerts for new mail, file shares, doc mentions.
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';

// ── Types ──

export interface Notification {
  id: string;
  type: 'mail' | 'file_share' | 'doc_mention' | 'system' | 'comment';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPayload {
  event: 'notification' | 'notification_read' | 'notification_read_all';
  payload: Notification | { ids: string[] };
}

// ── In-memory store (swap for PostgreSQL in production) ──

const notifications = new Map<string, Notification[]>();
const connections = new Map<string, Set<WebSocket>>();

function getUserNotifications(userId: string): Notification[] {
  return notifications.get(userId) ?? [];
}

function addNotification(userId: string, notification: Notification): void {
  const list = notifications.get(userId) ?? [];
  list.unshift(notification);
  // Keep last 100
  if (list.length > 100) list.length = 100;
  notifications.set(userId, list);
}

function broadcastToUser(userId: string, payload: NotificationPayload): void {
  const conns = connections.get(userId);
  if (!conns) return;
  const data = JSON.stringify(payload);
  for (const ws of conns) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

// ── REST API + WebSocket Server ──

export async function createNotificationServer(port = 4020) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'notifications' }));

  // WebSocket connection
  app.get('/ws', { websocket: true }, (socket, req) => {
    const userId = (req.query as Record<string, string>).userId;
    if (!userId) {
      socket.close(4001, 'Missing userId');
      return;
    }

    // Register connection
    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId)!.add(socket);

    // Send initial notifications
    const initial = getUserNotifications(userId);
    socket.send(JSON.stringify({ event: 'initial', payload: initial }));

    socket.on('close', () => {
      connections.get(userId)?.delete(socket);
      if (connections.get(userId)?.size === 0) connections.delete(userId);
    });
  });

  // REST: Get notifications for a user
  app.get('/api/notifications', async (req) => {
    const userId = (req.query as Record<string, string>).userId;
    if (!userId) return { error: 'Missing userId' };
    return { notifications: getUserNotifications(userId) };
  });

  // REST: Create a notification
  app.post('/api/notifications', async (req) => {
    const body = req.body as Omit<Notification, 'id' | 'read' | 'createdAt'> & { userId: string };
    const notification: Notification = {
      ...body,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };

    addNotification(body.userId, notification);
    broadcastToUser(body.userId, { event: 'notification', payload: notification });

    return { success: true, notification };
  });

  // REST: Mark notifications as read
  app.put('/api/notifications/read', async (req) => {
    const { userId, ids } = req.body as { userId: string; ids: string[] };
    const list = notifications.get(userId) ?? [];
    for (const n of list) {
      if (ids.includes(n.id)) n.read = true;
    }
    broadcastToUser(userId, { event: 'notification_read', payload: { ids } });
    return { success: true };
  });

  // REST: Mark all as read
  app.put('/api/notifications/read-all', async (req) => {
    const { userId } = req.body as { userId: string };
    const list = notifications.get(userId) ?? [];
    for (const n of list) n.read = true;
    broadcastToUser(userId, { event: 'notification_read_all', payload: { ids: list.map(n => n.id) } });
    return { success: true };
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`🔔 Notification server running on port ${port}`);
  return app;
}

// ── CLI entry ──

if (require.main === module) {
  createNotificationServer(4020).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
