/**
 * Document Intelligence — auto TOC, style matching, version diff summary.
 *
 * These are pure functions that analyze HTML document content
 * and produce structured intelligence artifacts.
 */

// ── Auto Table of Contents ──

export interface TOCEntry {
  id: string;
  level: number;
  text: string;
  children: TOCEntry[];
}

/**
 * Extract a table of contents from HTML content by parsing headings.
 */
export function generateTOC(html: string): TOCEntry[] {
  const headings: {level: number; text: string; id: string}[] = [];

  // Parse headings (h1-h6)
  const headingRegex = /<h([1-6])(?:\s[^>]*)?>(.*?)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '').trim(); // Strip inner HTML
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    headings.push({level, text, id});
  }

  // Build nested tree
  const root: TOCEntry[] = [];
  const stack: TOCEntry[] = [];

  for (const heading of headings) {
    const entry: TOCEntry = {
      id: heading.id,
      level: heading.level,
      text: heading.text,
      children: [],
    };

    // Find parent
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(entry);
    } else {
      root.push(entry);
    }

    stack.push(entry);
  }

  return root;
}

/**
 * Convert TOC to markdown-formatted string.
 */
export function tocToMarkdown(toc: TOCEntry[], indent = 0): string {
  let result = '';
  for (const entry of toc) {
    result += `${'  '.repeat(indent)}- [${entry.text}](#${entry.id})\n`;
    if (entry.children.length > 0) {
      result += tocToMarkdown(entry.children, indent + 1);
    }
  }
  return result;
}

// ── Style Analysis ──

export interface StyleReport {
  totalWords: number;
  totalParagraphs: number;
  avgWordsPerSentence: number;
  avgSentencesPerParagraph: number;
  readabilityScore: number; // Flesch-Kincaid
  headingCount: number;
  listCount: number;
  imageCount: number;
  linkCount: number;
  suggestions: StyleSuggestion[];
}

export interface StyleSuggestion {
  type: 'clarity' | 'structure' | 'formatting' | 'readability';
  message: string;
  location?: string;
}

/**
 * Analyze document style and provide suggestions.
 */
export function analyzeStyle(html: string): StyleReport {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = html.split(/<\/p>/i).filter(p => p.trim().length > 0);

  const headings = (html.match(/<h[1-6]/gi) ?? []).length;
  const lists = (html.match(/<[ou]l/gi) ?? []).length;
  const images = (html.match(/<img/gi) ?? []).length;
  const links = (html.match(/<a\s/gi) ?? []).length;

  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
  const avgSentencesPerParagraph = sentences.length / Math.max(paragraphs.length, 1);

  // Simplified Flesch-Kincaid readability
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const readability = Math.max(0, Math.min(100,
    206.835 - 1.015 * (words.length / Math.max(sentences.length, 1))
    - 84.6 * (syllables / Math.max(words.length, 1))
  ));

  const suggestions: StyleSuggestion[] = [];

  if (avgWordsPerSentence > 25) {
    suggestions.push({
      type: 'readability',
      message: `Average sentence length is ${Math.round(avgWordsPerSentence)} words. Consider shorter sentences for clarity (aim for 15-20).`,
    });
  }

  if (headings === 0 && words.length > 200) {
    suggestions.push({
      type: 'structure',
      message: 'Document has no headings. Add section headings to improve scannability.',
    });
  }

  if (avgSentencesPerParagraph > 6) {
    suggestions.push({
      type: 'formatting',
      message: 'Some paragraphs are very long. Consider breaking them into smaller sections.',
    });
  }

  if (readability < 30) {
    suggestions.push({
      type: 'clarity',
      message: 'Document may be difficult to read. Consider simpler language and shorter sentences.',
    });
  }

  if (words.length > 500 && images === 0) {
    suggestions.push({
      type: 'formatting',
      message: 'Long document with no images. Consider adding visuals to break up text.',
    });
  }

  return {
    totalWords: words.length,
    totalParagraphs: paragraphs.length,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    avgSentencesPerParagraph: Math.round(avgSentencesPerParagraph * 10) / 10,
    readabilityScore: Math.round(readability),
    headingCount: headings,
    listCount: lists,
    imageCount: images,
    linkCount: links,
    suggestions,
  };
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// ── Version Diff Summary ──

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  sectionsAdded: string[];
  sectionsRemoved: string[];
  sectionsChanged: string[];
  summary: string;
}

/**
 * Generate a human-readable diff summary between two document versions.
 */
export function summarizeDiff(oldHtml: string, newHtml: string): DiffSummary {
  const oldText = oldHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const newText = newHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const oldWords = new Set(oldText.split(/\s+/));
  const newWords = new Set(newText.split(/\s+/));

  let added = 0;
  let removed = 0;

  for (const word of newWords) {
    if (!oldWords.has(word)) added++;
  }
  for (const word of oldWords) {
    if (!newWords.has(word)) removed++;
  }

  // Detect section changes (headings)
  const oldHeadings = (oldHtml.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) ?? [])
    .map(h => h.replace(/<[^>]+>/g, '').trim());
  const newHeadings = (newHtml.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) ?? [])
    .map(h => h.replace(/<[^>]+>/g, '').trim());

  const oldHeadingSet = new Set(oldHeadings);
  const newHeadingSet = new Set(newHeadings);

  const sectionsAdded = newHeadings.filter(h => !oldHeadingSet.has(h));
  const sectionsRemoved = oldHeadings.filter(h => !newHeadingSet.has(h));
  const sectionsChanged = newHeadings.filter(h => oldHeadingSet.has(h));

  const totalChanges = added + removed;
  const changePercent = oldWords.size > 0
    ? Math.round((totalChanges / oldWords.size) * 100)
    : 100;

  let summary: string;

  if (changePercent === 0) {
    summary = 'No changes detected.';
  } else if (changePercent < 5) {
    summary = `Minor edits: ${added} words added, ${removed} words removed.`;
  } else if (changePercent < 25) {
    summary = `Moderate revision: ${added} words added, ${removed} words removed (${changePercent}% changed).`;
    if (sectionsAdded.length > 0) {
      summary += ` New sections: ${sectionsAdded.join(', ')}.`;
    }
  } else {
    summary = `Major revision: ${added} words added, ${removed} words removed (${changePercent}% changed).`;
    if (sectionsAdded.length > 0) {
      summary += ` New sections: ${sectionsAdded.join(', ')}.`;
    }
    if (sectionsRemoved.length > 0) {
      summary += ` Removed sections: ${sectionsRemoved.join(', ')}.`;
    }
  }

  return {
    added,
    removed,
    changed: Math.min(added, removed), // Approximate "changed" as overlap
    sectionsAdded,
    sectionsRemoved,
    sectionsChanged,
    summary,
  };
}
