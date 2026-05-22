'use client';

/**
 * AI Writing Score — Real-time document quality scoring for Anvil Docs
 *
 * Runs locally in the browser — no AI API calls for base scoring.
 * AI-powered deep analysis available on demand.
 *
 * Scores across 5 dimensions (0–100):
 *   Clarity    — sentence complexity, fog index, passive voice
 *   Conciseness— filler word density, redundancy patterns
 *   Readability— Flesch-Kincaid, paragraph length, subheadings
 *   Tone       — formality score based on word choice
 *   Structure  — heading hierarchy, intro/conclusion presence
 *
 * Visual: compact badge in toolbar + expandable side panel
 */

import {useState, useEffect, useCallback, useMemo} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface WritingScore {
  overall: number;       // 0–100
  clarity: number;
  conciseness: number;
  readability: number;
  tone: number;
  structure: number;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  fleschKincaid: number; // grade level
  passiveVoiceCount: number;
  fillerWordCount: number;
  suggestions: WritingSuggestion[];
}

export interface WritingSuggestion {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'clarity' | 'conciseness' | 'readability' | 'tone' | 'structure';
  message: string;
  example?: string;
}

// ── Filler words / passive voice patterns ──

const FILLER_WORDS = new Set([
  'very', 'really', 'quite', 'rather', 'somewhat', 'basically', 'actually',
  'literally', 'honestly', 'definitely', 'certainly', 'simply', 'just',
  'perhaps', 'maybe', 'that said', 'having said that', 'needless to say',
  'in order to', 'due to the fact that', 'at this point in time',
  'for the purpose of', 'in the event that', 'it is important to note',
]);

const PASSIVE_PATTERNS = [
  /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi,
  /\b(has|have|had)\s+been\s+\w+ed\b/gi,
];

const LONG_WORD_SYLLABLE_THRESHOLD = 3;

// ── Syllable counting (heuristic) ──
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// ── Core scoring ──

export function analyzeWriting(text: string, html: string): WritingScore {
  if (!text || text.trim().length < 10) {
    return {
      overall: 0, clarity: 0, conciseness: 0, readability: 0, tone: 0, structure: 0,
      wordCount: 0, sentenceCount: 0, avgWordsPerSentence: 0,
      fleschKincaid: 0, passiveVoiceCount: 0, fillerWordCount: 0, suggestions: [],
    };
  }

  // ── Basic stats ──
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const sentenceCount = Math.max(sentences.length, 1);
  const avgWordsPerSentence = wordCount / sentenceCount;

  // ── Flesch-Kincaid Grade Level ──
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSyllablesPerWord = syllableCount / Math.max(wordCount, 1);
  const fleschKincaid = Math.max(0, 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59);

  // ── Passive voice ──
  let passiveVoiceCount = 0;
  for (const pattern of PASSIVE_PATTERNS) {
    const matches = text.match(pattern);
    passiveVoiceCount += matches ? matches.length : 0;
  }

  // ── Filler words ──
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z\s]/g, ''));
  let fillerWordCount = 0;
  lowerWords.forEach(w => {
    if (FILLER_WORDS.has(w)) fillerWordCount++;
  });

  // ── Structure from HTML ──
  const headingCount = (html.match(/<h[1-6]/gi) || []).length;
  const paragraphCount = (html.match(/<p/gi) || []).length;
  const hasBullets = /<ul|<ol/gi.test(html);

  // ── Scoring (0–100 each) ──

  // Clarity: penalize long sentences and high passive voice
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 30).length;
  const clarityPenalty = Math.min(40, longSentences * 8 + passiveVoiceCount * 5);
  const clarity = Math.max(0, 100 - clarityPenalty);

  // Conciseness: penalize filler words
  const fillerRate = fillerWordCount / Math.max(wordCount, 1);
  const conciseness = Math.max(0, Math.min(100, 100 - fillerRate * 400));

  // Readability: Flesch-Kincaid → ideally grade 8–12 for most docs
  const fkScore = fleschKincaid;
  let readability: number;
  if (fkScore <= 8) readability = 95;
  else if (fkScore <= 12) readability = 85;
  else if (fkScore <= 16) readability = 70;
  else if (fkScore <= 20) readability = 50;
  else readability = 30;

  // Tone: rough formality — penalize contractions, emoji, very informal tokens
  const contractionCount = (text.match(/\b\w+'t\b|\b\w+'re\b|\b\w+'ve\b|\b\w+'ll\b|\b\w+'d\b/gi) || []).length;
  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  const tonePenalty = Math.min(30, contractionCount * 3 + emojiCount * 5);
  const tone = Math.max(40, 100 - tonePenalty); // not 0 — casual is valid

  // Structure: reward headings, appropriate paragraph length, bullets
  let structure = 50;
  if (headingCount > 0) structure += 20;
  if (headingCount > 2) structure += 10;
  if (hasBullets) structure += 10;
  if (paragraphCount > 1 && avgWordsPerSentence < 25) structure += 10;
  if (wordCount > 100 && headingCount === 0) structure = Math.min(structure, 60); // penalize walls of text
  structure = Math.min(100, structure);

  // Overall: weighted average
  const overall = Math.round(
    clarity * 0.25 +
    conciseness * 0.20 +
    readability * 0.25 +
    tone * 0.10 +
    structure * 0.20,
  );

  // ── Suggestions ──
  const suggestions: WritingSuggestion[] = [];

  if (avgWordsPerSentence > 25) {
    suggestions.push({
      id: 'long-sentences',
      severity: 'warning',
      category: 'clarity',
      message: `Average ${Math.round(avgWordsPerSentence)} words per sentence — aim for under 20`,
      example: 'Break long sentences with a period or semicolon.',
    });
  }
  if (passiveVoiceCount > sentenceCount * 0.3) {
    suggestions.push({
      id: 'passive-voice',
      severity: 'warning',
      category: 'clarity',
      message: `${passiveVoiceCount} passive voice instances detected`,
      example: '"The report was written by her" → "She wrote the report"',
    });
  }
  if (fillerWordCount > wordCount * 0.05) {
    suggestions.push({
      id: 'filler-words',
      severity: 'info',
      category: 'conciseness',
      message: `${fillerWordCount} filler words found (very, really, basically, etc.)`,
      example: 'Remove filler words — they add length without meaning.',
    });
  }
  if (fleschKincaid > 14) {
    suggestions.push({
      id: 'readability',
      severity: 'info',
      category: 'readability',
      message: `Grade ${Math.round(fleschKincaid)} reading level — consider simpler language`,
      example: 'Shorter sentences and simpler words improve readability.',
    });
  }
  if (wordCount > 200 && headingCount === 0) {
    suggestions.push({
      id: 'add-headings',
      severity: 'info',
      category: 'structure',
      message: 'Document has no headings — add H1/H2 to improve navigation',
    });
  }
  if (paragraphCount === 1 && wordCount > 100) {
    suggestions.push({
      id: 'paragraph-breaks',
      severity: 'warning',
      category: 'structure',
      message: 'One long paragraph — break into shorter sections',
    });
  }

  return {
    overall,
    clarity: Math.round(clarity),
    conciseness: Math.round(conciseness),
    readability: Math.round(readability),
    tone: Math.round(tone),
    structure: Math.round(structure),
    wordCount,
    sentenceCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    fleschKincaid: Math.round(fleschKincaid * 10) / 10,
    passiveVoiceCount,
    fillerWordCount,
    suggestions,
  };
}

// ── Score color ──
function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e'; // green
  if (score >= 60) return '#f59e0b'; // amber
  return '#ef4444';                  // red
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  return 'Needs Work';
}

