'use client';

/**
 * AI Tone Analyzer — Anvil Docs
 *
 * Analyzes the tone of selected text or the full document.
 * Provides:
 * - Current tone profile (formal/casual, positive/negative, confident/hedging, active/passive)
 * - Tone shift suggestions (make it more persuasive, more professional, etc.)
 * - Audience matching: "Is this right for a board presentation?"
 * - Emotion detection: excitement, urgency, empathy, authority
 *
 * Pure local analysis for the dimensions we can compute;
 * AI handles the narrative and audience-matching.
 */

import {useState, useMemo, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface ToneDimension {
  name: string;
  left: string;     // low end label
  right: string;    // high end label
  score: number;    // 0 = left, 1 = right
  icon: string;
}

export interface ToneProfile {
  dimensions: ToneDimension[];
  dominantTone: string;
  emotions: string[];
  audienceFit: string;
  wordCount: number;
  avgSentenceLength: number;
}

export interface ToneShiftOption {
  label: string;
  description: string;
  targetDimensions: Partial<Record<string, number>>;
}

// ── Local tone signal words ──

const FORMAL_SIGNALS = /\b(therefore|furthermore|consequently|however|nevertheless|henceforth|herein|pursuant|notwithstanding|aforementioned|herewith|respectively|whilst|among|whom|shall|may|must|regarding|approximately|indicate|demonstrate|establish|determine|implement)\b/gi;
const CASUAL_SIGNALS = /\b(gonna|wanna|gotta|kinda|sorta|yeah|yep|nope|ok|okay|hey|hi|thanks|cool|awesome|great|stuff|things|get|got|bit|lot|really|very|just|like|pretty|quite|totally|literally|basically)\b/gi;

const POSITIVE_SIGNALS = /\b(excellent|outstanding|great|fantastic|wonderful|amazing|brilliant|superb|exceptional|impressive|remarkable|successful|achieve|accomplish|benefit|opportunity|improve|enhance|advance|progress|growth|gain|win|success|positive|strong|effective)\b/gi;
const NEGATIVE_SIGNALS = /\b(problem|issue|concern|risk|failure|fail|poor|weak|difficult|challenge|struggle|loss|decline|decrease|reduce|cut|eliminate|threat|danger|crisis|error|mistake|wrong|bad|terrible|awful|unfortunate|unfortunately)\b/gi;

const CONFIDENT_SIGNALS = /\b(will|definitely|certainly|clearly|obviously|undoubtedly|absolutely|must|guaranteed|proven|confirmed|established|conclusively|precisely|exactly)\b/gi;
const HEDGING_SIGNALS = /\b(might|may|could|perhaps|possibly|probably|seemingly|apparently|arguably|suggests|appears|seems|somewhat|relatively|fairly|rather|quite|tend|likely|unlikely|often|sometimes|occasionally|generally|typically)\b/gi;

const URGENT_SIGNALS = /\b(immediately|urgent|asap|critical|emergency|deadline|overdue|now|today|priority|essential|crucial|vital|pressing|time-sensitive|right away|as soon as possible)\b/gi;
const EMPATHY_SIGNALS = /\b(understand|appreciate|recognize|acknowledge|value|respect|feel|experience|concern|care|support|help|together|we|our|your needs|listening|hear|connect)\b/gi;

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function toScore(positive: number, negative: number): number {
  const total = positive + negative;
  if (total === 0) return 0.5;
  return positive / total;
}

// ── Main analysis ──

export function analyzeTone(text: string): ToneProfile {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const wordCount = words.length;
  const avgSentenceLength = sentences.length > 0
    ? Math.round(wordCount / sentences.length)
    : 0;

  if (wordCount < 20) {
    return {
      dimensions: [],
      dominantTone: 'Not enough text to analyze',
      emotions: [],
      audienceFit: 'Write more to see tone analysis',
      wordCount,
      avgSentenceLength,
    };
  }

  const formalCount = countMatches(text, FORMAL_SIGNALS);
  const casualCount = countMatches(text, CASUAL_SIGNALS);
  const positiveCount = countMatches(text, POSITIVE_SIGNALS);
  const negativeCount = countMatches(text, NEGATIVE_SIGNALS);
  const confidentCount = countMatches(text, CONFIDENT_SIGNALS);
  const hedgingCount = countMatches(text, HEDGING_SIGNALS);

  const formalityScore = toScore(formalCount, casualCount);
  const sentimentScore = toScore(positiveCount, negativeCount);
  const confidenceScore = toScore(confidentCount, hedgingCount);

  // Passive voice: rough detection
  const passiveCount = (text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) || []).length;
  const activeScore = Math.max(0, 1 - (passiveCount / Math.max(1, sentences.length)) * 0.5);

  const dimensions: ToneDimension[] = [
    {name: 'Register',    left: 'Casual',    right: 'Formal',     score: formalityScore,   icon: '👔'},
    {name: 'Sentiment',   left: 'Negative',  right: 'Positive',   score: sentimentScore,   icon: '🌡️'},
    {name: 'Confidence',  left: 'Hedging',   right: 'Confident',  score: confidenceScore,  icon: '💪'},
    {name: 'Voice',       left: 'Passive',   right: 'Active',     score: activeScore,      icon: '⚡'},
  ];

  // Emotions
  const emotions: string[] = [];
  if (countMatches(text, URGENT_SIGNALS) >= 2) emotions.push('Urgent');
  if (countMatches(text, EMPATHY_SIGNALS) >= 3) emotions.push('Empathetic');
  if (positiveCount > 4) emotions.push('Enthusiastic');
  if (negativeCount > 4 && positiveCount < 2) emotions.push('Critical');
  if (confidentCount > 3 && hedgingCount < 2) emotions.push('Authoritative');
  if (hedgingCount > formalCount && hedgingCount > 3) emotions.push('Cautious');

  // Dominant tone descriptor
  const isFormal = formalityScore > 0.55;
  const isPositive = sentimentScore > 0.55;
  const isConfident = confidenceScore > 0.55;

  let dominantTone = '';
  if (isFormal && isConfident && isPositive) dominantTone = 'Professional & Persuasive';
  else if (isFormal && isConfident) dominantTone = 'Authoritative & Direct';
  else if (isFormal && !isConfident) dominantTone = 'Formal but Uncertain';
  else if (!isFormal && isPositive) dominantTone = 'Friendly & Upbeat';
  else if (!isFormal && !isPositive) dominantTone = 'Casual & Direct';
  else dominantTone = 'Balanced';

  // Audience fit guess
  let audienceFit = '';
  if (formalityScore > 0.65 && avgSentenceLength > 20) audienceFit = 'Well-suited for executives or formal reports';
  else if (formalityScore < 0.4 && avgSentenceLength < 15) audienceFit = 'Good for casual updates or team messages';
  else if (formalityScore > 0.5 && avgSentenceLength <= 20) audienceFit = 'Appropriate for professional emails or proposals';
  else audienceFit = 'Suitable for a general audience';

  return {dimensions, dominantTone, emotions, audienceFit, wordCount, avgSentenceLength};
}

