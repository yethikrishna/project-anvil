/**
 * ConversationForkModal — fork a conversation at any message.
 *
 * Creates a new conversation that:
 * 1. Includes all messages up to (and including) the selected message
 * 2. Starts fresh from that point with a user-supplied new direction
 * 3. Preserves conversation context (files, people, topics)
 *
 * This lets users explore "what if I had said X instead?" without
 * losing the original conversation.
 */

'use client';

import { useState, useCallback } from 'react';
import { cn } from '@anvil/ui';
import type { ChatMessage, Conversation } from '@/lib/types';

interface Props {
  conversation: Conversation;
  forkFromMessage: ChatMessage;
  onFork: (forkConfig: ForkConfig) => void;
  onClose: () => void;
}

export interface ForkConfig {
  sourceConversationId: string;
  forkFromMessageId: string;
  messagesUpToFork: ChatMessage[];
  newTitle: string;
  initialPrompt: string;
  preserveContext: boolean;
}

export default function ConversationForkModal({
  conversation,
  forkFromMessage,
  onFork,
  onClose,
}: Props) {
  // Find the index of the message we're forking from
  const msgIndex = conversation.messages.findIndex(m => m.id === forkFromMessage.id);
  const messagesUpToFork = conversation.messages.slice(0, msgIndex + 1);

  const defaultTitle = `${conversation.title} (fork)`;
  const [title, setTitle] = useState(defaultTitle);
  const [prompt, setPrompt] = useState('');
  const [preserveContext, setPreserveContext] = useState(true);

  const handleFork = useCallback(() => {
    if (!title.trim()) return;
    onFork({
      sourceConversationId: conversation.id,
      forkFromMessageId: forkFromMessage.id,
      messagesUpToFork,
      newTitle: title.trim(),
      initialPrompt: prompt.trim(),
      preserveContext,
    });
  }, [title, prompt, preserveContext, conversation, forkFromMessage, messagesUpToFork, onFork]);

  const previewMessages = messagesUpToFork.slice(-3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-lg">
            🌿
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Fork Conversation</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Continue from message {msgIndex + 1} of {conversation.messages.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Fork point preview */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            FORK POINT — last {previewMessages.length} messages
          </p>
          <div className="space-y-1.5">
            {previewMessages.map((msg, i) => (
              <div
                key={msg.id}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg truncate',
                  msg.id === forkFromMessage.id
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 font-medium'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
                )}
              >
                <span className="font-semibold mr-1">
                  {msg.role === 'user' ? 'You:' : 'AI:'}
                </span>
                {msg.content.slice(0, 100)}{msg.content.length > 100 ? '…' : ''}
                {msg.id === forkFromMessage.id && (
                  <span className="ml-2 text-[10px] text-violet-500">← fork here</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Configuration */}
        <div className="px-5 py-4 space-y-4">
          {/* Fork title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fork name
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-gray-400"
              placeholder="Enter fork name..."
              autoFocus
            />
          </div>

          {/* Initial prompt for the fork */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start the fork with... <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-gray-400 resize-none"
              placeholder="Try a different approach, ask something else, or leave empty to continue freely..."
              rows={3}
            />
          </div>

          {/* Context toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Preserve context</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Carry files, people, and topics from the original
              </p>
            </div>
            <button
              onClick={() => setPreserveContext(v => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                preserveContext ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                  preserveContext ? 'translate-x-4.5' : 'translate-x-0.5',
                )}
                style={{ transform: preserveContext ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-5 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span>📨 {messagesUpToFork.length} messages carried</span>
          <span>·</span>
          <span>📁 {conversation.context.files.length} files</span>
          <span>·</span>
          <span>👤 {conversation.context.people.length} people</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleFork}
            disabled={!title.trim()}
            className={cn(
              'px-4 py-2 text-sm rounded-lg font-medium transition-colors',
              title.trim()
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
            )}
          >
            🌿 Fork conversation
          </button>
        </div>
      </div>
    </div>
  );
}
