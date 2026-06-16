/**
 * NewAlbumModal — create a new album (optionally from selected photos).
 */

'use client';

import { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { usePhotosStore } from '@/lib/store';
import { createAlbum } from '@/lib/api';

interface Props {
  onClose: () => void;
}

export default function NewAlbumModal({ onClose }: Props) {
  const { selectedIds, clearSelection, setAlbums, albums } = usePhotosStore();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const photoCount = selectedIds.size;

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const album = await createAlbum(
        title.trim(),
        photoCount > 0 ? Array.from(selectedIds) : undefined,
      );
      setAlbums([album, ...albums]);
      clearSelection();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create album');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <FolderPlus size={18} className="text-blue-400" />
            <h2 className="font-semibold text-sm">New Album</h2>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="block text-xs text-neutral-400 mb-1.5">Album title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Summer 2025"
            autoFocus
            className="w-full bg-neutral-800 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 transition-all"
          />

          {photoCount > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              Will add {photoCount} selected photo{photoCount !== 1 ? 's' : ''} to this album.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
