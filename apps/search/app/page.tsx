'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn, AppShell, ThemeProvider, ThemeToggle } from '@anvil/ui';
import { NotificationProvider, NotificationBell } from '@anvil/notifications';
import { useGeolocation, getLocationSuggestions, isLocationQuery, enhanceQueryWithLocation } from '../lib/use-location';
import { useVoiceSearch, VoiceSearchButton } from '../lib/use-voice-search';

// ─── Types ───

interface SearchHit {
  id: number;
  title: string;
  url: string;
  description: string;
  favicon?: string;
  _formatted?: {
    title: string;
    description: string;
    body?: string;
  };
}

interface SearchResponse {
  hits: SearchHit[];
  estimatedTotalHits: number;
  query: string;
  processingTimeMs?: number;
}

type SearchTab = 'all' | 'images' | 'news';

// ─── Config ───

const SEARCH_API = process.env.NEXT_PUBLIC_SEARCH_API || 'http://localhost:4015';
const DEBOUNCE_MS = 200;

// ─── Mock image results for image tab ───

const MOCK_IMAGES = [
  { id: 'img-1', src: 'https://placehold.co/300x200/4285F4/FFFFFF?text=Result+1', title: 'Search result 1', source: 'example.com' },
  { id: 'img-2', src: 'https://placehold.co/300x200/EA4335/FFFFFF?text=Result+2', title: 'Search result 2', source: 'example.org' },
  { id: 'img-3', src: 'https://placehold.co/300x200/34A853/FFFFFF?text=Result+3', title: 'Search result 3', source: 'sample.com' },
  { id: 'img-4', src: 'https://placehold.co/300x200/FBBC05/FFFFFF?text=Result+4', title: 'Search result 4', source: 'demo.net' },
  { id: 'img-5', src: 'https://placehold.co/300x200/8E24AA/FFFFFF?text=Result+5', title: 'Search result 5', source: 'test.io' },
  { id: 'img-6', src: 'https://placehold.co/300x200/00ACC1/FFFFFF?text=Result+6', title: 'Search result 6', source: 'preview.co' },
];

// ─── Debounce hook ───

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Favicon helper ───

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return '';
  }
}

// ─── Result Card ───

function ResultCard({ hit }: { hit: SearchHit }) {
  const displayTitle = hit._formatted?.title || hit.title;
  const displayDesc = hit._formatted?.description || hit.description;
  const favicon = hit.favicon || getFaviconUrl(hit.url);

  return (
    <div className="mb-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        {favicon && (
          <img src={favicon} alt="" width="16" height="16" className="rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <span className="text-xs text-gray-600 truncate">{hit.url}</span>
      </div>
      <a href={hit.url} target="_blank" rel="noopener noreferrer" className="text-lg text-blue-700 hover:underline leading-snug">
        <span dangerouslySetInnerHTML={{ __html: displayTitle }} />
      </a>
      <p className="text-sm text-gray-600 mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: displayDesc }} />
    </div>
  );
}

// ─── Image Result Card ───

function ImageResultCard({ image }: { image: typeof MOCK_IMAGES[0] }) {
  return (
    <div className="group rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
      <div className="aspect-[3/2] bg-gray-100">
        <img src={image.src} alt={image.title} className="w-full h-full object-cover" />
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-800 truncate">{image.title}</p>
        <p className="text-[10px] text-gray-500">{image.source}</p>
      </div>
    </div>
  );
}

