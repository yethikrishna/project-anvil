'use client';

/**
 * AI Email Emotion Detector — Anvil Mail
 *
 * Detects the emotional tone/state of an email to help you understand
 * the sender's mood before you reply.
 *
 * Emotions detected:
 * - Stressed / Frustrated
 * - Excited / Enthusiastic
 * - Urgent / Pressured
 * - Formal / Neutral
 * - Grateful / Positive
 * - Confused / Uncertain
 * - Disappointed / Concerned
 * - Assertive / Direct
 *
 * Shown as a subtle inline indicator in the email header.
 * Helps calibrate your response tone appropriately.
 */

import {useMemo} from 'react';

// ── Types ──

export type EmotionTag =
  | 'stressed'
  | 'excited'
  | 'urgent'
  | 'grateful'
  | 'confused'
  | 'disappointed'
  | 'assertive'
  | 'neutral';

export interface EmotionResult {
  primary: EmotionTag;
  intensity: number;        // 0-1
  signals: string[];
  replyTip: string;
}

// ── Signal patterns ──

const EMOTION_PATTERNS: Array<{
  emotion: EmotionTag;
  patterns: RegExp[];
  weight: number;
  replyTip: string;
}> = [
  {
    emotion: 'stressed',
    patterns: [
      /\b(asap|urgent|critical|problem|issue|broken|blocked|stuck|can't|cannot|won't work|nothing works|frustrated|annoyed|terrible|disaster|emergency)\b/gi,
      /!!+/g,
      /\b(why (?:is|isn't|are|aren't|does|doesn't)|what's (wrong|happening))\b/gi,
    ],
    weight: 1.5,
    replyTip: 'This sender seems stressed. Acknowledge their concern directly before diving into details.',
  },
  {
    emotion: 'excited',
    patterns: [
      /\b(amazing|fantastic|excited|thrilled|great news|can't wait|awesome|incredible|wonderful|love it|perfect|brilliant|excellent)\b/gi,
      /[!]{2,}/g,
      /\b(just heard|just found out|big news|huge|exciting)\b/gi,
    ],
    weight: 1.2,
    replyTip: 'They\'re excited! Match their energy with an enthusiastic response.',
  },
  {
    emotion: 'urgent',
    patterns: [
      /\b(by (today|tonight|tomorrow|eod|eow|this week|friday|monday)|deadline|time-sensitive|time sensitive|need this now|needs to happen|immediately|right away)\b/gi,
      /\b(URGENT|ASAP|CRITICAL|IMMEDIATE)\b/g,
    ],
    weight: 1.8,
    replyTip: 'Time-sensitive request. Reply quickly and confirm your timeline upfront.',
  },
  {
    emotion: 'grateful',
    patterns: [
      /\b(thank you|thanks|appreciate|grateful|so helpful|really helped|you're the best|you saved|great job|well done|kudos|kudos to)\b/gi,
      /\b(wonderful|lovely|kind of you|so kind)\b/gi,
    ],
    weight: 1.0,
    replyTip: 'They\'re expressing gratitude. A warm, brief acknowledgment works well.',
  },
  {
    emotion: 'confused',
    patterns: [
      /\b(not sure|unclear|confused|don't understand|don't follow|lost|what do you mean|could you clarify|clarification|help me understand)\b/gi,
      /\?{2,}/g,
      /\b(i thought|i was expecting|i assumed|wasn't this)\b/gi,
    ],
    weight: 1.1,
    replyTip: 'They need clarity. Keep your reply structured with clear headings or numbered points.',
  },
  {
    emotion: 'disappointed',
    patterns: [
      /\b(disappointed|expected more|unfortunately|let down|not what we|this isn't|this was not|concern|worried about|not happy|not satisfied|below expectations)\b/gi,
      /\b(hoped|was hoping|we were expecting|should have been|supposed to)\b/gi,
    ],
    weight: 1.3,
    replyTip: 'They\'re expressing concern or disappointment. Lead with empathy and a concrete resolution.',
  },
  {
    emotion: 'assertive',
    patterns: [
      /\b(we need|I need|you must|this must|non-negotiable|make it happen|get this done|ensure|require|demand)\b/gi,
      /\b(bottom line|in short|to be clear|let me be direct|frankly|I expect)\b/gi,
    ],
    weight: 1.0,
    replyTip: 'Direct, assertive tone. Match with confident, action-oriented language.',
  },
];

// ── Emotion detection ──

export function detectEmailEmotion(body: string, subject: string): EmotionResult {
  const text = `${subject}\n${body}`;
  const scores: Partial<Record<EmotionTag, number>> = {};

  for (const {emotion, patterns, weight} of EMOTION_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const matches = text.match(pattern);
      if (matches) score += matches.length;
    }
    if (score > 0) scores[emotion] = score * weight;
  }

  const entries = Object.entries(scores) as [EmotionTag, number][];
  if (entries.length === 0) {
    return {
      primary: 'neutral',
      intensity: 0.2,
      signals: [],
      replyTip: 'Neutral tone. Standard professional reply works well.',
    };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [topEmotion, topScore] = entries[0];
  const intensity = Math.min(1, topScore / 10);

  const topConfig = EMOTION_PATTERNS.find(e => e.emotion === topEmotion);

  return {
    primary: topEmotion,
    intensity,
    signals: entries.slice(0, 3).map(([e]) => e),
    replyTip: topConfig?.replyTip || 'Standard professional reply.',
  };
}

// ── Emotion display config ──

const EMOTION_DISPLAY: Record<EmotionTag, {
  icon: string;
  label: string;
  color: string;
  bg: string;
}> = {
  stressed:     {icon: '😰', label: 'Stressed',     color: 'text-red-600',    bg: 'bg-red-50'},
  excited:      {icon: '🎉', label: 'Excited',       color: 'text-purple-600', bg: 'bg-purple-50'},
  urgent:       {icon: '⚡', label: 'Urgent',        color: 'text-orange-600', bg: 'bg-orange-50'},
  grateful:     {icon: '🙏', label: 'Grateful',      color: 'text-green-600',  bg: 'bg-green-50'},
  confused:     {icon: '🤔', label: 'Seeking Clarity', color: 'text-yellow-600', bg: 'bg-yellow-50'},
  disappointed: {icon: '😕', label: 'Concerned',     color: 'text-blue-600',   bg: 'bg-blue-50'},
  assertive:    {icon: '💼', label: 'Direct',         color: 'text-gray-700',   bg: 'bg-gray-100'},
  neutral:      {icon: '😐', label: 'Neutral',        color: 'text-gray-500',   bg: 'bg-gray-50'},
};

// ── Component ──

interface EmotionBadgeProps {
  body: string;
  subject: string;
  showTip?: boolean;
}

export function EmailEmotionBadge({body, subject, showTip = false}: EmotionBadgeProps) {
  const result = useMemo(() => detectEmailEmotion(body, subject), [body, subject]);

  // Only show for non-neutral emotions
  if (result.primary === 'neutral') return null;

  const display = EMOTION_DISPLAY[result.primary];

  return (
    <div className="group relative inline-flex">
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${display.bg} ${display.color} cursor-default`}
        title={result.replyTip}
      >
        <span>{display.icon}</span>
        <span>{display.label}</span>
        {result.intensity > 0.6 && <span className="text-[10px] opacity-70">●</span>}
      </span>
      {showTip && (
        <div className="absolute bottom-full mb-1.5 left-0 z-10 w-52 p-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none leading-relaxed">
          💡 {result.replyTip}
        </div>
      )}
    </div>
  );
}

// ── Hook ──

export function useEmailEmotion(body: string, subject: string) {
  return useMemo(() => detectEmailEmotion(body, subject), [body, subject]);
}
