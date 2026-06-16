'use client';

/**
 * ChannelsView — Full messaging channels interface.
 *
 * Left sidebar: channel list + DMs
 * Main area: message history with real-time updates
 * Right panel: thread view (optional)
 *
 * Features:
 * - Real-time via SSE
 * - Typing indicators
 * - Reactions
 * - Thread replies
 * - Message search
 * - Read receipts
 * - Presence indicators
 */

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { useChannels } from '@/lib/use-channels';
import type { ChannelMessage, Channel } from '@/lib/channels-db';
import ChannelMessageItem from './ChannelMessageItem';
import TypingIndicator from './TypingIndicator';
import dynamic from 'next/dynamic';

const VideoCallModal = dynamic(() => import('./VideoCallModal'), { ssr: false });

interface ChannelsViewProps {
  userId?: string;
  className?: string;
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-400',
  away: 'bg-amber-400',
  offline: 'bg-gray-500',
};

export default function ChannelsView({ userId = 'default', className = '' }: ChannelsViewProps) {
  const {
    channels, activeChannelId, messages, isLoading, hasMore,
    typingUsers, connected, onlineUsers,
    switchChannel, sendMessage, toggleReaction, sendTyping, loadMore,
  } = useChannels({ userId });

  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [searchResults, setSearchResults] = useState<ChannelMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [threadMessage, setThreadMessage] = useState<ChannelMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChannelMessage | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Handle typing indicator
  const handleInputChange = (val: string) => {
    setInput(val);

    if (val.length > 0) {
      sendTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTyping(false), 3000);
    } else {
      sendTyping(false);
    }
  };

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content) return;

    setInput('');
    sendTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    await sendMessage(content, { threadId: threadMessage?.id });
  }, [input, sendMessage, sendTyping, threadMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/channels/search?q=${encodeURIComponent(q)}&channelId=${activeChannelId}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } finally {
      setIsSearching(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingMessage || !editContent.trim()) return;
    await fetch('/api/channels/messages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingMessage.id, userId, content: editContent.trim() }),
    });
    setEditingMessage(null);
    setEditContent('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    await fetch(`/api/channels/messages?id=${id}&userId=${userId}`, { method: 'DELETE' });
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChannelName.trim(), userId }),
    });
    setNewChannelName('');
    setIsNewChannelOpen(false);
    // channels will update via SSE or we can manually refresh
    window.location.reload();
  };

  // Group consecutive messages by same user
  const groupedMessages = messages.reduce<{ msg: ChannelMessage; isCompact: boolean }[]>((acc, msg, i) => {
    const prev = messages[i - 1];
    const isCompact = Boolean(
      prev &&
      prev.userId === msg.userId &&
      msg.createdAt - prev.createdAt < 5 * 60_000 // within 5 min
    );
    acc.push({ msg, isCompact });
    return acc;
  }, []);

  const displayMessages = showSearch ? searchResults : (groupedMessages.map(g => g.msg));

  return (
    <div className={`flex h-full bg-gray-900 text-gray-100 ${className}`}>
      {/* ── Channel sidebar ── */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 border-r border-white/5 flex flex-col">
        {/* Workspace header */}
        <div className="px-4 py-3 border-b border-white/5">
          <h2 className="font-bold text-gray-100 text-sm">Anvil Workspace</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            <span className="text-[11px] text-gray-500">
              {connected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Channels</span>
            <button
              onClick={() => setIsNewChannelOpen(true)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Create channel"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => switchChannel(ch.id)}
              className={`
                w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md mx-1 transition-colors
                ${ch.id === activeChannelId
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }
              `}
            >
              <span className="text-gray-500">#</span>
              <span className="flex-1 text-left truncate">{ch.name}</span>
              {(ch.unreadCount ?? 0) > 0 && (
                <span className="bg-violet-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-semibold">
                  {ch.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* User status */}
        <div className="px-3 py-3 border-t border-white/5 flex items-center gap-2">
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">
              {userId[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-gray-900 ${STATUS_DOT['online']}`} />
          </div>
          <span className="text-xs text-gray-400 truncate">{userId}</span>
        </div>
      </aside>

      {/* ── Main channel area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <header className="h-12 px-4 flex items-center justify-between border-b border-white/5 flex-shrink-0 bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-medium">#</span>
            <span className="font-semibold text-gray-100 text-sm">
              {activeChannel?.name ?? 'general'}
            </span>
            {activeChannel?.description && (
              <>
                <span className="text-gray-600">|</span>
                <span className="text-xs text-gray-500 truncate max-w-xs">{activeChannel.description}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVideoCall(true)}
              className="p-1.5 rounded-md transition-colors text-gray-400 hover:text-gray-200 hover:bg-white/5"
              title="Start video call"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`p-1.5 rounded-md transition-colors ${showSearch ? 'bg-violet-600/20 text-violet-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
              title="Search messages"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Search bar */}
        {showSearch && (
          <div className="px-4 py-2 bg-gray-800/60 border-b border-white/5">
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
              placeholder="Search messages in this channel..."
              className="w-full bg-gray-700/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-violet-500/50"
              autoFocus
            />
            {isSearching && <p className="text-xs text-gray-500 mt-1">Searching...</p>}
            {!isSearching && searchQuery && (
              <p className="text-xs text-gray-500 mt-1">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {/* Load more */}
          {hasMore && (
            <div className="text-center py-3">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load earlier messages'}
              </button>
            </div>
          )}

          {/* Welcome message */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/20 flex items-center justify-center text-2xl mb-4">
                #
              </div>
              <h3 className="font-semibold text-gray-200 mb-1">Welcome to #{activeChannel?.name ?? 'general'}</h3>
              <p className="text-sm text-gray-500">This is the beginning of the channel. Say hello! 👋</p>
            </div>
          )}

          {/* Message list */}
          {displayMessages.map((msg, i) => {
            const prev = displayMessages[i - 1];
            const isCompact = Boolean(
              !showSearch &&
              prev &&
              prev.userId === msg.userId &&
              msg.createdAt - prev.createdAt < 5 * 60_000
            );
            return (
              <ChannelMessageItem
                key={msg.id}
                message={msg}
                currentUserId={userId}
                onReact={toggleReaction}
                onReply={setThreadMessage}
                onEdit={msg.userId === userId ? setEditingMessage : undefined}
                onDelete={msg.userId === userId ? handleDelete : undefined}
                isCompact={isCompact}
              />
            );
          })}

          {/* Typing indicator */}
          <TypingIndicator typingUsers={typingUsers} />

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input area ── */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/5 bg-gray-900/80">
          {/* Thread context */}
          {threadMessage && (
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 bg-gray-800/60 rounded-lg px-3 py-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span>Replying to <span className="text-gray-300">{threadMessage.displayName ?? threadMessage.userId}</span>: {threadMessage.content.slice(0, 60)}{threadMessage.content.length > 60 ? '…' : ''}</span>
              <button onClick={() => setThreadMessage(null)} className="ml-auto hover:text-gray-300">✕</button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 bg-gray-800/80 border border-white/10 rounded-xl px-3 py-2 focus-within:border-violet-500/50 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message #${activeChannel?.name ?? 'general'}`}
                rows={1}
                className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none resize-none max-h-32"
                style={{ minHeight: '24px' }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── New channel modal ── */}
      {isNewChannelOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-white/10 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="font-semibold text-gray-100 mb-4">Create a channel</h3>
            <input
              type="text"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
              placeholder="channel-name"
              className="w-full bg-gray-700/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-violet-500/50 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsNewChannelOpen(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
                Cancel
              </button>
              <button onClick={handleCreateChannel} disabled={!newChannelName.trim()} className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit message modal ── */}
      {editingMessage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-white/10 rounded-2xl p-6 w-[480px] shadow-2xl">
            <h3 className="font-semibold text-gray-100 mb-4">Edit message</h3>
            <textarea
              value={editContent || editingMessage.content}
              onChange={e => setEditContent(e.target.value)}
              rows={4}
              className="w-full bg-gray-700/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-violet-500/50 resize-none mb-4"
              autoFocus
              onFocus={() => { if (!editContent) setEditContent(editingMessage.content); }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setEditingMessage(null); setEditContent(''); }} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
                Cancel
              </button>
              <button onClick={handleEditSubmit} className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Video call modal ── */}
      {showVideoCall && (
        <VideoCallModal
          userId={userId}
          onClose={() => setShowVideoCall(false)}
        />
      )}
    </div>
  );
}
