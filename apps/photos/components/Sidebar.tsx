/**
 * Sidebar — navigation, albums, faces, filters.
 */

'use client';

import { useState } from 'react';
import {
  Image, Heart, Archive, Trash2, AlbumIcon, Users,
  MapPin, Clock, Star, BarChart2, ChevronDown, ChevronRight, Plus,
} from 'lucide-react';
import { usePhotosStore } from '@/lib/store';
import type { PhotoFilters, AlbumItem, FaceClusterItem } from '@/lib/store';

interface SidebarProps {
  onNewAlbum?: () => void;
}

export default function Sidebar({ onNewAlbum }: SidebarProps) {
  const { filters, setFilters, albums, faces } = usePhotosStore();
  const [albumsOpen, setAlbumsOpen] = useState(true);
  const [facesOpen, setFacesOpen] = useState(false);

  const setView = (view: PhotoFilters['view']) => {
    setFilters({ view, albumId: undefined, query: undefined, personId: undefined });
  };

  const setAlbum = (albumId: string) => {
    setFilters({ albumId, view: 'all', query: undefined });
  };

  const setPerson = (personId: string) => {
    setFilters({ personId, view: 'all', query: undefined });
  };

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-neutral-900/50 border-r border-neutral-800 h-screen overflow-y-auto py-3">
      {/* App branding */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-orange-500 rounded-md flex items-center justify-center">
            <Image size={13} />
          </div>
          <span className="font-semibold text-sm">Anvil Photos</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="px-2 mb-4">
        <NavItem
          icon={<Image size={15} />}
          label="Photos"
          active={!filters.albumId && !filters.personId && filters.view === 'all'}
          onClick={() => setView('all')}
        />
        <NavItem
          icon={<Heart size={15} />}
          label="Favourites"
          active={filters.view === 'favourites'}
          onClick={() => setView('favourites')}
        />
        <NavItem
          icon={<Archive size={15} />}
          label="Archive"
          active={filters.view === 'archive'}
          onClick={() => setView('archive')}
        />
        <NavItem
          icon={<Trash2 size={15} />}
          label="Trash"
          active={filters.view === 'trash'}
          onClick={() => setView('trash')}
        />
      </nav>

      {/* Albums */}
      <div className="px-2 mb-2">
        <button
          className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors"
          onClick={() => setAlbumsOpen((s) => !s)}
        >
          <span>Albums</span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onNewAlbum?.(); }}
              className="hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors"
              title="New album"
            >
              <Plus size={12} />
            </button>
            {albumsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>
        </button>

        {albumsOpen && (
          <div className="mt-1">
            {albums.length === 0 && (
              <p className="px-3 py-2 text-xs text-neutral-600">No albums yet</p>
            )}
            {albums.map((album) => (
              <AlbumNavItem
                key={album.id}
                album={album}
                active={filters.albumId === album.id}
                onClick={() => setAlbum(album.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* People / Faces */}
      {faces.length > 0 && (
        <div className="px-2 mb-2">
          <button
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors"
            onClick={() => setFacesOpen((s) => !s)}
          >
            <span>People</span>
            {facesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {facesOpen && (
            <div className="mt-1 space-y-0.5">
              {faces.map((face) => (
                <FaceNavItem
                  key={face.id}
                  face={face}
                  active={filters.personId === face.id}
                  onClick={() => setPerson(face.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Divider + utilities */}
      <div className="mt-auto px-2 border-t border-neutral-800 pt-3">
        <NavItem
          icon={<BarChart2 size={15} />}
          label="Stats"
          active={false}
          onClick={() => {}}
        />
      </div>
    </aside>
  );
}

// ── Sub-components ──

function NavItem({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`sidebar-item w-full text-left ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AlbumNavItem({
  album, active, onClick,
}: {
  album: AlbumItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`sidebar-item w-full text-left ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {album.coverThumbnailUrl ? (
        <img
          src={album.coverThumbnailUrl}
          alt=""
          className="w-5 h-5 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 rounded bg-neutral-700 flex-shrink-0 flex items-center justify-center">
          <AlbumIcon size={11} />
        </div>
      )}
      <span className="truncate flex-1">{album.title}</span>
      <span className="text-neutral-600 text-xs">{album.photoCount}</span>
    </button>
  );
}

function FaceNavItem({
  face, active, onClick,
}: {
  face: FaceClusterItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`sidebar-item w-full text-left ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {face.coverFaceUrl ? (
        <img
          src={face.coverFaceUrl}
          alt=""
          className="w-5 h-5 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-neutral-700 flex-shrink-0 flex items-center justify-center">
          <Users size={11} />
        </div>
      )}
      <span className="truncate flex-1">{face.name ?? 'Unknown'}</span>
      <span className="text-neutral-600 text-xs">{face.faceCount}</span>
    </button>
  );
}
