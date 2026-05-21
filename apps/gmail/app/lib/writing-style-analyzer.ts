'use client';

/**
 * Writing Style Analyzer for AI Compose
 *
 * Learns the user's writing style from their sent emails:
 * - Sentence length and structure
 * - Vocabulary preferences
 * - Tone (formal/casual)
 * - Greeting and sign-off patterns
 * - Emoji and abbreviation usage
 * - Response time patterns
 *
 * Builds a style profile that's used to generate AI replies that
 * match the user's natural voice.
 */

import type {MailMessage} from './ai-mail';

// ── Types ──

export interface WritingStyleProfile {
  avgSentenceLength: number;
  avgWordsPerEmail: number;
  formalityScore: number;       // 0 = very casual, 1 = very formal
  emojiFrequency: number;       // emojis per 100 words
  abbreviationFrequency: number; // abbreviations per 100 words
  questionFrequency: number;    // questions per email
  exclamationFrequency: number; // exclamation marks per email
  preferredGreeting: string;
  preferredSignOff: string;
  commonPhrases: string[];
  vocabularyDiversity: number;  // unique words / total words
  avgResponseTimeMs: number;
  sampleSize: number;
  lastUpdated: number;
}

export interface StyleHint {
  tone: string;
  greeting: string;
  signOff: string;
  avgLength: string;
  notes: string[];
}

const STYLE_STORAGE_KEY = 'anvil-mail-writing-style';

// ── Default Style ──

export const DEFAULT_STYLE: WritingStyleProfile = {
  avgSentenceLength: 15,
  avgWordsPerEmail: 60,
  formalityScore: 0.5,
  emojiFrequency: 0,
  abbreviationFrequency: 2,
  questionFrequency: 0.5,
  exclamationFrequency: 1,
  preferredGreeting: 'Hi',
  preferredSignOff: 'Best',
  commonPhrases: [],
  vocabularyDiversity: 0.6,
  avgResponseTimeMs: 0,
  sampleSize: 0,
  lastUpdated: 0,
};

// ── Style Persistence ──

export function loadStyleProfile(): WritingStyleProfile {
  try {
    const stored = localStorage.getItem(STYLE_STORAGE_KEY);
    if (stored) {
      return {...DEFAULT_STYLE, ...JSON.parse(stored)};
    }
  } catch {
    // Silently fail
  }
  return {...DEFAULT_STYLE};
}

function saveStyleProfile(profile: WritingStyleProfile) {
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Silently fail
  }
}

// ── Style Analysis ──

