/**
 * Client-side state management for Photos with Zustand.
 *
 * Handles:
 * - Photo grid data (paginated)
 * - Selected photos (multi-select)
 * - Active filters (favourites, archive, album, search, date range)
 * - View mode (grid | timeline | map)
 * - Lightbox state
 * - Upload queue
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ── Types ──

export type ViewMode = 'grid' | 'timeline' | 'map';

export interface PhotoItem {
  id: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  originalUrl?: string;
  takenAt?: string;
  camera?: string;
  lat?: number;
  lng?: number;
  locationName?: string;
  aiTags: string[];
  description?: string;
  sceneType?: string;
  isFavourite: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface AlbumItem {
  id: string;
  title: string;
  type: string;
  coverThumbnailUrl?: string;
  photoCount: number;
  isShared: boolean;
  shareToken?: string;
  createdAt: string;
}

export interface FaceClusterItem {
  id: string;
  name?: string;
  coverFaceUrl?: string;
  faceCount: number;
}

export interface UploadTask {
  id: string;
  file: File;
  progress: number; // 0–100
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
  photoId?: string;
}

export interface PhotoFilters {
  view: 'all' | 'favourites' | 'archive' | 'trash';
  albumId?: string;
  query?: string;
  sceneType?: string;
  year?: number;
  month?: number;
  personId?: string;
}

interface PhotosState {
  // View
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Photos
  photos: PhotoItem[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  filters: PhotoFilters;

  // Selection
  selectedIds: Set<string>;
  lightboxPhotoId: string | null;

  // Albums
  albums: AlbumItem[];
  albumsLoaded: boolean;

  // Faces
  faces: FaceClusterItem[];
  facesLoaded: boolean;

  // Upload
  uploadQueue: UploadTask[];
  showUploadPanel: boolean;

  // Actions
  setFilters: (filters: Partial<PhotoFilters>) => void;
  setPhotos: (photos: PhotoItem[], total: number, page: number) => void;
  appendPhotos: (photos: PhotoItem[]) => void;
  setLoading: (loading: boolean) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  openLightbox: (id: string) => void;
  closeLightbox: () => void;
  nextPhoto: () => void;
  prevPhoto: () => void;
  toggleFavourite: (id: string) => void;
  setAlbums: (albums: AlbumItem[]) => void;
  setFaces: (faces: FaceClusterItem[]) => void;
  addUpload: (task: UploadTask) => void;
  updateUpload: (id: string, update: Partial<UploadTask>) => void;
  removeUpload: (id: string) => void;
  setShowUploadPanel: (show: boolean) => void;
  updatePhotoAfterUpload: (photoId: string, data: Partial<PhotoItem>) => void;
}

export const usePhotosStore = create<PhotosState>()(
  subscribeWithSelector((set, get) => ({
    viewMode: 'timeline',
    photos: [],
    total: 0,
    page: 0,
    pageSize: 50,
    loading: false,
    filters: { view: 'all' },
    selectedIds: new Set(),
    lightboxPhotoId: null,
    albums: [],
    albumsLoaded: false,
    faces: [],
    facesLoaded: false,
    uploadQueue: [],
    showUploadPanel: false,

    setViewMode: (mode) => set({ viewMode: mode }),

    setFilters: (filters) =>
      set((s) => ({
        filters: { ...s.filters, ...filters },
        photos: [],
        page: 0,
        total: 0,
        selectedIds: new Set(),
      })),

    setPhotos: (photos, total, page) => set({ photos, total, page, loading: false }),

    appendPhotos: (more) =>
      set((s) => ({
        photos: [...s.photos, ...more],
        page: s.page + 1,
        loading: false,
      })),

    setLoading: (loading) => set({ loading }),

    toggleSelect: (id) =>
      set((s) => {
        const next = new Set(s.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedIds: next };
      }),

    selectAll: () =>
      set((s) => ({ selectedIds: new Set(s.photos.map((p) => p.id)) })),

    clearSelection: () => set({ selectedIds: new Set() }),

    openLightbox: (id) => set({ lightboxPhotoId: id }),

    closeLightbox: () => set({ lightboxPhotoId: null }),

    nextPhoto: () =>
      set((s) => {
        if (!s.lightboxPhotoId) return {};
        const idx = s.photos.findIndex((p) => p.id === s.lightboxPhotoId);
        const next = s.photos[idx + 1];
        return next ? { lightboxPhotoId: next.id } : {};
      }),

    prevPhoto: () =>
      set((s) => {
        if (!s.lightboxPhotoId) return {};
        const idx = s.photos.findIndex((p) => p.id === s.lightboxPhotoId);
        const prev = s.photos[idx - 1];
        return prev ? { lightboxPhotoId: prev.id } : {};
      }),

    toggleFavourite: (id) =>
      set((s) => ({
        photos: s.photos.map((p) =>
          p.id === id ? { ...p, isFavourite: !p.isFavourite } : p,
        ),
      })),

    setAlbums: (albums) => set({ albums, albumsLoaded: true }),

    setFaces: (faces) => set({ faces, facesLoaded: true }),

    addUpload: (task) =>
      set((s) => ({
        uploadQueue: [...s.uploadQueue, task],
        showUploadPanel: true,
      })),

    updateUpload: (id, update) =>
      set((s) => ({
        uploadQueue: s.uploadQueue.map((t) =>
          t.id === id ? { ...t, ...update } : t,
        ),
      })),

    removeUpload: (id) =>
      set((s) => ({
        uploadQueue: s.uploadQueue.filter((t) => t.id !== id),
      })),

    setShowUploadPanel: (show) => set({ showUploadPanel: show }),

    updatePhotoAfterUpload: (photoId, data) => {
      const { filters } = get();
      // Only add to grid if it fits current filter
      if (filters.view === 'all') {
        set((s) => ({
          photos: [
            { id: photoId, ...data } as PhotoItem,
            ...s.photos,
          ],
          total: s.total + 1,
        }));
      }
    },
  })),
);