// ─── Main Search Page ───

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState<SearchTab>('all');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceQuery = useDebounce(query, DEBOUNCE_MS);
  const {location, loading: locationLoading, requestLocation} = useGeolocation();
  const {state: voiceState, startListening, stopListening, resetTranscript} = useVoiceSearch({
    onResult: (transcript, isFinal) => {
      setQuery(transcript);
      if (isFinal) {
        setSearched(true);
        performSearch(transcript);
      }
    },
  });

  // Auto-search on debounced query (only if user has already submitted once)
  useEffect(() => {
    if (!searched || !debounceQuery.trim()) return;
    performSearch(debounceQuery);
  }, [debounceQuery, searched]);

  // Fetch suggestions as user types
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${SEARCH_API}/api/suggest?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch { /* ignore */ }
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    const start = performance.now();

    // Enhance location-based queries
    const enhancedQuery = enhanceQueryWithLocation(q, location);

    try {
      const res = await fetch(`${SEARCH_API}/api/search?q=${encodeURIComponent(enhancedQuery)}&limit=20`);
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setResults(data.hits || []);
        setTotalResults(data.estimatedTotalHits || 0);
      } else {
        // Fallback mock
        setResults([]);
        setTotalResults(0);
      }
    } catch {
      setResults([]);
      setTotalResults(0);
    } finally {
      setSearchTime(Math.round(performance.now() - start));
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setSearched(true);
    setShowSuggestions(false);
    performSearch(query);
  }, [query, performSearch]);

  // ─── Landing page (no search yet) ───

  if (!searched) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center pt-32">
        {/* Logo */}
        <h1 className="text-6xl font-bold mb-2">
          <span className="text-blue-500">A</span>
          <span className="text-red-500">n</span>
          <span className="text-yellow-500">v</span>
          <span className="text-blue-500">i</span>
          <span className="text-green-500">l</span>
        </h1>
        <p className="text-gray-400 text-sm mb-8">Hybrid BM25 + Semantic Search</p>

        {/* Search bar */}
        <div className="w-full max-w-xl relative">
          <div className="flex items-center border border-gray-300 rounded-full px-5 py-3 hover:shadow-md focus-within:shadow-md transition-shadow">
            <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 mx-3 outline-none text-base"
              placeholder="Search the web..."
              autoFocus
            />
            {query && (
              <button onClick={() => { setQuery(''); setSuggestions([]); }} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
            <VoiceSearchButton
              isListening={voiceState.isListening}
              isSupported={voiceState.isSupported}
              onClick={voiceState.isListening ? stopListening : startListening}
            />
            <button onClick={handleSearch} className="ml-2 p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>
          </div>

          {/* Autocomplete suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setQuery(s); setShowSuggestions(false); setSearched(true); performSearch(s); }}
                  className="w-full text-left px-5 py-2.5 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-3"
                >
                  <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="flex gap-3 mt-8 flex-wrap justify-center">
          {['Next.js', 'Meilisearch', 'MapLibre', 'Docker'].map((q) => (
            <button
              key={q}
              onClick={() => { setQuery(q); setSearched(true); performSearch(q); }}
              className="px-4 py-2 bg-gray-100 text-sm text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Location-based suggestions */}
        <div className="mt-6 max-w-xl w-full">
          <div className="flex items-center gap-2 mb-3 justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            {location ? (
              <span className="text-xs text-gray-500">📍 {location.city ? `${location.city}, ` : ''}{location.country ?? 'Located'}</span>
            ) : (
              <button
                onClick={requestLocation}
                disabled={locationLoading}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {locationLoading ? 'Detecting location...' : 'Enable location for nearby suggestions'}
              </button>
            )}
          </div>
          {location && (
            <div className="flex gap-2 flex-wrap justify-center">
              {getLocationSuggestions(location).slice(0, 4).map((q) => (
                <button
                  key={q}
                  onClick={() => { setQuery(q); setSearched(true); performSearch(q); }}
                  className="px-3 py-1.5 bg-blue-50 text-sm text-blue-700 rounded-full hover:bg-blue-100 transition-colors flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Results page ───

  return (
    <ThemeProvider><NotificationProvider userId="demo-user"><AppShell activeApp="search" notifications={<><ThemeToggle/><NotificationBell/></>}>
    <div className="min-h-full bg-white dark:bg-gray-950">
      {/* Top bar */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="flex items-center gap-4 px-6 py-3">
          {/* Logo */}
          <button onClick={() => setSearched(false)} className="shrink-0">
            <span className="text-2xl font-bold">
              <span className="text-blue-500">A</span>
              <span className="text-red-500">n</span>
              <span className="text-yellow-500">v</span>
              <span className="text-blue-500">i</span>
              <span className="text-green-500">l</span>
            </span>
          </button>

          {/* Search bar */}
          <div className="flex-1 max-w-2xl relative">
            <div className="flex items-center border border-gray-300 rounded-full px-4 py-2 hover:shadow-sm focus-within:shadow-sm transition-shadow">
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 outline-none text-sm"
              />
              {query && (
                <button onClick={() => { setQuery(''); setSuggestions([]); }} className="text-gray-400 hover:text-gray-600 ml-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              )}
              <VoiceSearchButton
                isListening={voiceState.isListening}
                isSupported={voiceState.isSupported}
                onClick={voiceState.isListening ? stopListening : startListening}
                className="ml-1"
              />
              <button onClick={handleSearch} className="ml-2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-full">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(s); setShowSuggestions(false); performSearch(s); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 border-b border-gray-200">
          {([
            { id: 'all' as const, label: 'All', icon: '🔍' },
            { id: 'images' as const, label: 'Images', icon: '🖼️' },
            { id: 'news' as const, label: 'News', icon: '📰' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors',
                tab === t.id ? 'text-blue-700 border-blue-600 font-medium' : 'text-gray-500 border-transparent hover:text-gray-700'
              )}
            >
              <span className="text-xs">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results area */}
      <div className="px-6 py-4 max-w-5xl">
        {/* Stats */}
        {tab === 'all' && (
          <p className="text-xs text-gray-500 mb-4">
            {loading ? 'Searching...' : `About ${totalResults.toLocaleString()} results${searchTime ? ` (${(searchTime / 1000).toFixed(2)} seconds)` : ''}`}
          </p>
        )}

        {/* Did you mean? */}
        {suggestions.length > 0 && !loading && tab === 'all' && (
          <div className="mb-4 text-sm">
            <span className="text-gray-500">Did you mean: </span>
            {suggestions.slice(0, 3).map((s, i) => (
              <span key={i}>
                <button
                  onClick={() => { setQuery(s); performSearch(s); }}
                  className="text-blue-700 hover:underline"
                >
                  {s}
                </button>
                {i < Math.min(suggestions.length, 3) - 1 && ' · '}
              </span>
            ))}
          </div>
        )}

        {/* All results */}
        {tab === 'all' && (
          <>
            {loading && (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Searching...
              </div>
            )}
            {!loading && results.length === 0 && searched && (
              <div className="py-12 text-center">
                <p className="text-gray-500 text-lg mb-2">No results found</p>
                <p className="text-gray-400 text-sm">Try different keywords or check your search service connection</p>
              </div>
            )}
            {!loading && results.map((hit) => (
              <ResultCard key={hit.id} hit={hit} />
            ))}
          </>
        )}

        {/* Image results */}
        {tab === 'images' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {MOCK_IMAGES.map((img) => (
              <ImageResultCard key={img.id} image={img} />
            ))}
          </div>
        )}

        {/* News results (stub) */}
        {tab === 'news' && (
          <div className="py-12 text-center">
            <p className="text-4xl mb-3">📰</p>
            <p className="text-gray-500">News search coming soon</p>
            <p className="text-gray-400 text-sm mt-1">Connect a news API to enable this tab</p>
          </div>
        )}
      </div>
    </div>
    </AppShell></NotificationProvider></ThemeProvider>;
  };
}
