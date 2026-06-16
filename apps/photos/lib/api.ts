/**
 * Photo API client — wraps fetch calls to /api/photos/* routes.
 */

import type { PhotoItem, AlbumItem, FaceClusterItem } from './store';

const BASE = '/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'API error');
  }
  return res.json();
}

// ── Photos ──

export interface PhotoListResponse {
  photos: PhotoItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchPhotos(params: {
  page?: number;
  pageSize?: number;
  view?: string;
  albumId?: string;
  query?: string;
  sceneType?: string;
  year?: number;
  month?: number;
  personId?: string;
}): Promise<PhotoListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) qs.set(k, String(v));
  });
  return apiFetch<PhotoListResponse>(`/photos?${qs}`);
}

export async function fetchPhoto(id: string): Promise<PhotoItem> {
  return apiFetch<PhotoItem>(`/photos/${id}`);
}

export async function toggleFavourite(id: string, value: boolean): Promise<void> {
  await apiFetch(`/photos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isFavourite: value }),
  });
}

export async function archivePhotos(ids: string[]): Promise<void> {
  await apiFetch('/photos/batch', {
    method: 'PATCH',
    body: JSON.stringify({ ids, action: 'archive' }),
  });
}

export async function deletePhotos(ids: string[]): Promise<void> {
  await apiFetch('/photos/batch', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

// ── Upload ──

export async function uploadPhoto(
  file: File,
  onProgress: (pct: number) => void,
): Promise<PhotoItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as PhotoItem);
      } else {
        reject(new Error(xhr.statusText));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('POST', `${BASE}/upload`);
    xhr.send(form);
  });
}

// ── Albums ──

export async function fetchAlbums(): Promise<AlbumItem[]> {
  const data = await apiFetch<{ albums: AlbumItem[] }>('/albums');
  return data.albums;
}

export async function createAlbum(title: string, photoIds?: string[]): Promise<AlbumItem> {
  return apiFetch<AlbumItem>('/albums', {
    method: 'POST',
    body: JSON.stringify({ title, photoIds }),
  });
}

export async function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<void> {
  await apiFetch(`/albums/${albumId}/photos`, {
    method: 'POST',
    body: JSON.stringify({ photoIds }),
  });
}

export async function deleteAlbum(id: string): Promise<void> {
  await apiFetch(`/albums/${id}`, { method: 'DELETE' });
}

export async function shareAlbum(id: string): Promise<{ shareUrl: string }> {
  return apiFetch<{ shareUrl: string }>(`/albums/${id}/share`, { method: 'POST' });
}

// ── Faces ──

export async function fetchFaces(): Promise<FaceClusterItem[]> {
  const data = await apiFetch<{ faces: FaceClusterItem[] }>('/faces');
  return data.faces;
}

export async function nameFace(clusterId: string, name: string): Promise<void> {
  await apiFetch(`/faces/${clusterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

// ── Search ──

export async function searchPhotos(query: string): Promise<PhotoItem[]> {
  const data = await apiFetch<{ photos: PhotoItem[] }>(`/search?q=${encodeURIComponent(query)}`);
  return data.photos;
}

// ── Stats ──

export interface PhotoStats {
  totalPhotos: number;
  totalSizeBytes: number;
  photosByMonth: Array<{ year: number; month: number; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
  duplicateCount: number;
}

export async function fetchStats(): Promise<PhotoStats> {
  return apiFetch<PhotoStats>('/stats');
}