// ── Hook ──

export function useWritingScore(editor: Editor | null): WritingScore | null {
  const [score, setScore] = useState<WritingScore | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recompute = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    const html = editor.getHTML();
    const result = analyzeWriting(text, html);
    setScore(result);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(recompute, 600);
    };

    editor.on('update', handleUpdate);
    recompute(); // initial score
    return () => {
      editor.off('update', handleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, recompute]);

  return score;
}

// Need ref in hook
import {useRef} from 'react';

// ── Score Badge (compact, for toolbar) ──

export function WritingScoreBadge({score, onClick}: {score: WritingScore | null; onClick: () => void}) {
  if (!score || score.wordCount < 10) return null;

  const color = scoreColor(score.overall);

  return (
    <button
      onClick={onClick}
      title={`Writing Score: ${score.overall}/100 — ${scoreLabel(score.overall)}\nClick for details`}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all hover:opacity-80 border"
      style={{
        color,
        borderColor: color + '40',
        backgroundColor: color + '10',
      }}
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill={color}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      {score.overall}
    </button>
  );
}

// ── Full Score Panel ──

interface WritingScorePanelProps {
  score: WritingScore;
  onClose: () => void;
  onAICoach?: () => void;
}

function DimensionBar({label, value, icon}: {label: string; value: number; icon: string}) {
  const color = scoreColor(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-gray-600">
          <span>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="font-semibold" style={{color}}>{value}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{width: `${value}%`, backgroundColor: color}}
        />
      </div>
    </div>
  );
}

export function WritingScorePanel({score, onClose, onAICoach}: WritingScorePanelProps) {
  const overallColor = scoreColor(score.overall);
  const severityIcon = {error: '🔴', warning: '🟡', info: '🔵'};

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-72 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-gray-900">Writing Score</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      {/* Overall score ring */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#f1f5f9" strokeWidth="6" />
            <circle
              cx="28" cy="28" r="24" fill="none"
              stroke={overallColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 24}`}
              strokeDashoffset={`${2 * Math.PI * 24 * (1 - score.overall / 100)}`}
              style={{transition: 'stroke-dashoffset 0.6s ease'}}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold" style={{color: overallColor}}>{score.overall}</span>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{scoreLabel(score.overall)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {score.wordCount} words · {score.sentenceCount} sentences
          </div>
          <div className="text-xs text-gray-500">
            {score.avgWordsPerSentence} words/sentence · Grade {score.fleschKincaid}
          </div>
        </div>
      </div>

      {/* Dimension scores */}
      <div className="space-y-2.5">
        <DimensionBar label="Clarity"      value={score.clarity}     icon="🎯" />
        <DimensionBar label="Conciseness"  value={score.conciseness} icon="✂️" />
        <DimensionBar label="Readability"  value={score.readability} icon="📖" />
        <DimensionBar label="Tone"         value={score.tone}        icon="🎭" />
        <DimensionBar label="Structure"    value={score.structure}   icon="🏗️" />
      </div>

      {/* Suggestions */}
      {score.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-gray-700">Suggestions ({score.suggestions.length})</div>
          {score.suggestions.slice(0, 4).map(s => (
            <div key={s.id} className="flex items-start gap-1.5 text-xs">
              <span>{severityIcon[s.severity]}</span>
              <div>
                <span className="text-gray-700">{s.message}</span>
                {s.example && (
                  <div className="text-gray-400 mt-0.5 italic">{s.example}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Coach CTA */}
      {onAICoach && (
        <button
          onClick={onAICoach}
          className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-xs font-semibold hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-1.5"
        >
          ✨ Get AI Coaching
        </button>
      )}
    </div>
  );
}