export function analyzeWritingStyle(
  sentEmails: MailMessage[],
  receivedEmails?: MailMessage[]
): WritingStyleProfile {
  if (sentEmails.length === 0) return {...DEFAULT_STYLE};

  let totalWords = 0;
  let totalSentences = 0;
  let totalEmojis = 0;
  let totalAbbreviations = 0;
  let totalQuestions = 0;
  let totalExclamations = 0;
  const allWords: string[] = [];
  const greetings: Map<string, number> = new Map();
  const signOffs: Map<string, number> = new Map();
  const phraseCounts: Map<string, number> = new Map();

  // Formality indicators
  let formalCount = 0;
  let casualCount = 0;

  const formalWords = [
    'therefore', 'furthermore', 'consequently', 'regarding', 'pursuant',
    'hereby', 'herein', 'thereof', 'whom', 'shall', 'accordingly',
    'nevertheless', 'notwithstanding', 'respectfully', 'sincerely',
    'cordially', 'esteemed', 'duly', 'inform', 'advise',
  ];

  const casualWords = [
    'hey', 'hi', 'yo', 'sup', 'gonna', 'wanna', 'gotta', 'kinda',
    'sorta', 'yeah', 'nope', 'cool', 'awesome', 'great', 'sounds good',
    'let me know', 'lmk', 'fyi', 'btw', 'tbh', 'imo', 'ngl',
    'haha', 'lol', 'omg', 'thanks', 'thx', 'cheers',
  ];

  const abbreviationPattern = /\b[A-Z]{2,5}\b/g;
  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

  const greetingPatterns = [
    /^hi\s+(\w+)/im, /^hey\s+(\w+)/im, /^hello\s+(\w+)/im,
    /^dear\s+(\w+)/im, /^good\s+(morning|afternoon|evening)/im,
  ];

  const signOffPatterns = [
    /(?:thanks|thank you|cheers|best|regards|sincerely|warmly|peace)[,\s]*$/im,
  ];

  for (const email of sentEmails) {
    const body = email.body;
    const words = body.split(/\s+/).filter(w => w.length > 0);
    const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);

    totalWords += words.length;
    totalSentences += sentences.length;
    allWords.push(...words.map(w => w.toLowerCase()));

    // Emoji count
    const emojiMatches = body.match(emojiPattern);
    if (emojiMatches) totalEmojis += emojiMatches.length;

    // Abbreviation count
    const abbrevMatches = body.match(abbreviationPattern);
    if (abbrevMatches) {
      totalAbbreviations += abbrevMatches.filter(
        a => !['I', 'A', 'AN', 'THE', 'AND', 'BUT', 'OR', 'FOR'].includes(a)
      ).length;
    }

    // Question and exclamation marks
    totalQuestions += (body.match(/\?/g) || []).length;
    totalExclamations += (body.match(/!/g) || []).length;

    // Formality
    const lowerBody = body.toLowerCase();
    for (const word of formalWords) {
      if (lowerBody.includes(word)) formalCount++;
    }
    for (const phrase of casualWords) {
      if (lowerBody.includes(phrase)) casualCount++;
    }

    // Greeting detection
    for (const pattern of greetingPatterns) {
      const match = body.match(pattern);
      if (match) {
        const greeting = match[0].trim();
        greetings.set(greeting, (greetings.get(greeting) || 0) + 1);
        break;
      }
    }

    // Sign-off detection
    for (const pattern of signOffPatterns) {
      const match = body.match(pattern);
      if (match) {
        const signOff = match[0].trim();
        signOffs.set(signOff, (signOffs.get(signOff) || 0) + 1);
        break;
      }
    }

    // Common phrases (bigrams)
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i].toLowerCase()} ${words[i + 1].toLowerCase()}`;
      // Filter out stop words and short words
      if (words[i].length > 3 && words[i + 1].length > 3) {
        phraseCounts.set(bigram, (phraseCounts.get(bigram) || 0) + 1);
      }
    }
  }

  // Compute response times
  let totalResponseTime = 0;
  let responseCount = 0;
  if (receivedEmails) {
    for (const sent of sentEmails) {
      const sentTime = new Date(sent.date).getTime();
      // Find the most recent received email before this sent one in the same thread
      const prevReceived = receivedEmails
        .filter(r => r.threadId === sent.threadId && new Date(r.date).getTime() < sentTime)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      if (prevReceived) {
        const responseTime = sentTime - new Date(prevReceived.date).getTime();
        if (responseTime < 24 * 60 * 60 * 1000) { // Only count responses within 24h
          totalResponseTime += responseTime;
          responseCount++;
        }
      }
    }
  }

  // Build the profile
  const uniqueWords = new Set(allWords);
  const vocabularyDiversity = allWords.length > 0 ? uniqueWords.size / allWords.length : 0.6;

  const formalityScore = (formalCount + casualCount) > 0
    ? formalCount / (formalCount + casualCount)
    : 0.5;

  // Most common greeting and sign-off
  const preferredGreeting = getMostFrequent(greetings) || 'Hi';
  const preferredSignOff = getMostFrequent(signOffs) || 'Best';

  // Top common phrases
  const commonPhrases = [...phraseCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([phrase]) => phrase);

  const profile: WritingStyleProfile = {
    avgSentenceLength: totalSentences > 0 ? Math.round(totalWords / totalSentences) : 15,
    avgWordsPerEmail: Math.round(totalWords / sentEmails.length),
    formalityScore: Math.round(formalityScore * 100) / 100,
    emojiFrequency: totalWords > 0 ? Math.round((totalEmojis / totalWords) * 10000) / 100 : 0,
    abbreviationFrequency: totalWords > 0 ? Math.round((totalAbbreviations / totalWords) * 10000) / 100 : 2,
    questionFrequency: sentEmails.length > 0 ? Math.round((totalQuestions / sentEmails.length) * 100) / 100 : 0.5,
    exclamationFrequency: sentEmails.length > 0 ? Math.round((totalExclamations / sentEmails.length) * 100) / 100 : 1,
    preferredGreeting,
    preferredSignOff,
    commonPhrases,
    vocabularyDiversity: Math.round(vocabularyDiversity * 100) / 100,
    avgResponseTimeMs: responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0,
    sampleSize: sentEmails.length,
    lastUpdated: Date.now(),
  };

  // Save to localStorage
  saveStyleProfile(profile);

  return profile;
}

// ── Style Hints for AI Compose ──

export function getStyleHints(profile: WritingStyleProfile): StyleHint {
  const notes: string[] = [];

  // Tone
  let tone: string;
  if (profile.formalityScore > 0.7) {
    tone = 'formal and professional';
    notes.push('Use formal language and complete sentences');
  } else if (profile.formalityScore > 0.4) {
    tone = 'professional but approachable';
    notes.push('Balance formality with warmth');
  } else {
    tone = 'casual and friendly';
    notes.push('Use contractions and conversational language');
  }

  // Length
  let avgLength: string;
  if (profile.avgWordsPerEmail < 50) {
    avgLength = 'brief';
    notes.push('Keep it short — under 50 words');
  } else if (profile.avgWordsPerEmail < 150) {
    avgLength = 'moderate';
  } else {
    avgLength = 'detailed';
    notes.push('Be thorough and comprehensive');
  }

  // Emoji
  if (profile.emojiFrequency > 1) {
    notes.push('Use occasional emoji');
  }

  // Questions
  if (profile.questionFrequency > 1) {
    notes.push('Often asks questions in replies');
  }

  return {
    tone,
    greeting: profile.preferredGreeting,
    signOff: profile.preferredSignOff,
    avgLength,
    notes,
  };
}

// ── Build AI Compose Prompt ──

export function buildComposePrompt(
  profile: WritingStyleProfile,
  threadContext: string,
  intent: 'reply' | 'forward' | 'new'
): string {
  const hints = getStyleHints(profile);

  return `Write a ${hints.tone} email reply that sounds like the user wrote it.

