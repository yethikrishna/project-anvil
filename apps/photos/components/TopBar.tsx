/**
 * TopBar — search, view toggle, selection actions, upload button.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Grid, Clock, Map, X, Trash2, Album, Check, Filter } from 'lucide-react';
import { usePhotosStore } from '@/lib/store';
import { searchPhotos, deletePhotos, archivePhotos, addPhotosToAlbum } from '@/lib/api';
import UploadZone from './UploadZone';

export default function TopBar() {
  const {
    viewMode, setViewMode,
    selectedIds, clearSelection, selectAll,
    setFilters, filters,
    setPhotos, setLoading,
    photos, total,
  } = usePhotosStore();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCount = selectedIds.size;

  // Debounced search
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) {
      setFilters({ query: undefined });
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      setLoading(true);
      try {
        const results = await searchPhotos(q);
        setPhotos(results, results.length, 0);
        setFilters({ query: q });
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    await deletePhotos(ids);
    clearSelection();
    setPhotos(photos.filter((p) => !selectedIds.has(p.id)), total - ids.length, 0);
  };

  const handleArchiveSelected = async () => {
    const ids = Array.from(selectedIds);
    await archivePhotos(ids);
    clearSelection();
    setPhotos(photos.filter((p) => !selectedIds.has(p.id)), total - ids.length, 0);
  };

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-neutral-800 flex-shrink-0 bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-20">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder='Search photos… try "beach" or "photos from March"'
          className="w-full bg-neutral-800 text-sm text-white placeholder:text-neutral-500 rounded-lg pl-9 pr-8 py-2 outline-none focus:ring-1 focus:ring-blue-500 transition-all"
        />
        {query && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
            onClick={() => { setQuery(''); setFilters({ query: undefined }); }}
          >
            <X size={12} />
          </button>
        )}
        {searching && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border border-neutral-600 border-t-blue-400 rounded-full spin" />
        )}
      </div>

      {/* Selection mode actions */}
      {selectedCount > 0 ? (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm text-neutral-400">{selectedCount} selected</span>
          <button
            onClick={selectAll}
            className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          >
            Select all
          </button>
          <button
            onClick={handleArchiveSelected}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Archive"
          >
            <Album size={15} />
          </button>
          <button
            onClick={handleDeleteSelected}
            className="p-1.5 rounded hover:bg-red-900/40 text-neutral-400 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={clearSelection}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        /* View mode toggles */
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setViewMode('timeline')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'timeline' ? 'bg-white/15 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/10'}`}
            title="Timeline view"
          >
            <Clock size={15} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/10'}`}
            title="Grid view"
          >
            <Grid size={15} />
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'map' ? 'bg-white/15 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/10'}`}
            title="Map view"
          >
            <Map size={15} />
          </button>
        </div>
      )}

      {/* Upload */}
      <div className="ml-2 flex-shrink-0">
        <UploadZone />
      </div>
    </header>
  );
}
