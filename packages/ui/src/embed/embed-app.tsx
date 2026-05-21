'use client';

/**
 * Embeddable Anvil app iframes with custom branding.
 *
 * Features:
 * - Iframe embedding with dynamic theming
 * - SSO passthrough via token propagation
 * - postMessage API for parent ↔ child communication
 * - CSP frame-ancestors configuration
 * - Auto-resize to content
 */

import {useState, useCallback, useEffect, useRef} from 'react';

// ── Types ──

export interface EmbedConfig {
  app: 'docs' | 'drive' | 'gmail' | 'calendar' | 'tasks' | 'search';
  theme?: {
    primary?: string;
    accent?: string;
    dark?: boolean;
    brand?: string;
  };
  token?: string;
  features?: string[];
  onMessage?: (event: EmbedMessage) => void;
}

export interface EmbedMessage {
  type: 'ready' | 'resize' | 'navigate' | 'action' | 'error' | 'auth-required';
  payload: Record<string, unknown>;
  source: string;
  timestamp: string;
}

export interface EmbedAction {
  type: 'navigate' | 'create' | 'open' | 'save' | 'theme' | 'logout';
  payload: Record<string, unknown>;
}

// ── Iframe URL Builder ──

export function buildEmbedUrl(config: EmbedConfig): string {
  const baseUrls: Record<string, string> = {
    docs: process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3002',
    drive: process.env.NEXT_PUBLIC_DRIVE_URL || 'http://localhost:3003',
    gmail: process.env.NEXT_PUBLIC_GMAIL_URL || 'http://localhost:3004',
    calendar: process.env.NEXT_PUBLIC_CALENDAR_URL || 'http://localhost:3001',
    tasks: process.env.NEXT_PUBLIC_TASKS_URL || 'http://localhost:3008',
    search: process.env.NEXT_PUBLIC_SEARCH_URL || 'http://localhost:3005',
  };

  const url = new URL('/embed', baseUrls[config.app] || baseUrls.docs);

  // Theme params
  if (config.theme?.primary) url.searchParams.set('primary', config.theme.primary);
  if (config.theme?.accent) url.searchParams.set('accent', config.theme.accent);
  if (config.theme?.dark) url.searchParams.set('dark', 'true');
  if (config.theme?.brand) url.searchParams.set('brand', config.theme.brand);

  // Features
  if (config.features?.length) {
    url.searchParams.set('features', config.features.join(','));
  }

  return url.toString();
}

// ── Embed Component ──

export function EmbeddedApp({config, className}: {config: EmbedConfig; className?: string}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(600);

  const embedUrl = buildEmbedUrl(config);

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Verify origin
      const allowedOrigins = [
        'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003',
        'http://localhost:3004', 'http://localhost:3005', 'http://localhost:3008',
      ];
      if (!allowedOrigins.some(o => event.origin.startsWith(o))) return;

      const message = event.data as EmbedMessage;
      if (!message?.type) return;

      switch (message.type) {
        case 'ready':
          setReady(true);
          // Send auth token
          if (config.token && iframeRef.current?.contentWindow) {
            sendMessage(iframeRef.current.contentWindow, {
              type: 'auth',
              payload: {token: config.token},
              source: 'anvil-embed-parent',
              timestamp: new Date().toISOString(),
            });
          }
          break;
        case 'resize':
          setHeight(Number(message.payload.height) || 600);
          break;
        case 'auth-required':
          // Parent needs to provide auth
          break;
      }

      config.onMessage?.(message);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [config]);

  // Send action to iframe
  const sendAction = useCallback((action: EmbedAction) => {
    if (!iframeRef.current?.contentWindow) return;
    sendMessage(iframeRef.current.contentWindow, {
      type: 'action',
      payload: action,
      source: 'anvil-embed-parent',
      timestamp: new Date().toISOString(),
    });
  }, []);

  return (
    <div className={`relative ${className || ''}`}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900 z-10">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        className="w-full border-0 rounded-lg"
        style={{height: `${height}px`}}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={`Anvil ${config.app}`}
      />
    </div>
  );
}

// ── Message Utility ──

function sendMessage(target: Window, message: EmbedMessage): void {
  target.postMessage(message, '*'); // In production, use specific origin
}

// ── Embedded App Receiver (runs inside iframe) ──

export function useEmbeddedApp() {
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [parentTheme, setParentTheme] = useState<EmbedConfig['theme']>();
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if we're in an iframe
    const embedded = window !== window.top;
    setIsEmbedded(embedded);

    if (!embedded) return;

    // Notify parent we're ready
    window.parent.postMessage({
      type: 'ready',
      payload: {},
      source: 'anvil-embed-child',
      timestamp: new Date().toISOString(),
    } satisfies EmbedMessage, '*');

    // Listen for parent messages
    const handler = (event: MessageEvent) => {
      const message = event.data as EmbedMessage;
      if (!message?.type) return;

      switch (message.type) {
        case 'auth':
          setAuthToken(message.payload.token as string);
          break;
        case 'action':
          const action = message.payload as EmbedAction;
          if (action.type === 'theme') {
            setParentTheme(action.payload as EmbedConfig['theme']);
          }
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Auto-resize notification
  const notifyResize = useCallback((height: number) => {
    if (!isEmbedded) return;
    window.parent.postMessage({
      type: 'resize',
      payload: {height},
      source: 'anvil-embed-child',
      timestamp: new Date().toISOString(),
    } satisfies EmbedMessage, '*');
  }, [isEmbedded]);

  return {isEmbedded, parentTheme, authToken, notifyResize};
}

// ── CSP Frame-Ancestors Configuration ──

export const EMBED_CSP_HEADER = "frame-ancestors 'self' *.anvil.app localhost:* 127.0.0.1:*";

export function buildFrameAncestorsHeader(allowedOrigins: string[]): string {
  const origins = ["'self'", ...allowedOrigins];
  return `frame-ancestors ${origins.join(' ')}`;
}
