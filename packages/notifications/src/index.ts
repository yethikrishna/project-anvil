// Only re-export client components from barrel
// Server exports are imported directly from '@anvil/notifications/server'
export { NotificationProvider, useNotifications, NotificationBell, NotificationPanel } from './client';
export type { Notification, NotificationEvent } from './client';
