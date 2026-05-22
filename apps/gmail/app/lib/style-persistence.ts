'use client';

/**
 * Writing Style Persistence
 *
 * Persists the user's writing style profile to localStorage.
 * The style profile is learned from sent emails and used by
 * AI compose to match the user's natural voice.
 *
 * Features:
 * - Automatic profile building from sent emails
 * - Persistence across sessions
 * - Incremental updates as more emails are sent
 * - Style profile versioning
 */

import type {MailMessage} from './ai-mail';

// ── Types ──

export interface PersistedStyleProfile {
  version: number;
  sampleSize: number;
  lastUpdated: number;
  formalityScore: number;
  avgSentenceLength: number;
  avgWordsPerEmail: number;
  preferredGreeting: string;
  preferredSignOff: string;
  commonPhrases: string[];
  tone: string;
  vocabularyLevel: 'simple' | 'moderate' | 'advanced';
  emojiUsage: 'none' | 'rare' | 'moderate' | 'frequent';
  paragraphStyle: 'single' | 'short' | 'medium' | 'long';
  listUsage: 'never' | 'rare' | 'sometimes' | 'often';
  greetingPatterns: string[];
  signOffPatterns: string[];
}

// ── Constants ──

const STORAGE_KEY = 'anvil-mail-writing-style';
const CURRENT_VERSION = 1;

// ── Storage ──

export function loadStyleProfile(): PersistedStyleProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === CURRENT_VERSION) return parsed;
    }
  } catch {}
  return null;
}

export function saveStyleProfile(profile: PersistedStyleProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({...profile, lastUpdated: Date.now()}));
  } catch {}
}

// ── Analysis ──

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function extractGreeting(body: string): string | null {
  const lines = body.split('\n').filter(l => l.trim());
  const first = lines[0]?.trim() || '';
  const greetingPatterns = [
    /^(hi|hey|hello|dear|good morning|good afternoon|good evening)\s+/i,
    /^(hi|hey|hello|dear|good morning|good afternoon|good evening)[,!.]?\s*$/i,
  ];
  for (const pat of greetingPatterns) {
    if (pat.test(first)) return first;
  }
  return null;
}

function extractSignOff(body: string): string | null {
  const lines = body.split('\n').filter(l => l.trim());
  const last = lines[lines.length - 1]?.trim() || '';
  const signOffPatterns = [
    /^(best|regards|cheers|sincerely|thanks|thank you|warmly|yours|respectfully|cordially)[,!.]?\s*$/i,
    /^(best regards|kind regards|with regards|yours truly|yours sincerely)[,!.]?\s*$/i,
    /^(talk soon|catch you later|see you|looking forward)/i,
  ];
  for (const pat of signOffPatterns) {
    if (pat.test(last)) return last;
  }
  return null;
}

function analyzeEmojiUsage(text: string): number {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const matches = text.match(emojiRegex);
  return matches ? matches.length : 0;
}

function analyzeParagraphStyle(paragraphs: string[]): 'single' | 'short' | 'medium' | 'long' {
  if (paragraphs.length <= 1) return 'single';
  const avgLen = paragraphs.reduce((s, p) => s + p.split(/\s+/).length, 0) / paragraphs.length;
  if (avgLen < 30) return 'short';
  if (avgLen < 60) return 'medium';
  return 'long';
}

