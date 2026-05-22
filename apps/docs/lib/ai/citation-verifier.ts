'use client';

/**
 * AI Research Citation Verifier
 *
 * When /ai research returns results with citations, this module:
 * - Verifies citations point to real content in the workspace
 * - Detects hallucinated citations
 * - Scores citation relevance
 * - Formats citations for document insertion
 * - Links back to source documents
 */

// ── Types ──

export interface Citation {
  id: string;
  sourceDocId: string;
  sourceDocTitle: string;
  quotedText: string;
  relevanceScore: number;
  isVerified: boolean;
  verificationNote?: string;
  chunkIndex?: number;
}

export interface VerifiedResearch {
  query: string;
  synthesis: string;
  citations: Citation[];
  verifiedCount: number;
  unverifiedCount: number;
  confidenceScore: number;
}

// ── Verification ──

/**
 * Verify a citation by checking if the quoted text exists in the source document.
 */
export function verifyCitation(
  quotedText: string,
  sourceContent: string,
  fuzzyThreshold: number = 0.85,
): {isVerified: boolean; note: string; score: number} {
  // Exact match
  const normalizedQuote = quotedText.toLowerCase().trim();
  const normalizedSource = sourceContent.toLowerCase();

  if (normalizedSource.includes(normalizedQuote)) {
    return {isVerified: true, note: 'Exact match found', score: 1.0};
  }

  // Fuzzy match: check if key phrases from the quote exist
  const quoteWords = normalizedQuote.split(/\s+/).filter(w => w.length > 3);
  if (quoteWords.length === 0) {
    return {isVerified: false, note: 'Citation too short to verify', score: 0};
  }

  const matchedWords = quoteWords.filter(w => normalizedSource.includes(w));
  const matchRatio = matchedWords.length / quoteWords.length;

  if (matchRatio >= fuzzyThreshold) {
    return {
      isVerified: true,
      note: `Fuzzy match (${Math.round(matchRatio * 100)}% word overlap)`,
      score: matchRatio,
    };
  }

  if (matchRatio >= 0.5) {
    return {
      isVerified: false,
      note: `Partial match (${Math.round(matchRatio * 100)}% word overlap) — citation may be paraphrased`,
      score: matchRatio,
    };
  }

  return {
    isVerified: false,
    note: 'Citation text not found in source document',
    score: matchRatio,
  };
}

/**
 * Batch verify all citations against their source documents.
 */
export function verifyResearchCitations(
  citations: Array<{
    quotedText: string;
    sourceDocId: string;
    sourceDocTitle: string;
  }>,
  documentContents: Map<string, string>,
): VerifiedResearch {
  const verified: Citation[] = citations.map((cit, idx) => {
    const sourceContent = documentContents.get(cit.sourceDocId) || '';
    const {isVerified, note, score} = verifyCitation(cit.quotedText, sourceContent);

    return {
      id: `cit-${idx}`,
      sourceDocId: cit.sourceDocId,
      sourceDocTitle: cit.sourceDocTitle,
      quotedText: cit.quotedText,
      relevanceScore: score,
      isVerified,
      verificationNote: note,
    };
  });

  const verifiedCount = verified.filter(c => c.isVerified).length;
  const unverifiedCount = verified.length - verifiedCount;
  const confidenceScore = verified.length > 0
    ? verified.reduce((s, c) => s + c.relevanceScore, 0) / verified.length
    : 0;

  return {
    query: '',
    synthesis: '',
    citations: verified,
    verifiedCount,
    unverifiedCount,
    confidenceScore,
  };
}

// ── Citation Formatting ──

/**
 * Format citations for insertion into a document.
 */
export function formatCitationsForDoc(citations: Citation[]): string {
  if (citations.length === 0) return '';

  const lines: string[] = ['<div class="ai-research-citations">'];
  lines.push('<h4>📋 Sources</h4>');

  for (const cit of citations) {
    const verifiedBadge = cit.isVerified
      ? '<span style="color: #10b981;">✓ Verified</span>'
      : '<span style="color: #f59e0b;">⚠ Unverified</span>';

    lines.push(`<div class="ai-citation-entry" style="margin: 8px 0; padding: 6px 8px; border-left: 2px solid ${cit.isVerified ? '#10b981' : '#f59e0b'}; background: #fafafa; border-radius: 0 4px 4px 0;">`);
    lines.push(`  <span style="font-size: 11px; color: #6b7280;">${verifiedBadge} · Relevance: ${Math.round(cit.relevanceScore * 100)}%</span>`);
    lines.push(`  <div style="font-size: 13px; color: #374151; margin-top: 2px;">"${cit.quotedText.slice(0, 150)}${cit.quotedText.length > 150 ? '...' : ''}"</div>`);
    lines.push(`  <div style="font-size: 11px; color: #6366f1; margin-top: 2px;">— ${cit.sourceDocTitle}</div>`);
    if (cit.verificationNote) {
      lines.push(`  <div style="font-size: 10px; color: #9ca3af;">${cit.verificationNote}</div>`);
    }
    lines.push('</div>');
  }

  lines.push('</div>');
  return lines.join('\n');
}

/**
 * Format a complete research result for document insertion.
 */
export function formatResearchForDoc(research: VerifiedResearch): string {
  const parts: string[] = [];

  // Research block header
  parts.push('<div class="ai-research-block">');
  parts.push(`<div class="ai-research-header">🔍 Research: ${research.query}</div>`);
  parts.push(`<div class="ai-research-text">${research.synthesis}</div>`);

  // Confidence indicator
  const confidencePercent = Math.round(research.confidenceScore * 100);
  const confidenceColor = confidencePercent >= 80 ? '#10b981'
    : confidencePercent >= 50 ? '#f59e0b' : '#ef4444';
  parts.push(`<div style="font-size: 11px; color: ${confidenceColor}; margin-top: 8px;">Confidence: ${confidencePercent}% · ${research.verifiedCount} verified / ${research.unverifiedCount} unverified</div>`);

  // Citations
  if (research.citations.length > 0) {
    parts.push(formatCitationsForDoc(research.citations));
  }

  parts.push('</div>');
  return parts.join('\n');
}

// ── Citation Styles (CSS) ──

export const CITATION_CSS = `
.ai-research-citations {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}
.ai-research-citations h4 {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
`;
