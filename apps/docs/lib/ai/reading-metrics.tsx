/**
 * AI Reading Time & Complexity Estimator — Anvil Docs
 *
 * Displayed inline in the editor status bar.
 * Shows: reading time, difficulty level, grade level, technical density.
 */

'use client';

import {useMemo} from 'react';

export interface ReadingMetrics {
  readingTimeMinutes: number;
  readingTimeSeconds: number;        // for sub-1-minute docs
  difficulty: 'easy' | 'medium' | 'hard' | 'very-hard';
  gradeLevel: number;                // Flesch-Kincaid grade
  technicalDensity: number;          // 0-1: fraction of technical/jargon words
  avgWordLength: number;
  avgSyllablesPerWord: number;
  wordCount: number;
}

// ── Syllable counter (English approximation) ──

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;

  let count = 0;
  let prevVowel = false;

  for (const char of w) {
    const isVowel = 'aeiouy'.includes(char);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  // Adjust for silent 'e' at end
  if (w.endsWith('e') && count > 1) count--;
  // Adjust for 'le' ending
  if (w.endsWith('le') && w.length > 2 && !'aeiouy'.includes(w[w.length - 3])) count++;

  return Math.max(1, count);
}

// Technical/jargon word patterns
const TECHNICAL_WORDS = /\b(algorithm|implementation|infrastructure|configuration|parameter|architecture|optimization|authentication|authorization|synchronization|asynchronous|cryptocurrency|blockchain|kubernetes|microservices|containerization|orchestration|refactoring|abstraction|polymorphism|encapsulation|recursion|iteration|paradigm|methodology|framework|ecosystem|scalability|latency|throughput|bandwidth|deprecate|instantiate|serialize|deserialize|middleware|endpoint|payload|schema|query|database|repository|interface|namespace|dependency|migration|deployment|provisioning|telemetry|observability|hypothesis|correlation|coefficient|regression|variance|deviation|percentile|magnitude|velocity|acceleration|centrifugal|osmosis|photosynthesis|mitochondria|chromosome|catalyst|oxidation|polymer|electron|neutron|quantum)\b/gi;

export function computeReadingMetrics(text: string): ReadingMetrics {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      readingTimeMinutes: 0,
      readingTimeSeconds: 0,
      difficulty: 'easy',
      gradeLevel: 0,
      technicalDensity: 0,
      avgWordLength: 0,
      avgSyllablesPerWord: 0,
      wordCount: 0,
    };
  }

  // Reading time (238 wpm average)
  const totalSeconds = Math.ceil((wordCount / 238) * 60);
  const readingTimeMinutes = Math.floor(totalSeconds / 60);
  const readingTimeSeconds = totalSeconds % 60;

  // Word lengths and syllables
  const totalChars = words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0);
  const avgWordLength = totalChars / wordCount;

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSyllablesPerWord = totalSyllables / wordCount;

  // Sentence count
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const sentenceCount = Math.max(1, sentences.length);

  // Flesch-Kincaid Grade Level
  const fkGrade = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;
  const gradeLevel = Math.max(0, Math.min(20, Math.round(fkGrade)));

  // Technical density
  TECHNICAL_WORDS.lastIndex = 0;
  const techMatches = text.match(TECHNICAL_WORDS) || [];
  const technicalDensity = Math.min(1, techMatches.length / wordCount);

  // Difficulty
  let difficulty: ReadingMetrics['difficulty'];
  if (gradeLevel <= 6) difficulty = 'easy';
  else if (gradeLevel <= 10) difficulty = 'medium';
  else if (gradeLevel <= 14) difficulty = 'hard';
  else difficulty = 'very-hard';

  return {
    readingTimeMinutes,
    readingTimeSeconds,
    difficulty,
    gradeLevel,
    technicalDensity,
    avgWordLength: Math.round(avgWordLength * 10) / 10,
    avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 10) / 10,
    wordCount,
  };
}

// ── Component ──

const DIFFICULTY_STYLES = {
  'easy':      {color: 'text-green-600',  bg: 'bg-green-50',  label: 'Easy'},
  'medium':    {color: 'text-blue-600',   bg: 'bg-blue-50',   label: 'Medium'},
  'hard':      {color: 'text-orange-600', bg: 'bg-orange-50', label: 'Complex'},
  'very-hard': {color: 'text-red-600',    bg: 'bg-red-50',    label: 'Dense'},
};

interface ReadingMetricsBadgeProps {
  text: string;
  onClick?: () => void;
}

export function ReadingMetricsBadge({text, onClick}: ReadingMetricsBadgeProps) {
  const metrics = useMemo(() => computeReadingMetrics(text), [text]);

  if (metrics.wordCount < 20) return null;

  const diff = DIFFICULTY_STYLES[metrics.difficulty];

  const readingTime = metrics.readingTimeMinutes > 0
    ? `${metrics.readingTimeMinutes}m read`
    : `${metrics.readingTimeSeconds}s read`;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs hover:bg-gray-100 transition-colors"
      title={`Grade ${metrics.gradeLevel} · ${metrics.avgSyllablesPerWord} syl/word · ${Math.round(metrics.technicalDensity * 100)}% technical`}
    >
      <span className="text-gray-500">📖 {readingTime}</span>
      <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${diff.color} ${diff.bg}`}>
        {diff.label}
      </span>
    </button>
  );
}

interface ReadingMetricsPanelProps {
  text: string;
  onClose: () => void;
}

export function ReadingMetricsPanel({text, onClose}: ReadingMetricsPanelProps) {
  const metrics = useMemo(() => computeReadingMetrics(text), [text]);
  const diff = DIFFICULTY_STYLES[metrics.difficulty];

  const readingTime = metrics.readingTimeMinutes > 0
    ? `${metrics.readingTimeMinutes} min ${metrics.readingTimeSeconds > 0 ? `${metrics.readingTimeSeconds}s` : ''}`
    : `${metrics.readingTimeSeconds} seconds`;

  return (
    <div className="fixed right-4 top-20 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">📖 Reading Metrics</span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-gray-900">{readingTime}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Reading time</div>
          </div>
          <div className={`rounded-lg p-2 text-center ${diff.bg}`}>
            <div className={`text-sm font-bold ${diff.color}`}>{diff.label}</div>
            <div className={`text-[10px] mt-0.5 ${diff.color} opacity-70`}>Grade {metrics.gradeLevel}</div>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Words</span>
            <span className="font-medium text-gray-800">{metrics.wordCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Avg word length</span>
            <span className="font-medium text-gray-800">{metrics.avgWordLength} chars</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Avg syllables/word</span>
            <span className="font-medium text-gray-800">{metrics.avgSyllablesPerWord}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Technical density</span>
            <span className={`font-medium ${metrics.technicalDensity > 0.1 ? 'text-orange-600' : 'text-gray-800'}`}>
              {Math.round(metrics.technicalDensity * 100)}%
            </span>
          </div>
        </div>

        {metrics.technicalDensity > 0.1 && (
          <div className="text-[10px] text-orange-600 bg-orange-50 rounded-lg p-2">
            High technical density — consider a glossary for non-expert readers.
          </div>
        )}
        {metrics.gradeLevel > 14 && (
          <div className="text-[10px] text-red-500 bg-red-50 rounded-lg p-2">
            Grade {metrics.gradeLevel} complexity. Try shorter sentences for wider audience reach.
          </div>
        )}
      </div>
    </div>
  );
}
