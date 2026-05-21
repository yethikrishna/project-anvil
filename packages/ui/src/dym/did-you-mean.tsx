'use client';

/**
 * "Did you mean" semantic suggestions via edit distance + phonetic matching.
 *
 * Algorithms:
 * - Damerau-Levenshtein distance for typo correction
 * - Common query patterns for contextual suggestions
 * - Keyboard proximity for adjacent-key typos
 */

import {useState, useCallback, useMemo} from 'react';

// ── Edit Distance ──

function damerauLevenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  const lenA = a.length;
  const lenB = b.length;

  for (let i = 0; i <= lenA; i++) matrix[i] = [i];
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }

  return matrix[lenA][lenB];
}

// ── Dictionary ──

const SEARCH_DICTIONARY = [
  // App names
  'docs', 'drive', 'gmail', 'youtube', 'maps', 'search', 'calendar', 'tasks', 'admin', 'marketplace',
  // Common queries
  'budget', 'planning', 'meeting', 'report', 'presentation', 'spreadsheet',
  'invoice', 'contract', 'proposal', 'resume', 'cover letter',
  'project', 'timeline', 'roadmap', 'milestone', 'sprint',
  'document', 'spreadsheet', 'presentation', 'template',
  'upload', 'download', 'share', 'collaborate', 'export', 'import',
  'security', 'password', 'authentication', 'encryption',
  'calendar', 'schedule', 'appointment', 'deadline',
  'email', 'inbox', 'compose', 'reply', 'forward', 'attachment',
  'video', 'playlist', 'transcript', 'subtitle',
  'notification', 'settings', 'profile', 'account',
  // Technical terms
  'api', 'webhook', 'integration', 'deployment', 'docker', 'kubernetes',
  'database', 'postgresql', 'redis', 'cache',
  'frontend', 'backend', 'fullstack', 'devops',
];

// ── Keyboard Proximity ──

const KEYBOARD_ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

function getAdjacentKeys(char: string): string[] {
  const c = char.toLowerCase();
  const adjacent: string[] = [];

  for (const row of KEYBOARD_ROWS) {
    const idx = row.indexOf(c);
    if (idx === -1) continue;
    if (idx > 0) adjacent.push(row[idx - 1]);
    if (idx < row.length - 1) adjacent.push(row[idx + 1]);
  }

  return adjacent;
}

// ── Suggester ──

export interface SuggestionResult {
  original: string;
  suggestions: string[];
  confidence: number;
}

export function suggestCorrections(
  query: string,
  dictionary: string[] = SEARCH_DICTIONARY,
  maxResults = 3,
  maxDistance = 3
): SuggestionResult {
  const words = query.toLowerCase().split(/\s+/);
  let bestSuggestions: string[] = [];
  let totalConfidence = 0;

  for (const word of words) {
    if (word.length < 3) continue;

    const candidates = dictionary
      .map(dictWord => {
        const distance = damerauLevenshtein(word, dictWord);

        // Boost if only adjacent-key typos
        let boost = 0;
        if (distance === 1 && word.length === dictWord.length) {
          const diffIdx = [...word].findIndex((c, i) => c !== dictWord[i]);
          if (diffIdx >= 0 && getAdjacentKeys(word[diffIdx]).includes(dictWord[diffIdx])) {
            boost = -0.5; // Better score for adjacent-key typos
          }
        }

        return {word: dictWord, score: distance + boost, distance};
      })
      .filter(c => c.distance <= maxDistance && c.word !== word)
      .sort((a, b) => a.score - b.score)
      .slice(0, maxResults);

    if (candidates.length > 0) {
      bestSuggestions.push(candidates[0].word);
      totalConfidence += 1 / (candidates[0].distance + 1);
    }
  }

  return {
    original: query,
    suggestions: [...new Set(bestSuggestions)],
    confidence: words.length > 0 ? totalConfidence / words.length : 0,
  };
}

// ── Hook ──

export function useDidYouMean(query: string) {
  const suggestion = useMemo(() => {
    if (!query || query.length < 3) return null;
    const result = suggestCorrections(query);
    return result.suggestions.length > 0 ? result : null;
  }, [query]);

  return suggestion;
}

// ── Component ──

export function DidYouMeanSuggestion({
  query,
  onSuggestionClick,
}: {
  query: string;
  onSuggestionClick: (suggestion: string) => void;
}) {
  const suggestion = useDidYouMean(query);

  if (!suggestion) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm">
      <span className="text-gray-500">Did you mean:</span>
      {suggestion.suggestions.map(s => (
        <button
          key={s}
          onClick={() => onSuggestionClick(s)}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
