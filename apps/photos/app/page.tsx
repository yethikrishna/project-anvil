/**
 * Anvil Photos — Main Page
 *
 * Google Photos clone with:
 * - Timeline / grid / map view modes
 * - Infinite scroll with IntersectionObserver
 * - Blur-up photo loading
 * - Multi-select with bulk actions
 * - Lightbox with EXIF info panel
 * - Albums and face clustering sidebar
 * - Drag-and-drop upload with progress
 * - Natural language search ("photos from March", "beach photos")
 * - Duplicate detection via pHash
 * - EXIF metadata extraction (camera, GPS, date)
 * - Map view for geotagged photos
 */

'use client';

import { useEffect, useState } from 'react';
import { usePhotosStore } from '@/lib/store';
import { fetchPhotos, fetchAlbums, fetchFaces } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import PhotoGrid from '@/components/PhotoGrid';
import Lightbox from '@/components/Lightbox';
import MapView from '@/components/MapView';
import NewAlbumModal from '@/components/NewAlbumModal';

export default function PhotosPage() {
  const {
    filters,
    setPhotos,
    setLoading,
    setAlbums,
    setFaces,
    viewMode,
  } = usePhotosStore();

  const [showNewAlbum, setShowNewAlbum] = useState(false);

  // Load photos when filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchPhotos({ ...filters, page: 0, pageSize: 50 })
      .then((res) => {
        if (!cancelled) setPhotos(res.photos, res.total, 0);
      })
      .catch((err) => {
        console.error('Failed to load photos:', err);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [
    filters.view,
    filters.albumId,
    filters.query,
    filters.sceneType,
    filters.year,
    filters.month,
    filters.personId,
  ]);

  // Load albums on mount
  useEffect(() => {
    fetchAlbums().then(setAlbums).catch(console.error);
  }, []);

  // Load faces on mount
  useEffect(() => {
    fetchFaces().then(setFaces).catch(console.error);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950">
      {/* Sidebar */}
      <Sidebar onNewAlbum={() => setShowNewAlbum(true)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {viewMode === 'map' ? (
            <MapView />
          ) : (
            <PhotoGrid />
          )}
        </main>
      </div>

      {/* Lightbox */}
      <Lightbox />

      {/* New Album Modal */}
      {showNewAlbum && (
        <NewAlbumModal onClose={() => setShowNewAlbum(false)} />
      )}
    </div>
  );
}
