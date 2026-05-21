'use client';

/**
 * AI Document Readability Analyzer
 *
 * Real-time analysis of document readability and quality:
 * - Flesch-Kincaid readability score
 * - Sentence complexity analysis
 * - Passive voice detection
 * - Word frequency analysis
 * - Reading level estimation
 * - Improvement suggestions
 */

// ── Types ──

export interface ReadabilityReport {
  fleschKincaidScore: number;       // 0-100 (higher = easier to read)
  readingLevel: string;             // 'College', 'High School', 'Middle School', etc.
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  totalWords: number;
  totalSentences: number;
  totalParagraphs: number;
  complexWords: number;             // Words with 3+ syllables
  passiveVoiceCount: number;
  adverbCount: number;
  longSentences: number;            // Sentences > 25 words
  suggestions: ReadabilitySuggestion[];
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface ReadabilitySuggestion {
  type: 'clarity' | 'conciseness' | 'grammar' | 'structure' | 'tone';
  message: string;
  location?: string;
  severity: 'info' | 'warning' | 'error';
}

// ── Syllable Counter ──

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// ── Passive Voice Detection ──

function detectPassiveVoice(text: string): number {
  const passivePatterns = [
    /\b(was|were|is|are|been|being|be)\s+(being\s+)?\w+ed\b/gi,
    /\b(was|were|is|are|been|being|be)\s+(being\s+)?\w+en\b/gi,
  ];

  let count = 0;
  for (const pattern of passivePatterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// ── Adverb Detection ──

function countAdverbs(words: string[]): number {
  return words.filter(w => w.endsWith('ly') && w.length > 4).length;
}

// ── Main Analysis ──

export function analyzeReadability(html: string): ReadabilityReport {
  // Strip HTML
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  if (text.length < 20) {
    return {
      fleschKincaidScore: 100,
      readingLevel: 'N/A',
      avgWordsPerSentence: 0,
      avgSyllablesPerWord: 0,
      totalWords: 0,
      totalSentences: 0,
      totalParagraphs: 0,
      complexWords: 0,
      passiveVoiceCount: 0,
      adverbCount: 0,
      longSentences: 0,
      suggestions: [],
      overallGrade: 'A',
    };
  }

  const words = text.split(/\s+/).filter(w => w.replace(/[^a-zA-Z]/g, '').length > 0);
  const totalWords = words.length;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const totalSentences = Math.max(sentences.length, 1);

  const paragraphs = html.split(/<\/p>|<\/h[1-6]>/).filter(p => p.trim().length > 0);
  const totalParagraphs = paragraphs.length;

  // Syllables
  let totalSyllables = 0;
  let complexWords = 0;
  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    const syllables = countSyllables(clean);
    totalSyllables += syllables;
    if (syllables >= 3) complexWords++;
  }

  const avgWordsPerSentence = totalWords / totalSentences;
  const avgSyllablesPerWord = totalSyllables / Math.max(totalWords, 1);

  // Flesch-Kincaid Score
  const fleschKincaidScore = Math.max(0, Math.min(100,
    206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord)
  ));

  // Reading Level
  let readingLevel: string;
  if (fleschKincaidScore >= 90) readingLevel = 'Very Easy (5th Grade)';
  else if (fleschKincaidScore >= 80) readingLevel = 'Easy (6th Grade)';
  else if (fleschKincaidScore >= 70) readingLevel = 'Fairly Easy (7th Grade)';
  else if (fleschKincaidScore >= 60) readingLevel = 'Standard (8th-9th Grade)';
  else if (fleschKincaidScore >= 50) readingLevel = 'Fairly Difficult (10th-12th Grade)';
  else if (fleschKincaidScore >= 30) readingLevel = 'Difficult (College)';
  else readingLevel = 'Very Difficult (Graduate)';

  // Passive voice
  const passiveVoiceCount = detectPassiveVoice(text);

  // Adverbs
  const adverbCount = countAdverbs(words);

  // Long sentences
  const longSentences = sentences.filter(s => s.split(/\s+/).length > 25).length;

  // Suggestions
  const suggestions: ReadabilitySuggestion[] = [];

  if (avgWordsPerSentence > 25) {
    suggestions.push({
      type: 'conciseness',
      message: `Average sentence length is ${Math.round(avgWordsPerSentence)} words. Aim for 15-20 words per sentence.`,
      severity: 'warning',
    });
  }

  if (passiveVoiceCount > 3) {
    suggestions.push({
      type: 'clarity',
      message: `Found ${passiveVoiceCount} instances of passive voice. Use active voice for clearer writing.`,
      severity: 'info',
    });
  }

  if (adverbCount > 5) {
    suggestions.push({
      type: 'conciseness',
      message: `${adverbCount} adverbs detected. Consider replacing adverb+verb pairs with stronger verbs.`,
      severity: 'info',
    });
  }

  if (complexWords / totalWords > 0.15) {
    suggestions.push({
      type: 'clarity',
      message: `${Math.round(complexWords / totalWords * 100)}% complex words (3+ syllables). Consider simpler alternatives where possible.`,
      severity: 'warning',
    });
  }

  if (longSentences > totalSentences * 0.3) {
    suggestions.push({
      type: 'structure',
      message: `${longSentences} sentences exceed 25 words. Break them up for better readability.`,
      severity: 'warning',
    });
  }

  if (totalParagraphs > 1 && totalWords / totalParagraphs > 200) {
    suggestions.push({
      type: 'structure',
      message: 'Some paragraphs are very long. Consider breaking them into smaller sections.',
      severity: 'info',
    });
  }

  // Grade
  let overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (fleschKincaidScore >= 70 && suggestions.filter(s => s.severity === 'warning').length === 0) overallGrade = 'A';
  else if (fleschKincaidScore >= 60) overallGrade = 'B';
  else if (fleschKincaidScore >= 50) overallGrade = 'C';
  else if (fleschKincaidScore >= 30) overallGrade = 'D';
  else overallGrade = 'F';

  return {
    fleschKincaidScore: Math.round(fleschKincaidScore),
    readingLevel,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
    totalWords,
    totalSentences,
    totalParagraphs,
    complexWords,
    passiveVoiceCount,
    adverbCount,
    longSentences,
    suggestions,
    overallGrade,
  };
}