// ── Tone Shift Options ──

export const TONE_SHIFT_OPTIONS: ToneShiftOption[] = [
  {
    label: 'More Professional',
    description: 'Increase formality, remove hedging',
    targetDimensions: {Register: 0.8, Confidence: 0.75},
  },
  {
    label: 'More Persuasive',
    description: 'Boost confidence, add positive framing',
    targetDimensions: {Confidence: 0.85, Sentiment: 0.8},
  },
  {
    label: 'More Concise',
    description: 'Shorter sentences, active voice',
    targetDimensions: {Voice: 0.9},
  },
  {
    label: 'More Casual',
    description: 'Friendlier, less stiff language',
    targetDimensions: {Register: 0.25},
  },
  {
    label: 'More Empathetic',
    description: 'Add warmth, acknowledge reader needs',
    targetDimensions: {Sentiment: 0.75},
  },
  {
    label: 'More Authoritative',
    description: 'Remove hedges, use direct assertions',
    targetDimensions: {Confidence: 0.9, Voice: 0.85},
  },
];

// ── Components ──

function ToneDimensionBar({dimension}: {dimension: ToneDimension}) {
  const pct = Math.round(dimension.score * 100);
  const barColor = dimension.score > 0.65
    ? 'bg-blue-500'
    : dimension.score < 0.35
      ? 'bg-orange-400'
      : 'bg-gray-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>{dimension.icon} {dimension.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{dimension.left}</span>
          <span className="font-medium text-gray-700">→</span>
          <span className="text-gray-400">{dimension.right}</span>
        </div>
      </div>
      <div className="relative h-2 bg-gray-100 rounded-full">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{width: `${pct}%`}}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-500 shadow-sm transition-all"
          style={{left: `calc(${pct}% - 5px)`}}
        />
      </div>
      <div className="text-right text-[10px] text-gray-400">{pct}%</div>
    </div>
  );
}

