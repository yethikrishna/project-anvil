/**
 * PhotoGrid — virtualized masonry/grid photo display.
 *
 * Features:
 * - Infinite scroll via IntersectionObserver
 * - Blur-up loading (thumbnail → preview)
 * - Timeline grouping by date (month/year headers)
 * - Multi-select with checkbox overlay
 * - Hover controls (favourite, add to album)
 * - Responsive column count (CSS grid)
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { Heart, Plus, CheckCircle } from 'lucide-react';
import { usePhotosStore } from '@/lib/store';
import type { PhotoItem } from '@/lib/store';
import { fetchPhotos } from '@/lib/api';

// ── Helpers ──

function groupByDate(photos: PhotoItem[]): Array<{ label: string; photos: PhotoItem[] }> {
  const groups = new Map<string, PhotoItem[]>();
  for (const p of photos) {
    const date = p.takenAt ? new Date(p.takenAt) : new Date(p.createdAt);
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(p);
  }
  return Array.from(groups.entries()).map(([label, photos]) => ({ label, photos }));
}

function formatGroupLabel(label: string): string {
  // "June 2025" → "June 2025 · 12 photos" is added by consumer
  return label;
}

// ── Photo Tile ──

interface PhotoTileProps {
  photo: PhotoItem;
  selected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onFavourite: () => void;
  showCheckbox: boolean;
}

function PhotoTile({ photo, selected, onSelect, onClick, onFavourite, showCheckbox }: PhotoTileProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const { ref: inViewRef, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  const aspect = photo.width && photo.height
    ? photo.height / photo.width
    : 1;
  const paddingTop = `${Math.min(Math.max(aspect * 100, 60), 160)}%`;

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || showCheckbox) {
      e.preventDefault();
      onSelect();
    } else {
      onClick();
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <div
      ref={inViewRef}
      className="photo-tile group"
      onClick={handleClick}
      style={{ paddingTop }}
    >
      {/* Selected overlay */}
      {selected && (
        <div className="absolute inset-0 bg-blue-500/30 z-10 rounded pointer-events-none" />
      )}

      {/* Image */}
      <div className="absolute inset-0">
        {inView && photo.thumbnailUrl ? (
          <img
            ref={imgRef}
            src={photo.thumbnailUrl}
            alt={photo.originalName ?? photo.filename}
            className="w-full h-full object-cover rounded"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full bg-neutral-800 rounded animate-pulse" />
        )}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded pointer-events-none z-10" />

      {/* Checkbox (top-left) */}
      {(showCheckbox || selected) && (
        <button
          className="photo-checkbox z-20 pointer-events-auto"
          onClick={handleCheckboxClick}
          aria-label={selected ? 'Deselect' : 'Select'}
        >
          {selected
            ? <CheckCircle size={14} className="text-blue-400 fill-blue-400" />
            : <div className="w-3 h-3 border border-white/80 rounded-sm" />}
        </button>
      )}

      {/* Favourite button (top-right, on hover) */}
      <button
        className={`absolute top-2 right-2 z-20 p-1 rounded-full transition-all
          ${photo.isFavourite
            ? 'opacity-100 text-red-400'
            : 'opacity-0 group-hover:opacity-100 text-white/80 hover:text-red-400'}`}
        onClick={(e) => { e.stopPropagation(); onFavourite(); }}
        aria-label={photo.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        <Heart size={16} fill={photo.isFavourite ? 'currentColor' : 'none'} />
      </button>

      {/* Date badge (bottom-left, on hover) */}
      {photo.takenAt && (
        <div className="absolute bottom-1 left-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-white/90 bg-black/60 px-1 py-0.5 rounded">
            {new Date(photo.takenAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            })}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

interface PhotoGridProps {
  columns?: number;
  gap?: number;
}

export default function PhotoGrid({ gap = 2 }: PhotoGridProps) {
  const {
    photos,
    total,
    page,
    pageSize,
    loading,
    filters,
    selectedIds,
    viewMode,
    toggleSelect,
    openLightbox,
    toggleFavourite,
    appendPhotos,
    setLoading,
  } = usePhotosStore();

  const { ref: sentinelRef, inView: sentinelInView } = useInView({ threshold: 0 });
  const showCheckbox = selectedIds.size > 0;
  const hasMore = (page + 1) * pageSize < total;

  // Load next page when sentinel comes into view
  useEffect(() => {
    if (!sentinelInView || loading || !hasMore) return;
    loadMore();
  }, [sentinelInView, loading, hasMore]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPhotos({
        ...filters,
        page: page + 1,
        pageSize,
      });
      appendPhotos(res.photos);
    } catch (err) {
      console.error('loadMore error', err);
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  // Toggle favourite optimistically
  const handleFavourite = async (photo: PhotoItem) => {
    toggleFavourite(photo.id);
    try {
      await fetch(`/api/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavourite: !photo.isFavourite }),
      });
    } catch {
      toggleFavourite(photo.id); // revert
    }
  };

  if (photos.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
        <div className="text-4xl mb-3">📷</div>
        <p className="text-sm">No photos yet. Upload some!</p>
      </div>
    );
  }

  if (viewMode === 'timeline') {
    const groups = groupByDate(photos);
    return (
      <div className="px-4 pb-20">
        {groups.map((group) => (
          <div key={group.label} className="mb-6">
            <div className="date-group-header">
              {group.label}
              <span className="text-neutral-600 ml-2 normal-case font-normal tracking-normal">
                · {group.photos.length} photos
              </span>
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(var(--grid-cols), minmax(0, 1fr))',
                gap: `${gap}px`,
              }}
            >
              {group.photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.has(photo.id)}
                  onSelect={() => toggleSelect(photo.id)}
                  onClick={() => openLightbox(photo.id)}
                  onFavourite={() => handleFavourite(photo)}
                  showCheckbox={showCheckbox}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-8">
            {loading && (
              <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full spin" />
            )}
          </div>
        )}
      </div>
    );
  }

  // Grid view (no date groups)
  return (
    <div className="px-4 pb-20">
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(var(--grid-cols), minmax(0, 1fr))',
          gap: `${gap}px`,
        }}
      >
        {photos.map((photo) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            selected={selectedIds.has(photo.id)}
            onSelect={() => toggleSelect(photo.id)}
            onClick={() => openLightbox(photo.id)}
            onFavourite={() => handleFavourite(photo)}
            showCheckbox={showCheckbox}
          />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loading && (
            <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full spin" />
          )}
        </div>
      )}
    </div>
  );
}
