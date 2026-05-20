/**
 * YouTube app — Zustand store for playlists
 */

import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channel: string;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: string;
}

interface PlaylistStore {
  playlists: Playlist[];
  createPlaylist: (name: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, item: Omit<PlaylistItem, 'addedAt'>) => void;
  removeFromPlaylist: (playlistId: string, videoId: string) => void;
  isInPlaylist: (playlistId: string, videoId: string) => boolean;
}

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set, get) => ({
      playlists: [],

      createPlaylist: (name: string) => {
        const id = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set(state => ({
          playlists: [
            ...state.playlists,
            {id, name, items: [], createdAt: new Date().toISOString()},
          ],
        }));
        return id;
      },

      deletePlaylist: (id: string) => {
        set(state => ({
          playlists: state.playlists.filter(p => p.id !== id),
        }));
      },

      renamePlaylist: (id: string, name: string) => {
        set(state => ({
          playlists: state.playlists.map(p =>
            p.id === id ? {...p, name} : p
          ),
        }));
      },

      addToPlaylist: (playlistId: string, item) => {
        set(state => ({
          playlists: state.playlists.map(p =>
            p.id === playlistId
              ? {
                  ...p,
                  items: [
                    ...p.items,
                    {...item, addedAt: new Date().toISOString()},
                  ],
                }
              : p
          ),
        }));
      },

      removeFromPlaylist: (playlistId: string, videoId: string) => {
        set(state => ({
          playlists: state.playlists.map(p =>
            p.id === playlistId
              ? {...p, items: p.items.filter(i => i.videoId !== videoId)}
              : p
          ),
        }));
      },

      isInPlaylist: (playlistId: string, videoId: string) => {
        const playlist = get().playlists.find(p => p.id === playlistId);
        return playlist?.items.some(i => i.videoId === videoId) ?? false;
      },
    }),
    {
      name: 'anvil-youtube-playlists',
    }
  )
);
