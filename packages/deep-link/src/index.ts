/**
 * @anvil/deep-link — Universal deep linking across all Anvil apps.
 *
 * Features:
 * - Every app state = a URL (universal URL scheme)
 * - Shareable deep links with permission scoping
 * - Link expiration + password protection + one-time view
 * - Cross-app deep linking (email → doc, calendar → drive)
 * - Shell router integration
 */

// ── Types ──

export type DeepLinkApp = 'docs' | 'drive' | 'gmail' | 'calendar' | 'tasks' | 'youtube' | 'search' | 'admin' | 'marketplace' | 'blog';
export type DeepLinkAction = 'view' | 'edit' | 'share' | 'download' | 'compose' | 'search';

export interface DeepLink {
  app: DeepLinkApp;
  action: DeepLinkAction;
  resourceType: string;
  resourceId: string;
  params?: Record<string, string>;
  state?: Record<string, unknown>;
}

export interface ShareableLink {
  id: string;
  deepLink: DeepLink;
  url: string;
  shortUrl: string;
  createdAt: string;
  createdBy: string;
  expiresAt?: string;
  passwordHash?: string;
  oneTimeView: boolean;
  viewCount: number;
  maxViews?: number;
  permissions: ('view' | 'edit' | 'comment')[];
}

export interface CrossAppLink {
  from: {app: DeepLinkApp; resource: string};
  to: {app: DeepLinkApp; resource: string};
  label: string;
}

// ── URL Builder ──

const APP_BASE_PATHS: Record<DeepLinkApp, string> = {
  docs: '/docs',
  drive: '/drive',
  gmail: '/gmail',
  calendar: '/calendar',
  tasks: '/tasks',
  youtube: '/youtube',
  search: '/search',
  admin: '/admin',
  marketplace: '/marketplace',
  blog: '/blog',
};

export function deepLinkToUrl(link: DeepLink): string {
  const base = APP_BASE_PATHS[link.app] || '/';

  switch (link.resourceType) {
    case 'document':
      return `${base}/editor/${link.resourceId}`;
    case 'file':
      return `${base}/file/${link.resourceId}`;
    case 'email':
      return `${base}/message/${link.resourceId}`;
    case 'event':
      return `${base}/event/${link.resourceId}`;
    case 'task':
      return `${base}/task/${link.resourceId}`;
    case 'video':
      return `${base}/video/${link.resourceId}`;
    case 'search':
      return `${base}/?q=${encodeURIComponent(link.resourceId)}`;
    default:
      return `${base}/${link.resourceType}/${link.resourceId}`;
  }
}

