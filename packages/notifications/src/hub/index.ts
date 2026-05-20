/**
 * Unified Notification Hub — SSE delivery, action buttons, smart batching.
 *
 * Features:
 * - Server-Sent Events (SSE) for real-time push
 * - Action buttons in notifications (reply, approve, dismiss)
 * - Smart batching (group similar notifications within 60s window)
 * - Priority levels (urgent, normal, low)
 * - Cross-app notifications (email, docs, drive, calendar, tasks)
 * - Read/unread state
 */

// ── Types ──

export type NotificationPriority = 'urgent' | 'normal' | 'low';
export type NotificationAction = {
  label: string;
  action: string; // URL or action identifier
  primary?: boolean;
};

export interface AppNotification {
  id: string;
  /** Which app generated this */
  sourceApp: string;
  /** Notification type */
  type: 'email' | 'document' | 'file' | 'calendar' | 'task' | 'system' | 'mention';
  /** Title */
  title: string;
  /** Body text */
  body: string;
  /** Icon */
  icon: string;
  /** Priority */
  priority: NotificationPriority;
  /** Action buttons */
  actions: NotificationAction[];
  /** Deep link */
  url?: string;
  /** Timestamp */
  createdAt: string;
  /** Read state */
  read: boolean;
  /** Batch ID (for grouped notifications) */
  batchId?: string;
  /** User ID */
  userId: string;
}

export interface NotificationBatch {
  batchId: string;
  title: string;
  notifications: AppNotification[];
  count: number;
  createdAt: string;
}

// ── In-Memory Store ──

const notifications: AppNotification[] = [
  {
    id: 'n1', sourceApp: 'gmail', type: 'email', title: 'New email from Sarah Chen',
    body: 'Hey, can you review the Q1 budget proposal by end of day?',
    icon: '✉️', priority: 'normal',
    actions: [{label: 'Reply', action: '/mail/compose?to=sarah', primary: true}, {label: 'Mark read', action: 'dismiss'}],
    url: '/mail/thread/budget-q1',
    createdAt: new Date(Date.now() - 300000).toISOString(), read: false, userId: 'u1',
  },
  {
    id: 'n2', sourceApp: 'docs', type: 'mention', title: 'Arjun mentioned you in Project Plan',
    body: '@indu can you update the timeline section?',
    icon: '📝', priority: 'normal',
    actions: [{label: 'Open doc', action: '/docs/project-plan', primary: true}],
    url: '/docs/project-plan',
    createdAt: new Date(Date.now() - 1800000).toISOString(), read: false, userId: 'u1',
  },
  {
    id: 'n3', sourceApp: 'calendar', type: 'calendar', title: 'Sprint Review in 30 minutes',
    body: 'Team standup meeting at 3:00 PM — Conference Room B',
    icon: '📅', priority: 'urgent',
    actions: [{label: 'Join', action: '/calendar/event/sprint-review', primary: true}, {label: 'Snooze 5m', action: 'snooze:5'}],
    url: '/calendar/event/sprint-review',
    createdAt: new Date(Date.now() - 60000).toISOString(), read: false, userId: 'u1',
  },
  {
    id: 'n4', sourceApp: 'drive', type: 'file', title: 'Upload complete',
    body: 'report-q1.pdf (2.4 MB) uploaded successfully to /Reports',
    icon: '📁', priority: 'low',
    actions: [{label: 'Open', action: '/drive/reports'}],
    url: '/drive/reports',
    createdAt: new Date(Date.now() - 3600000).toISOString(), read: true, userId: 'u1',
  },
  {
    id: 'n5', sourceApp: 'tasks', type: 'task', title: 'Task due today',
    body: 'Prepare sprint demo slides is due today',
    icon: '📋', priority: 'high' as NotificationPriority,
    actions: [{label: 'View task', action: '/tasks/6', primary: true}],
    url: '/tasks/6',
    createdAt: new Date(Date.now() - 7200000).toISOString(), read: false, userId: 'u1',
  },
  {
    id: 'n6', sourceApp: 'docs', type: 'document', title: 'Sarah edited Project Plan',
    body: 'Changed timeline section — 3 additions, 1 removal',
    icon: '📝', priority: 'low',
    actions: [{label: 'View changes', action: '/docs/project-plan/history'}],
    url: '/docs/project-plan',
    createdAt: new Date(Date.now() - 5400000).toISOString(), read: true, userId: 'u1',
    batchId: 'batch_docs_project-plan',
  },
  {
    id: 'n7', sourceApp: 'system', type: 'system', title: 'Storage almost full',
    body: 'You\'re using 4.9 GB of 5 GB. Consider cleaning up old files.',
    icon: '⚠️', priority: 'low',
    actions: [{label: 'Manage storage', action: '/drive/storage'}],
    createdAt: new Date(Date.now() - 86400000).toISOString(), read: true, userId: 'u1',
  },
];

// ── Query Functions ──

export function getNotifications(userId: string, options?: {unreadOnly?: boolean; limit?: number}): AppNotification[] {
  let result = notifications.filter(n => n.userId === userId);

  if (options?.unreadOnly) {
    result = result.filter(n => !n.read);
  }

  return result
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, options?.limit ?? 50);
}

export function getUnreadCount(userId: string): number {
  return notifications.filter(n => n.userId === userId && !n.read).length;
}

export function markAsRead(notificationId: string): boolean {
  const n = notifications.find(n => n.id === notificationId);
  if (n) { n.read = true; return true; }
  return false;
}

export function markAllAsRead(userId: string): number {
  let count = 0;
  for (const n of notifications) {
    if (n.userId === userId && !n.read) { n.read = true; count++; }
  }
  return count;
}

export function pushNotification(input: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
  const notification: AppNotification = {
    ...input,
    id: `n_${Date.now()}`,
    createdAt: new Date().toISOString(),
    read: false,
  };

  // Smart batching: if similar notification exists within 60s, group them
  const recent = notifications.find(n =>
    n.sourceApp === input.sourceApp &&
    n.type === input.type &&
    !n.read &&
    Date.now() - new Date(n.createdAt).getTime() < 60000
  );

  if (recent) {
    notification.batchId = `batch_${input.sourceApp}_${Date.now()}`;
    recent.batchId = notification.batchId;
  }

  notifications.unshift(notification);
  return notification;
}

// ── SSE Helper ──

/**
 * Format a notification as an SSE event.
 */
export function notificationToSSE(notification: AppNotification): string {
  return `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
}

/**
 * Create an SSE stream handler for Express/Fastify.
 */
export function createSSEHandler(userId: string): {headers: Record<string, string>; onNotification: (n: AppNotification) => string} {
  return {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
    onNotification: (n) => {
      if (n.userId === userId) {
        return notificationToSSE(n);
      }
      return '';
    },
  };
}
