'use client';

import {useState, useEffect} from 'react';
import ReactPlayer from 'react-player/youtube';
import {useAuth} from '@anvil/auth';
import {AppShell, Button, Card, Input} from '@anvil/ui';
import {getVideoDetails, getRelatedVideos, type VideoDetails, type VideoResult} from '../../lib/youtube-api';
import {usePlaylistStore} from '../../lib/playlist-store';

interface VideoPageProps {
  params: {id: string};
}

export default function VideoPage({params}: VideoPageProps) {
  const {isAuthenticated, login} = useAuth();
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [related, setRelated] = useState<VideoResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const {playlists, createPlaylist, addToPlaylist, isInPlaylist} = usePlaylistStore();

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      getVideoDetails(params.id),
      getRelatedVideos(params.id),
    ]).then(([details, relatedVideos]) => {
      setVideo(details);
      setRelated(relatedVideos);
      setIsLoading(false);
    });
  }, [params.id]);

  const handleAddToPlaylist = (playlistId: string) => {
    if (!video) return;
    addToPlaylist(playlistId, {
      videoId: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      channel: video.channel,
    });
    setShowPlaylistMenu(false);
  };

  const handleCreateAndAdd = () => {
    if (!video || !newPlaylistName.trim()) return;
    const id = createPlaylist(newPlaylistName.trim());
    addToPlaylist(id, {
      videoId: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      channel: video.channel,
    });
    setNewPlaylistName('');
    setShowPlaylistMenu(false);
  };

  if (!isAuthenticated) {
    return (
      <AppShell activeApp="youtube">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">Sign in to watch videos</h2>
            <Button onClick={() => login()}>Sign in with SSO</Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell activeApp="youtube">
        <div className="flex items-center justify-center h-full text-gray-500">Loading video...</div>
      </AppShell>
    );
  }

  if (!video) {
    return (
      <AppShell activeApp="youtube">
        <div className="flex items-center justify-center h-full text-gray-500">Video not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell activeApp="youtube">
      <div className="flex h-full overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Video player */}
          <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4">
            <ReactPlayer
              url={`https://www.youtube.com/watch?v=${params.id}`}
              width="100%"
              height="100%"
              controls
              playing={false}
            />
          </div>

          {/* Video info */}
          <div className="mb-4">
            <h1 className="text-xl font-bold text-gray-900 mb-2">{video.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{video.channel}</span>
              {video.views && <span>{Number(video.views).toLocaleString()} views</span>}
              {video.publishedAt && <span>{video.publishedAt}</span>}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
              >
                + Add to Playlist
              </Button>
              {showPlaylistMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64 z-20">
                  {playlists.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => handleAddToPlaylist(pl.id)}
                      className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 transition-colors"
                    >
                      {isInPlaylist(pl.id, params.id) ? '✓ ' : ''}{pl.name}
                      <span className="text-gray-400 ml-1">({pl.items.length})</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-100 mt-2 pt-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="New playlist..."
                        value={newPlaylistName}
                        onChange={e => setNewPlaylistName(e.target.value)}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={handleCreateAndAdd}>Create</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">{video.description}</p>
            {video.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {video.tags.slice(0, 10).map((tag, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — Related videos */}
        <aside className="w-96 border-l border-gray-200 bg-white overflow-auto p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Related Videos</h3>
          <div className="space-y-3">
            {related.map(v => (
              <a
                key={v.id}
                href={`/video/${v.id}`}
                className="flex gap-3 group"
              >
                <div className="w-40 aspect-video bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 relative">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                  )}
                  {v.duration && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                      {v.duration}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-blue-600">
                    {v.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{v.channel}</p>
                  {v.views && (
                    <p className="text-xs text-gray-400">
                      {Number(v.views).toLocaleString()} views
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
