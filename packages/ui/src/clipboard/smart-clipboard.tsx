'use client';

/**
 * Smart Clipboard — copy file from Drive → paste into Gmail as attachment.
 *
 * Uses the Clipboard API with custom clipboard data types.
 * When a file is "copied" in Drive, it stores a reference.
 * When "pasting" in Gmail compose, it converts to an attachment.
 */

import {useState, useCallback, useEffect} from 'react';

export interface ClipboardItem {
  type: 'file' | 'image' | 'text' | 'contact' | 'location' | 'link';
  sourceApp: string;
  id: string;
  name: string;
  data: Record<string, string>;
  copiedAt: string;
}

const CLIPBOARD_KEY = 'anvil-smart-clipboard';

// ── Hook ──

export function useSmartClipboard() {
  const [clipboardItem, setClipboardItem] = useState<ClipboardItem | null>(null);
  const [pasteTarget, setPasteTarget] = useState<string | null>(null);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CLIPBOARD_KEY);
      if (stored) {
        setClipboardItem(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const copy = useCallback((item: Omit<ClipboardItem, 'copiedAt'>) => {
    const clipItem: ClipboardItem = {...item, copiedAt: new Date().toISOString()};
    setClipboardItem(clipItem);
    sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipItem));

    // Also write to native clipboard as plain text fallback
    if (navigator.clipboard) {
      navigator.clipboard.writeText(item.name).catch(() => {});
    }
  }, []);

  const paste = useCallback((): ClipboardItem | null => {
    return clipboardItem;
  }, [clipboardItem]);

  const clear = useCallback(() => {
    setClipboardItem(null);
    sessionStorage.removeItem(CLIPBOARD_KEY);
  }, []);

  const canPaste = useCallback((targetApp: string): boolean => {
    if (!clipboardItem) return false;

    // Define compatible source → target mappings
    const compatibility: Record<string, string[]> = {
      file: ['gmail', 'docs', 'tasks'],
      image: ['gmail', 'docs'],
      contact: ['gmail', 'docs'],
      location: ['gmail', 'docs'],
      link: ['gmail', 'docs', 'search'],
      text: ['gmail', 'docs', 'search', 'tasks'],
    };

    return compatibility[clipboardItem.type]?.includes(targetApp) ?? false;
  }, [clipboardItem]);

  return {
    clipboardItem,
    copy,
    paste,
    clear,
    canPaste,
  };
}

// ── Paste Handler Factories ──

export function handleFilePaste(item: ClipboardItem): {attachment: {name: string; url: string; size: string}} {
  return {
    attachment: {
      name: item.name,
      url: item.data.downloadUrl ?? `/api/files/${item.id}/download`,
      size: item.data.size ?? 'Unknown',
    },
  };
}

export function handleLocationPaste(item: ClipboardItem): string {
  return `📍 ${item.name}\n${item.data.address ?? ''}\nMap: https://maps.google.com/?q=${item.data.lat ?? ''},${item.data.lng ?? ''}`;
}

export function handleContactPaste(item: ClipboardItem): {name: string; email: string} {
  return {
    name: item.name,
    email: item.data.email ?? '',
  };
}

export function handleLinkPaste(item: ClipboardItem): string {
  return `[${item.name}](${item.data.url ?? '#'})`;
}

// ── Paste Suggestion Component ──

export function PasteSuggestion({
  clipboard,
  targetApp,
  onPaste,
}: {
  clipboard: ReturnType<typeof useSmartClipboard>;
  targetApp: string;
  onPaste: (item: ClipboardItem) => void;
}) {
  if (!clipboard.clipboardItem || !clipboard.canPaste(targetApp)) return null;

  const item = clipboard.clipboardItem;
  const timeSinceCopy = Date.now() - new Date(item.copiedAt).getTime();
  const isRecent = timeSinceCopy < 60000; // Less than 1 minute

  if (!isRecent && timeSinceCopy > 300000) {
    // Older than 5 minutes, don't show
    return null;
  }

  const typeIcons: Record<string, string> = {
    file: '📋',
    image: '🖼️',
    text: '📝',
    contact: '👤',
    location: '📍',
    link: '🔗',
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
      <span>{typeIcons[item.type]}</span>
      <span className="text-gray-700 dark:text-gray-300">
        Paste <strong>{item.name}</strong> from {item.sourceApp}?
      </span>
      <button
        onClick={() => onPaste(item)}
        className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
      >
        Paste
      </button>
      <button
        onClick={clipboard.clear}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  );
}