interface ToneAnalyzerPanelProps {
  editor: Editor;
  onClose: () => void;
  onApplyShift?: (shiftLabel: string, selectedText: string) => Promise<void>;
}

export function ToneAnalyzerPanel({editor, onClose, onApplyShift}: ToneAnalyzerPanelProps) {
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [appliedShift, setAppliedShift] = useState<string | null>(null);

  const {text, isSelection} = useMemo(() => {
    const sel = editor.state.selection;
    const hasSelection = !sel.empty;
    const selectedText = hasSelection
      ? editor.state.doc.textBetween(sel.from, sel.to, ' ')
      : '';
    return {
      text: selectedText.length > 50 ? selectedText : editor.getText(),
      isSelection: selectedText.length > 50,
    };
  }, [editor]);

  const profile = useMemo(() => analyzeTone(text), [text]);

  const handleApplyShift = useCallback(async (shift: ToneShiftOption) => {
    if (!onApplyShift) return;
    setIsApplying(shift.label);
    await onApplyShift(shift.label, text);
    setAppliedShift(shift.label);
    setIsApplying(null);
  }, [onApplyShift, text]);

  return (
    <div className="fixed right-4 top-20 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 flex flex-col max-h-[80vh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">🎭 Tone Analysis</span>
        <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-medium">AI</span>
        {isSelection && (
          <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">Selection</span>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {profile.dimensions.length === 0 ? (
          <div className="px-4 py-6 text-xs text-gray-400 text-center">
            Write at least 20 words to see tone analysis
          </div>
        ) : (
          <>
            {/* Dominant tone */}
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div className="text-[10px] text-blue-500 font-medium uppercase tracking-wide mb-0.5">Dominant Tone</div>
              <div className="text-sm font-semibold text-blue-900">{profile.dominantTone}</div>
              {profile.emotions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {profile.emotions.map(e => (
                    <span key={e} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{e}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Dimension bars */}
            <div className="px-4 py-3 space-y-3 border-b border-gray-100">
              {profile.dimensions.map(d => (
                <ToneDimensionBar key={d.name} dimension={d} />
              ))}
            </div>

            {/* Audience fit */}
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="text-[10px] text-gray-400 font-medium mb-0.5">AUDIENCE FIT</div>
              <div className="text-xs text-gray-600">{profile.audienceFit}</div>
            </div>

            {/* Stats */}
            <div className="px-4 py-2 border-b border-gray-100 flex gap-4">
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-700">{profile.wordCount}</div>
                <div className="text-[10px] text-gray-400">words</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-700">{profile.avgSentenceLength}</div>
                <div className="text-[10px] text-gray-400">avg sentence</div>
              </div>
            </div>

            {/* Tone shift actions */}
            {onApplyShift && (
              <div className="px-4 py-3">
                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-2">SHIFT TONE</div>
                <div className="space-y-1.5">
                  {TONE_SHIFT_OPTIONS.map(shift => (
                    <button
                      key={shift.label}
                      onClick={() => handleApplyShift(shift)}
                      disabled={isApplying !== null}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                        appliedShift === shift.label
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      } disabled:opacity-50`}
                    >
                      <div className="font-medium">{shift.label}</div>
                      <div className="text-gray-400 mt-0.5">{shift.description}</div>
                      {isApplying === shift.label && (
                        <span className="text-purple-500 mt-0.5 block">✨ Applying...</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
