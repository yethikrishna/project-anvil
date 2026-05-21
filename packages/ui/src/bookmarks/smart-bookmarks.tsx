'use client';

/**
 * Smart bookmarks/pins across all apps + AI-suggested pins.
 *
 * Features:
 * - Pin any item (file, doc, email, video, contact, search query)
 * - Organize into custom groups
 * - AI-suggested pins based on usage patterns
 * - Recent pins, pinned favorites, quick access
 * - Persisted to localStorage
 */

import {useState, useCallback, useEffect, useMemo} from 'react';

// ── Types ──

export interface Bookmark {
  id: string;
  type: 'file' | 'doc' | 'email' | 'video' | 'contact' | 'search' | 'calendar' | 'location' | 'url';
  title: string;
  url: string;
  app: string;
  description?: string;
  icon?: string;
  group?: string;
  pinnedAt: string;
  lastAccessedAt?: string;
  accessCount: number;
  metadata?: Record<string, string>;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

// ── Storage ──

const STORAGE_KEY = 'anvil-bookmarks';

function loadBookmarks(): Bookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: Bookmark[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

// ── Hook ──

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    setBookmarks(loadBookmarks());
  }, []);

  const addBookmark = useCallback((item: Omit<Bookmark, 'id' | 'pinnedAt' | 'accessCount'>) => {
    const bookmark: Bookmark = {
      ...item,
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pinnedAt: new Date().toISOString(),
      accessCount: 0,
    };

    setBookmarks(prev => {
      // Prevent duplicates
      const exists = prev.some(b => b.url === bookmark.url);
      if (exists) return prev;

      const next = [bookmark, ...prev];
      saveBookmarks(next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBookmarks(next);
      return next;
    });
  }, []);

  const accessBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const next = prev.map(b =>
        b.id === id
          ? {...b, accessCount: b.accessCount + 1, lastAccessedAt: new Date().toISOString()}
          : b
      );
      saveBookmarks(next);
      return next;
    });
  }, []);

  const moveBookmark = useCallback((id: string, group: string) => {
    setBookmarks(prev => {
      const next = prev.map(b => b.id === id ? {...b, group} : b);
      saveBookmarks(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback((url: string) => {
    return bookmarks.some(b => b.url === url);
  }, [bookmarks]);

  // AI-suggested pins based on usage
  const suggestions = useMemo(() => {
    const recent = bookmarks
      .filter(b => b.lastAccessedAt)
      .sort((a, b) => new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime())
      .slice(0, 5);

    const frequent = bookmarks
      .filter(b => b.accessCount > 0)
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5);

    return {recent, frequent};
  }, [bookmarks]);

  const groups = useMemo(() => {
    const groupMap = new Map<string, Bookmark[]>();
    for (const b of bookmarks) {
      const group = b.group || 'Ungrouped';
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(b);
    }
    return groupMap;
  }, [bookmarks]);

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    accessBookmark,
    moveBookmark,
    isBookmarked,
    suggestions,
    groups,
  };
}

// ── Bookmark Button Component ──

export function BookmarkButton({url, title, app, type, isBookmarked, onToggle}: {
  url: string;
  title: string;
  app: string;
  type: Bookmark['type'];
  isBookmarked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`p-1.5 rounded-lg transition-colors ${
        isBookmarked
          ? 'text-yellow-500 hover:text-yellow-600'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
      }`}
      title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      aria-pressed={isBookmarked}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

// ── Quick Access Panel ──

export function QuickAccessPanel({bookmarks, onOpen, onRemove}: {
  bookmarks: Bookmark[];
  onOpen: (bookmark: Bookmark) => void;
  onRemove: (id: string) => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        No bookmarks yet. Pin items to see them here.
      </div>
    );
  }

  const TYPE_ICONS: Record<string, string> = {
    file: '📄', doc: '📝', email: '📧', video: '🎬',
    contact: '👤', search: '🔍', calendar: '📅', location: '📍', url: '🔗',
  };

  return (
    <div className="space-y-1">
      {bookmarks.slice(0, 10).map(bm => (
        <div key={bm.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group">
          <span className="text-sm">{TYPE_ICONS[bm.type] || '📌'}</span>
          <button
            onClick={() => onOpen(bm)}
            className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 truncate hover:text-blue-600"
          >
            {bm.title}
          </button>
          <span className="text-[10px] text-gray-400">{bm.app}</span>
          <button
            onClick={() => onRemove(bm.id)}
            className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
