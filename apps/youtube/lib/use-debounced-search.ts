/**
 * YouTube app — Debounced search hook
 */

import {useState, useEffect, useRef, useCallback} from 'react';
import {searchVideos, getSearchSuggestions, type VideoResult} from '../lib/youtube-api';

export function useDebouncedSearch(delay = 400) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VideoResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const videos = await searchVideos(q);
      setResults(videos);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const s = await getSearchSuggestions(q);
      setSuggestions(s);
    } catch {
      setSuggestions([]);
    }
  }, []);

  // Debounce search + suggestions
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      search(query);
      fetchSuggestions(query);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, delay, search, fetchSuggestions]);

  return {
    query,
    setQuery,
    results,
    suggestions,
    isLoading,
    showSuggestions,
    setShowSuggestions,
    search,
  };
}
