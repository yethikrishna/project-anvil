'use client';

import {useState, useMemo, useRef, useEffect} from 'react';
import {
  getVideoTranscript,
  searchTranscript,
  formatTimestamp,
  type TranscriptLine,
} from '../../lib/transcript';

interface TranscriptPanelProps {
  videoId: string;
  onSeek?: (seconds: number) => void;
}

export function TranscriptPanel({videoId, onSeek}: TranscriptPanelProps) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTimestamp, setActiveTimestamp] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch transcript
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    getVideoTranscript(videoId)
      .then(lines => {
        setTranscript(lines);
        if (lines.length === 0) {
          setError('No transcript available for this video.');
        }
      })
      .catch(() => {
        setError('Failed to load transcript.');
      })
      .finally(() => setIsLoading(false));
  }, [videoId]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchTranscript(transcript, searchQuery);
  }, [transcript, searchQuery]);

  // Which lines to display
  const displayLines = useMemo(() => {
    if (searchQuery.trim() && searchResults.length > 0) {
      // Show only matching lines + 1 line of context before/after
      const matchIndices = new Set(searchResults.map(r => r.index));
      const contextIndices = new Set<number>();

      for (const idx of matchIndices) {
        contextIndices.add(idx);
        if (idx > 0) contextIndices.add(idx - 1);
        if (idx < transcript.length - 1) contextIndices.add(idx + 1);
      }

      return transcript
        .map((line, index) => ({line, index, isMatch: matchIndices.has(index)}))
        .filter(({index}) => contextIndices.has(index));
    }
    return transcript.map((line, index) => ({line, index, isMatch: false}));
  }, [transcript, searchQuery, searchResults]);

  // Highlight search matches in text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let result = text;

    // Create regex that matches any of the query words
    const regex = new RegExp(`(${words.map(escapeRegex).join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (words.some(w => part.toLowerCase() === w)) {
        return (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  const handleTimestampClick = (seconds: number, index: number) => {
    setActiveTimestamp(index);
    onSeek?.(seconds);
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-900">Transcript</span>
        </div>
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-4 bg-gray-100 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-900">Transcript</span>
        </div>
        <p className="text-sm text-gray-400 italic">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900">Transcript</span>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            {showSearch ? 'Hide' : 'Search'}
          </button>
        </div>

        {showSearch && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search in transcript..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              autoFocus
            />
            {searchQuery && (
              <div className="mt-1 text-xs text-gray-500">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                {searchResults.length > 0 && (
                  <span className="ml-2">
                    <button
                      onClick={() => {
                        // Navigate to first result
                        if (searchResults[0]) {
                          handleTimestampClick(searchResults[0].line.startSeconds, searchResults[0].index);
                        }
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Jump to first
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcript lines */}
      <div ref={containerRef} className="flex-1 overflow-auto px-4 py-2 space-y-0.5">
        {displayLines.map(({line, index, isMatch}) => {
          const isContextGap =
            index > 0 &&
            !displayLines.some(d => d.index === index - 1);

          return (
            <div key={index}>
              {isContextGap && searchQuery && (
                <div className="text-center text-xs text-gray-300 py-1">• • •</div>
              )}
              <button
                onClick={() => handleTimestampClick(line.startSeconds, index)}
                className={`w-full text-left flex gap-2 px-2 py-1.5 rounded transition-colors group ${
                  activeTimestamp === index
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                } ${isMatch ? 'ring-1 ring-yellow-300 bg-yellow-50/50' : ''}`}
              >
                <span className={`text-xs font-mono flex-shrink-0 pt-0.5 ${
                  activeTimestamp === index
                    ? 'text-blue-600'
                    : 'text-gray-400 group-hover:text-gray-600'
                }`}>
                  {formatTimestamp(line.startSeconds)}
                </span>
                <span className={`text-sm leading-relaxed ${
                  isMatch ? 'text-gray-900' : 'text-gray-700'
                }`}>
                  {searchQuery ? highlightText(line.text, searchQuery) : line.text}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
        {transcript.length} lines
      </div>
    </div>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
