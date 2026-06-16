/**
 * Lightbox — full-screen photo viewer with keyboard navigation.
 *
 * Features:
 * - Keyboard: ← → navigate, Esc close, F favourite, I info panel
 * - Swipe gestures (touch)
 * - Photo info panel (EXIF, tags, location, faces)
 * - Action bar: download, share, favourite, add to album, delete
 * - Progressive loading: thumbnail → preview → original
 * - Map pin for geotagged photos
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, Heart, Download,
  Share2, Info, Trash2, Plus, MapPin, Camera,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import { usePhotosStore } from '@/lib/store';
import { fetchPhoto } from '@/lib/api';
import type { PhotoItem } from '@/lib/store';

interface DetailPhoto extends PhotoItem {
  previewUrl?: string;
  originalUrl?: string;
  focalLength?: number;
  aperture?: number;
  iso?: number;
  shutterSpeed?: string;
  sizeBytes?: number;
}

export default function Lightbox() {
  const {
    lightboxPhotoId,
    photos,
    closeLightbox,
    nextPhoto,
    prevPhoto,
    toggleFavourite,
  } = usePhotosStore();

  const [detail, setDetail] = useState<DetailPhoto | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const touchStartX = useRef<number | null>(null);

  const currentIndex = photos.findIndex((p) => p.id === lightboxPhotoId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  // Load full photo details
  useEffect(() => {
    if (!lightboxPhotoId) return;
    setDetail(null);
    setZoom(1);
    fetchPhoto(lightboxPhotoId)
      .then((p) => setDetail(p as DetailPhoto))
      .catch(console.error);
  }, [lightboxPhotoId]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxPhotoId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextPhoto();
      if (e.key === 'ArrowLeft') prevPhoto();
      if (e.key === 'i' || e.key === 'I') setShowInfo((s) => !s);
      if (e.key === 'f' || e.key === 'F') {
        if (detail) toggleFavourite(detail.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxPhotoId, detail]);

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) nextPhoto();
      else prevPhoto();
    }
    touchStartX.current = null;
  };

  const handleDownload = () => {
    if (!detail?.originalUrl) return;
    const a = document.createElement('a');
    a.href = detail.originalUrl;
    a.download = detail.originalName ?? detail.filename;
    a.click();
  };

  const handleFavourite = async () => {
    if (!detail) return;
    toggleFavourite(detail.id);
    await fetch(`/api/photos/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavourite: !detail.isFavourite }),
    });
    setDetail((d) => d ? { ...d, isFavourite: !d.isFavourite } : d);
  };

  if (!lightboxPhotoId) return null;

  const photo = detail ?? photos.find((p) => p.id === lightboxPhotoId);
  const imgSrc = detail?.previewUrl ?? detail?.thumbnailUrl ?? photo?.thumbnailUrl;

  return (
    <div
      className="lightbox-overlay"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={closeLightbox}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-1">
          <span className="text-sm text-neutral-400">
            {currentIndex + 1} / {photos.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleFavourite}
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${detail?.isFavourite ? 'text-red-400' : ''}`}
            title="Favourite (F)"
          >
            <Heart size={18} fill={detail?.isFavourite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Download"
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => setShowInfo((s) => !s)}
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${showInfo ? 'bg-white/20' : ''}`}
            title="Info (I)"
          >
            <Info size={18} />
          </button>
        </div>
      </div>

      {/* Prev / Next buttons */}
      {hasPrev && (
        <button
          onClick={prevPhoto}
          className="absolute left-2 z-30 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={nextPhoto}
          className="absolute right-2 z-30 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 transition-colors"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Main image */}
      <div
        className="flex-1 flex items-center justify-center w-full h-full px-16 py-16"
        onClick={closeLightbox}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={photo?.filename ?? ''}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
            style={{ transform: `scale(${zoom})`, transition: 'transform 0.1s' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="w-32 h-32 bg-neutral-800 rounded-xl animate-pulse" />
        )}
      </div>

      {/* Info panel */}
      {showInfo && detail && (
        <InfoPanel photo={detail} onClose={() => setShowInfo(false)} />
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
          className="p-2 rounded-full bg-black/40 hover:bg-black/70 transition-colors"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
          className="p-2 rounded-full bg-black/40 hover:bg-black/70 transition-colors"
        >
          <ZoomOut size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Info Panel ──

function InfoPanel({ photo, onClose }: { photo: DetailPhoto; onClose: () => void }) {
  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 bg-neutral-900 border-l border-neutral-800 overflow-y-auto z-40 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Photo info</h3>
        <button onClick={onClose} className="text-neutral-500 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Thumbnail */}
      {photo.thumbnailUrl && (
        <img
          src={photo.thumbnailUrl}
          alt=""
          className="w-full rounded-lg mb-4 object-cover"
          style={{ maxHeight: 200 }}
        />
      )}

      {/* Date */}
      {photo.takenAt && (
        <InfoRow
          icon="📅"
          label="Taken"
          value={new Date(photo.takenAt).toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        />
      )}

      {/* Camera */}
      {photo.camera && (
        <InfoRow icon="📷" label="Camera" value={photo.camera} />
      )}

      {/* EXIF details */}
      {(photo.focalLength || photo.aperture || photo.iso || photo.shutterSpeed) && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
            <Camera size={12} /> Exposure
          </p>
          <div className="grid grid-cols-2 gap-1 text-xs text-neutral-300">
            {photo.focalLength && <span>⌀ {photo.focalLength}mm</span>}
            {photo.aperture && <span>ƒ/{photo.aperture}</span>}
            {photo.shutterSpeed && <span>{photo.shutterSpeed}</span>}
            {photo.iso && <span>ISO {photo.iso}</span>}
          </div>
        </div>
      )}

      {/* Dimensions */}
      {photo.width && photo.height && (
        <InfoRow
          icon="📐"
          label="Size"
          value={`${photo.width} × ${photo.height}${photo.sizeBytes ? ` · ${formatSize(photo.sizeBytes)}` : ''}`}
        />
      )}

      {/* Location */}
      {(photo.locationName || (photo.lat && photo.lng)) && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
            <MapPin size={12} /> Location
          </p>
          <p className="text-xs text-neutral-300">
            {photo.locationName ?? `${photo.lat?.toFixed(4)}, ${photo.lng?.toFixed(4)}`}
          </p>
          {photo.lat && photo.lng && (
            <a
              href={`https://www.google.com/maps?q=${photo.lat},${photo.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 mt-1 block"
            >
              View on map →
            </a>
          )}
        </div>
      )}

      {/* AI Tags */}
      {photo.aiTags?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1">Tags</p>
          <div className="flex flex-wrap gap-1">
            {photo.aiTags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {photo.description && (
        <InfoRow icon="📝" label="Description" value={photo.description} />
      )}

      {/* Filename */}
      <InfoRow icon="📄" label="Filename" value={photo.originalName ?? photo.filename} />
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-xs text-neutral-500 mb-0.5">
        {icon} {label}
      </p>
      <p className="text-xs text-neutral-300 break-words">{value}</p>
    </div>
  );
}
