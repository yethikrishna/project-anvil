/**
 * useChannels — React hook for real-time channel messaging.
 *
 * Manages:
 * - Channel list with unread counts
 * - Message history for active channel (paginated)
 * - Real-time updates via SSE
 * - Typing indicators
 * - Reactions
 * - Read receipts
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Channel, ChannelMessage } from './channels-db';

export type { Channel, ChannelMessage };

interface UseChannelsOptions {
  userId?: string;
}

interface TypingUser {
  userId: string;
  since: number;
}

export function useChannels({ userId = 'default' }: UseChannelsOptions = {}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('ch_general');
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, string>>({}); // userId → status

  const esRef = useRef<EventSource | null>(null);
  const typingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ── Load channels ──
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch {
      console.error('[useChannels] Failed to load channels');
    }
  }, [userId]);

  // ── Load messages for a channel ──
  const loadMessages = useCallback(async (channelId: string, before?: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ channelId, limit: '50' });
      if (before) params.set('before', String(before));

      const res = await fetch(`/api/channels/messages?${params}`);
      const data = await res.json();

      setMessages(prev =>
        before ? [...(data.messages ?? []), ...prev] : (data.messages ?? [])
      );
      setHasMore(data.hasMore ?? false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Load more (pagination) ──
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || messages.length === 0) return;
    loadMessages(activeChannelId, messages[0].createdAt);
  }, [hasMore, isLoading, messages, activeChannelId, loadMessages]);

  // ── Switch channel ──
  const switchChannel = useCallback(async (channelId: string) => {
    setActiveChannelId(channelId);
    setMessages([]);
    setTypingUsers([]);
    await loadMessages(channelId);

    // Mark as read
    // Will be called after messages load and last message is known
  }, [loadMessages]);

  // ── Send message ──
  const sendMessage = useCallback(async (
    content: string,
    opts: { type?: ChannelMessage['type']; threadId?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<ChannelMessage | null> => {
    try {
      const res = await fetch('/api/channels/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannelId,
          userId,
          content,
          type: opts.type ?? 'text',
          threadId: opts.threadId,
          metadata: opts.metadata,
        }),
      });
      const msg = await res.json();
      // SSE will deliver the message; but also update locally for instant feedback
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Update channel last message
      loadChannels();
      return msg;
    } catch {
      return null;
    }
  }, [activeChannelId, userId, loadChannels]);

  // ── Toggle reaction ──
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      const res = await fetch('/api/channels/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, userId, emoji }),
      });
      const data = await res.json();
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, reactions: data.reactions } : m)
      );
    } catch { /* ignore */ }
  }, [userId]);

  // ── Typing indicator ──
  const sendTyping = useCallback(async (isTyping: boolean) => {
    try {
      await fetch('/api/channels/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, userId, isTyping }),
      });
    } catch { /* ignore */ }
  }, [activeChannelId, userId]);

  // ── Mark read ──
  const markRead = useCallback(async (messageId: string) => {
    try {
      await fetch('/api/channels/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, userId, messageId }),
      });
      setChannels(prev =>
        prev.map(c => c.id === activeChannelId ? { ...c, unreadCount: 0 } : c)
      );
    } catch { /* ignore */ }
  }, [activeChannelId, userId]);

  // ── SSE connection ──
  useEffect(() => {
    const params = new URLSearchParams({ userId });
    const es = new EventSource(`/api/channels/events?${params}`);
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));

    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data) as { channelId: string; message: ChannelMessage };
        if (data.channelId === activeChannelId) {
          setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
        // Update unread counts for other channels
        loadChannels();
      } catch { /* ignore */ }
    });

    es.addEventListener('message_edited', (e) => {
      try {
        const data = JSON.parse(e.data) as { id: string; content: string; editedAt: number };
        setMessages(prev =>
          prev.map(m => m.id === data.id
            ? { ...m, content: data.content, editedAt: data.editedAt }
            : m
          )
        );
      } catch { /* ignore */ }
    });

    es.addEventListener('message_deleted', (e) => {
      try {
        const data = JSON.parse(e.data) as { id: string };
        setMessages(prev => prev.filter(m => m.id !== data.id));
      } catch { /* ignore */ }
    });

    es.addEventListener('reaction', (e) => {
      try {
        const data = JSON.parse(e.data) as { messageId: string; reactions: Record<string, string[]> };
        setMessages(prev =>
          prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m)
        );
      } catch { /* ignore */ }
    });

    es.addEventListener('typing', (e) => {
      try {
        const data = JSON.parse(e.data) as { channelId: string; userId: string; isTyping: boolean };
        if (data.channelId !== activeChannelId) return;
        if (data.userId === userId) return; // ignore self

        if (data.isTyping) {
          setTypingUsers(prev => {
            if (prev.some(t => t.userId === data.userId)) return prev;
            return [...prev, { userId: data.userId, since: Date.now() }];
          });
          // Auto-clear after 5s
          const key = data.userId;
          if (typingTimersRef.current.has(key)) {
            clearTimeout(typingTimersRef.current.get(key)!);
          }
          typingTimersRef.current.set(key, setTimeout(() => {
            setTypingUsers(prev => prev.filter(t => t.userId !== key));
            typingTimersRef.current.delete(key);
          }, 5000));
        } else {
          setTypingUsers(prev => prev.filter(t => t.userId !== data.userId));
          const timer = typingTimersRef.current.get(data.userId);
          if (timer) { clearTimeout(timer); typingTimersRef.current.delete(data.userId); }
        }
      } catch { /* ignore */ }
    });

    es.addEventListener('presence', (e) => {
      try {
        const data = JSON.parse(e.data) as { userId: string; status: string };
        setOnlineUsers(prev => ({ ...prev, [data.userId]: data.status }));
      } catch { /* ignore */ }
    });

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [userId, activeChannelId, loadChannels]);

  // ── Initial load ──
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (activeChannelId) {
      loadMessages(activeChannelId);
    }
  }, [activeChannelId, loadMessages]);

  // ── Mark read when messages load ──
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      markRead(lastMsg.id);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    channels,
    activeChannelId,
    messages,
    isLoading,
    hasMore,
    typingUsers,
    connected,
    onlineUsers,
    switchChannel,
    sendMessage,
    toggleReaction,
    sendTyping,
    markRead,
    loadMore,
    refreshChannels: loadChannels,
  };
}
