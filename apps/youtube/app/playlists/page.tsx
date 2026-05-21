'use client';

import {useState} from 'react';
import {AppShell, Button, Card, Input} from '@anvil/ui';
import {usePlaylistStore} from '../../lib/playlist-store';

export default function PlaylistsPage() {
  const {playlists, createPlaylist, deletePlaylist, renamePlaylist, removeFromPlaylist} = usePlaylistStore();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName('');
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renamePlaylist(id, editName.trim());
    setEditingId(null);
  };

  return (
    <AppShell activeApp="youtube">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Playlists</h2>
            <a href="/" className="text-sm text-blue-600 hover:underline">← Back to Videos</a>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New playlist name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </div>

        {playlists.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No playlists yet. Create one above and add videos from the player page.
          </div>
        ) : (
          <div className="space-y-4">
            {playlists.map(pl => (
              <Card key={pl.id}>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setExpandedId(expandedId === pl.id ? null : pl.id)}
                    className="text-lg"
                  >
                    {expandedId === pl.id ? '▼' : '▶'}
                  </button>
                  <div className="flex-1 min-w-0">
                    {editingId === pl.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleRename(pl.id)}
                          className="text-sm"
                        />
                        <Button size="sm" onClick={() => handleRename(pl.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-medium text-gray-900">{pl.name}</h3>
                        <p className="text-xs text-gray-500">{pl.items.length} video{pl.items.length !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingId(pl.id);
                      setEditName(pl.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete playlist "${pl.name}"?`)) deletePlaylist(pl.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>

                {/* Expanded playlist items */}
                {expandedId === pl.id && pl.items.length > 0 && (
                  <div className="mt-4 pl-8 space-y-2 border-t border-gray-100 pt-3">
                    {pl.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <img src={item.thumbnail} alt="" className="w-24 aspect-video object-cover rounded" />
                        <div className="flex-1 min-w-0">
                          <a
                            href={`/video/${item.videoId}`}
                            className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-1"
                          >
                            {item.title}
                          </a>
                          <p className="text-xs text-gray-500">{item.channel}</p>
                        </div>
                        <button
                          onClick={() => removeFromPlaylist(pl.id, item.videoId)}
                          className="text-gray-400 hover:text-red-500 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {expandedId === pl.id && pl.items.length === 0 && (
                  <div className="mt-4 pl-8 text-sm text-gray-400 border-t border-gray-100 pt-3">
                    No videos in this playlist yet. Add videos from the player page.
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
