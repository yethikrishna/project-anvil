'use client';

import {useRef, useEffect} from 'react';
import {AppShell, Button, Card, Input} from '@anvil/ui';
import {useAuth} from '@anvil/auth';
import {useDebouncedSearch} from '../lib/use-debounced-search';
import {usePlaylistStore} from '../lib/playlist-store';

export default function YouTubePage() {
  const {isAuthenticated, login} = useAuth();
  const {
    query, setQuery, results, suggestions, isLoading,
    showSuggestions, setShowSuggestions, search,
  } = useDebouncedSearch();
  const {playlists} = usePlaylistStore();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isAuthenticated) {
    return (
      <AppShell activeApp="youtube">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">Sign in to search and watch videos</h2>
            <Button onClick={() => login()}>Sign in with SSO</Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeApp="youtube">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Videos</h2>
          <div className="flex gap-3 items-center">
            <a href="/playlists" className="text-sm text-blue-600 hover:underline">
              My Playlists ({playlists.length})
            </a>
          </div>
        </div>

        {/* Search bar with autocomplete */}
        <div className="relative mb-6 max-w-2xl">
          <div className="relative">
            <Input
              ref={inputRef}
              placeholder="Search videos..."
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setShowSuggestions(false);
                  search(query);
                }
              }}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuery(s);
                    setShowSuggestions(false);
                    search(s);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-400">🔍</span>
                  <span>{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-gray-500">Searching...</div>
        )}

        {/* Search results */}
        {!isLoading && results.length > 0 && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {results.length} results for "{query}"
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map(v => (
                <a key={v.id} href={`/video/${v.id}`}>
                  <Card className="h-full hover:shadow-lg transition-shadow">
                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-3 relative">
                      {v.thumbnail ? (
                        <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
                      )}
                      {v.duration && (
                        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                          {v.duration}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">{v.title}</h3>
                    <p className="text-xs text-gray-500">
                      {v.channel}
                      {v.views && ` • ${Number(v.views).toLocaleString()} views`}
                    </p>
                    {v.publishedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">{v.publishedAt}</p>
                    )}
                  </Card>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && query && results.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No videos found for "{query}"
          </div>
        )}

        {/* Initial state (no search yet) */}
        {!query && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">▶️</div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Search for videos</h3>
            <p className="text-gray-500">Type a query above to search YouTube</p>
          </div>
        )}
      </div>

      {/* Click-away to close suggestions */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowSuggestions(false)}
        />
      )}
    </AppShell>
  );
}