Writing style rules:
- Average ${profile.avgWordsPerEmail} words per email (${hints.avgLength} style)
- ${profile.formalityScore > 0.5 ? 'Use professional tone' : 'Use casual, conversational tone'}
- Greeting style: "${hints.greeting}"
- Sign-off style: "${hints.signOff}"
${hints.notes.map(n => `- ${n}`).join('\n')}
${profile.commonPhrases.length > 0 ? `- User's common phrases to consider: ${profile.commonPhrases.slice(5).join(', ')}` : ''}

Thread context:
${threadContext}

Intent: ${intent}

Output ONLY the email body. No subject line, no headers.`;
}

// ── Helpers ──

function getMostFrequent(map: Map<string, number>): string | null {
  let maxCount = 0;
  let result: string | null = null;
  for (const [key, count] of map) {
    if (count > maxCount) {
      maxCount = count;
      result = key;
    }
  }
  return result;
}

// ── Update Style Incrementally ──

export function updateStyleWithNewEmail(email: MailMessage): WritingStyleProfile {
  const existing = loadStyleProfile();

  // Simple exponential moving average update
  const alpha = 1 / (existing.sampleSize + 1); // Learning rate decreases with more samples

  const words = email.body.split(/\s+/).length;
  const sentences = email.body.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

  const updated: WritingStyleProfile = {
    ...existing,
    avgWordsPerEmail: Math.round(existing.avgWordsPerEmail * (1 - alpha) + words * alpha),
    avgSentenceLength: sentences > 0
      ? Math.round(existing.avgSentenceLength * (1 - alpha) + (words / sentences) * alpha)
      : existing.avgSentenceLength,
    sampleSize: existing.sampleSize + 1,
    lastUpdated: Date.now(),
  };

  saveStyleProfile(updated);
  return updated;
}