export function buildStyleProfile(sentEmails: MailMessage[]): PersistedStyleProfile {
  const existing = loadStyleProfile();
  const emails = sentEmails.filter(e => e.from.email === 'me@anvil.local' || e.from.name === 'Me');
  if (emails.length === 0 && existing) return existing;

  const allText = emails.map(e => e.body).join('\n');
  const words = allText.split(/\s+/).filter(w => w.length > 0);
  const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  const avgSentenceLen = words.length / Math.max(sentences.length, 1);
  const avgWordsPerEmail = words.length / Math.max(emails.length, 1);

  // Formality heuristics
  const complexWords = words.filter(w => countSyllables(w) >= 3).length;
  const formalityScore = Math.min(1, (complexWords / Math.max(words.length, 1)) * 5 + (avgSentenceLen > 20 ? 0.2 : 0));

  // Greeting/sign-off patterns
  const greetings = emails.map(e => extractGreeting(e.body)).filter(Boolean) as string[];
  const signOffs = emails.map(e => extractSignOff(e.body)).filter(Boolean) as string[];

  const greetingCounts = new Map<string, number>();
  greetings.forEach(g => greetingCounts.set(g.toLowerCase(), (greetingCounts.get(g.toLowerCase()) || 0) + 1));
  const signOffCounts = new Map<string, number>();
  signOffs.forEach(s => signOffCounts.set(s.toLowerCase(), (signOffCounts.get(s.toLowerCase()) || 0) + 1));

  const preferredGreeting = [...greetingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Hi';
  const preferredSignOff = [...signOffCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Best';

  // Emoji usage
  const emojiCount = analyzeEmojiUsage(allText);
  const emojiPerHundred = (emojiCount / Math.max(words.length, 1)) * 100;
  const emojiUsage = emojiPerHundred === 0 ? 'none' as const :
    emojiPerHundred < 0.5 ? 'rare' as const :
    emojiPerHundred < 2 ? 'moderate' as const : 'frequent' as const;

  // Vocabulary level
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const diversity = uniqueWords.size / Math.max(words.length, 1);
  const vocabularyLevel = diversity < 0.4 ? 'simple' as const :
    diversity < 0.6 ? 'moderate' as const : 'advanced' as const;

  // List usage
  const listCount = (allText.match(/^[-*•]\s/gm) || []).length + (allText.match(/^\d+\.\s/gm) || []).length;
  const listUsage = listCount === 0 ? 'never' as const :
    listCount < 3 ? 'rare' as const :
    listCount < 10 ? 'sometimes' as const : 'often' as const;

  // Common phrases (2-3 word n-grams)
  const phraseCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i].toLowerCase()} ${words[i + 1].toLowerCase()}`;
    phraseCounts.set(bigram, (phraseCounts.get(bigram) || 0) + 1);
  }
  const commonPhrases = [...phraseCounts.entries()]
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);

  // Tone
  const tone = formalityScore > 0.7 ? 'professional' :
    formalityScore > 0.4 ? 'friendly' :
    formalityScore > 0.2 ? 'casual' : 'direct';

  const profile: PersistedStyleProfile = {
    version: CURRENT_VERSION,
    sampleSize: (existing?.sampleSize || 0) + emails.length,
    lastUpdated: Date.now(),
    formalityScore,
    avgSentenceLength: Math.round(avgSentenceLen),
    avgWordsPerEmail: Math.round(avgWordsPerEmail),
    preferredGreeting,
    preferredSignOff,
    commonPhrases,
    tone,
    vocabularyLevel,
    emojiUsage,
    paragraphStyle: analyzeParagraphStyle(paragraphs),
    listUsage,
    greetingPatterns: [...new Set(greetings.map(g => g.toLowerCase()))].slice(0, 5),
    signOffPatterns: [...new Set(signOffs.map(s => s.toLowerCase()))].slice(0, 5),
  };

  saveStyleProfile(profile);
  return profile;
}

/**
 * Get a short human-readable style description for AI prompts.
 */
export function getStyleDescription(profile: PersistedStyleProfile | null): string {
  if (!profile) return 'professional, moderate length';

  const parts: string[] = [];
  parts.push(profile.tone);
  parts.push(profile.vocabularyLevel === 'simple' ? 'simple language' :
    profile.vocabularyLevel === 'advanced' ? 'sophisticated vocabulary' : 'moderate vocabulary');
  parts.push(profile.emojiUsage === 'none' ? 'no emojis' :
    profile.emojiUsage === 'frequent' ? 'uses emojis freely' : '');
  parts.push(profile.listUsage === 'often' ? 'uses bullet lists' : '');

  if (profile.preferredGreeting) parts.push(`greets with "${profile.preferredGreeting}"`);
  if (profile.preferredSignOff) parts.push(`signs off with "${profile.preferredSignOff}"`);

  return parts.filter(Boolean).join(', ');
}
