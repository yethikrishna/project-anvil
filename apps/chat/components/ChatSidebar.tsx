/**
 * ChatSidebar — conversation history, new chat, app context.
 */

'use client';

import { cn } from '@anvil/ui';
import type { Conversation } from '@/lib/types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed,
  onToggle,
}: Props) {
  if (collapsed) {
    return (
      <div className="w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-3 gap-2">
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500"
          title="Expand sidebar"
        >
          ≡
        </button>
        <button
          onClick={onNew}
          className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-lg"
          title="New chat"
        >
          +
        </button>
      </div>
    );
  }

  // Group conversations by date
  const today = new Date();
  const todayStr = today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = yesterday.toDateString();

  const groups: Record<string, Conversation[]> = { Today: [], Yesterday: [], Earlier: [] };

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt).toDateString();
    if (date === todayStr) groups.Today.push(conv);
    else if (date === yesterdayStr) groups.Yesterday.push(conv);
    else groups.Earlier.push(conv);
  }

  return (
    <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold text-sm">Anvil AI</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onNew}
            className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm hover:bg-blue-700 transition-colors"
            title="New chat"
          >
            +
          </button>
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 text-xs"
          >
            ◀
          </button>
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto chat-scroll">
        {Object.entries(groups).map(([label, convs]) => {
          if (convs.length === 0) return null;
          return (
            <div key={label}>
              <div className="px-3 py-2 text-[10px] font-semibold uppercase text-gray-400 tracking-wider">
                {label}
              </div>
              {convs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group flex items-center',
                    activeId === conv.id && 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
                  )}
                >
                  <span className="truncate flex-1">{conv.title}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-1 text-xs shrink-0"
                    title="Delete"
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
          );
        })}

        {conversations.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">
            No conversations yet.<br />Start one!
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-400">
        Connected to Mail · Drive · Calendar · Docs
      </div>
    </div>
  );
}