export function urlToDeepLink(url: string): DeepLink | null {
  try {
    const parsed = new URL(url, 'http://localhost');
    const path = parsed.pathname;
    const params = Object.fromEntries(parsed.searchParams.entries());

    // Match patterns
    const patterns: {regex: RegExp; app: DeepLinkApp; resourceType: string; action: DeepLinkAction}[] = [
      {regex: /\/docs\/editor\/([^/]+)/, app: 'docs', resourceType: 'document', action: 'edit'},
      {regex: /\/drive\/file\/([^/]+)/, app: 'drive', resourceType: 'file', action: 'view'},
      {regex: /\/gmail\/message\/([^/]+)/, app: 'gmail', resourceType: 'email', action: 'view'},
      {regex: /\/calendar\/event\/([^/]+)/, app: 'calendar', resourceType: 'event', action: 'view'},
      {regex: /\/tasks\/task\/([^/]+)/, app: 'tasks', resourceType: 'task', action: 'view'},
      {regex: /\/youtube\/video\/([^/]+)/, app: 'youtube', resourceType: 'video', action: 'view'},
      {regex: /\/search\/?\?q=(.+)/, app: 'search', resourceType: 'search', action: 'search'},
    ];

    for (const {regex, app, resourceType, action} of patterns) {
      const match = path.match(regex);
      if (match) {
        return {
          app,
          action,
          resourceType,
          resourceId: decodeURIComponent(match[1]),
          params: Object.keys(params).length > 0 ? params : undefined,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Shareable Links ──

const sharedLinks = new Map<string, ShareableLink>();

export function createShareableLink(
  deepLink: DeepLink,
  options: {
    createdBy: string;
    expiresInHours?: number;
    password?: string;
    oneTimeView?: boolean;
    maxViews?: number;
    permissions?: ('view' | 'edit' | 'comment')[];
  }
): ShareableLink {
  const id = generateId();
  const url = deepLinkToUrl(deepLink);
  const shortUrl = `/s/${id}`;

  const link: ShareableLink = {
    id,
    deepLink,
    url,
    shortUrl,
    createdAt: new Date().toISOString(),
    createdBy: options.createdBy,
    expiresAt: options.expiresInHours
      ? new Date(Date.now() + options.expiresInHours * 3600000).toISOString()
      : undefined,
    passwordHash: options.password ? simpleHash(options.password) : undefined,
    oneTimeView: options.oneTimeView ?? false,
    viewCount: 0,
    maxViews: options.maxViews,
    permissions: options.permissions ?? ['view'],
  };

  sharedLinks.set(id, link);
  return link;
}

export function resolveShareableLink(id: string, password?: string): {link: ShareableLink; valid: boolean; error?: string} {
  const link = sharedLinks.get(id);
  if (!link) return {link: null as any, valid: false, error: 'Link not found'};

  // Check expiry
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return {link, valid: false, error: 'Link expired'};
  }

  // Check password
  if (link.passwordHash && password) {
    if (simpleHash(password) !== link.passwordHash) {
      return {link, valid: false, error: 'Incorrect password'};
    }
  } else if (link.passwordHash) {
    return {link, valid: false, error: 'Password required'};
  }

  // Check one-time view
  if (link.oneTimeView && link.viewCount >= 1) {
    return {link, valid: false, error: 'Link has already been viewed'};
  }

  // Check max views
  if (link.maxViews && link.viewCount >= link.maxViews) {
    return {link, valid: false, error: 'Maximum views reached'};
  }

  // Increment view count
  link.viewCount++;

  return {link, valid: true};
}

// ── Cross-App Links ──

export const CROSS_APP_LINKS: CrossAppLink[] = [
  {from: {app: 'gmail', resource: 'email'}, to: {app: 'docs', resource: 'document'}, label: 'Create document from email'},
  {from: {app: 'gmail', resource: 'email'}, to: {app: 'tasks', resource: 'task'}, label: 'Create task from email'},
  {from: {app: 'calendar', resource: 'event'}, to: {app: 'docs', resource: 'document'}, label: 'Open meeting notes'},
  {from: {app: 'calendar', resource: 'event'}, to: {app: 'drive', resource: 'file'}, label: 'Open attachments'},
  {from: {app: 'docs', resource: 'document'}, to: {app: 'drive', resource: 'file'}, label: 'Save to Drive'},
  {from: {app: 'docs', resource: 'document'}, to: {app: 'gmail', resource: 'email'}, label: 'Send via email'},
  {from: {app: 'drive', resource: 'file'}, to: {app: 'docs', resource: 'document'}, label: 'Open in Docs'},
  {from: {app: 'tasks', resource: 'task'}, to: {app: 'calendar', resource: 'event'}, label: 'Add to calendar'},
  {from: {app: 'youtube', resource: 'video'}, to: {app: 'docs', resource: 'document'}, label: 'Create notes from transcript'},
  {from: {app: 'search', resource: 'search'}, to: {app: 'drive', resource: 'file'}, label: 'Find in Drive'},
];

export function getCrossAppLinks(fromApp: DeepLinkApp, resourceType: string): CrossAppLink[] {
  return CROSS_APP_LINKS.filter(l => l.from.app === fromApp && l.from.resource === resourceType);
}

// ── Helpers ──

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
