/**
 * ContextIndicator — shows what the AI knows about the current conversation.
 *
 * Displays: files referenced, people mentioned, topics, preferences discovered,
 * tool actions taken. Compact chip-based UI.
 */

'use client';

import { useState } from 'react';
import type { ConversationContext } from '@/lib/types';

interface Props {
  context: ConversationContext;
}

export default function ContextIndicator({ context }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { files, people, topics, preferences, actions } = context;

  const totalContext =
    files.length + people.length + topics.length + preferences.length + actions.length;

  if (totalContext === 0) return null;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 px-4 py-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full text-left"
      >
        <span className={expanded ? 'rotate-90' : ''} style={{ display: 'inline-block', transition: 'transform 0.15s' }}>▸</span>
        <span>Context: {totalContext} item{totalContext !== 1 ? 's' : ''}</span>
        <span className="flex gap-1 ml-1">
          {files.length > 0 && <span className="px-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-500">📄 {files.length}</span>}
          {people.length > 0 && <span className="px-1 rounded bg-green-50 dark:bg-green-950 text-green-500">👥 {people.length}</span>}
          {topics.length > 0 && <span className="px-1 rounded bg-purple-50 dark:bg-purple-950 text-purple-500">📌 {topics.length}</span>}
          {preferences.length > 0 && <span className="px-1 rounded bg-amber-50 dark:bg-amber-950 text-amber-500">⚙️ {preferences.length}</span>}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1.5 pb-1">
          {files.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-gray-500">Files:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {files.slice(-5).map((f, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 truncate max-w-[140px]" title={f.name}>
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {people.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-gray-500">People:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {people.slice(-8).map((p, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {topics.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-gray-500">Topics:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {topics.slice(-6).map((t, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preferences.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-gray-500">Detected preferences:</span>
              <ul className="mt-0.5">
                {preferences.slice(-4).map((p, i) => (
                  <li key={i} className="text-[10px] text-amber-600 dark:text-amber-400">• {p}</li>
                ))}
              </ul>
            </div>
          )}

          {actions.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-gray-500">
                Actions taken: {actions.length} ({actions.filter(a => a.success).length} succeeded)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
