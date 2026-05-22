'use client';

/**
 * AI Heading Suggestions — Anvil Docs
 *
 * Analyzes the content under each heading and suggests clearer,
 * more descriptive, or more action-oriented alternatives.
 *
 * Examples:
 * - "Introduction" → "Why This Matters: The Context Behind This Proposal"
 * - "Results" → "Key Findings: 3 Insights That Changed Our Approach"
 * - "Section 1" → "Technical Architecture Overview"
 *
 * Local analysis for quality issues; AI for better alternatives.
 */

import {useState, useMemo, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface HeadingSuggestion {
  original: string;
  level: number;
  issue: 'vague' | 'generic' | 'short' | 'good';
  suggestions: string[];
  sectionPreview: string;  // first 100 chars of content below heading
}

// ── Vague/generic heading patterns ──

const VAGUE_HEADINGS = new Set([
  'introduction', 'overview', 'summary', 'conclusion', 'section', 'background',
  'details', 'notes', 'misc', 'miscellaneous', 'other', 'additional', 'general',
  'update', 'updates', 'info', 'information', 'content', 'body', 'text',
  'section 1', 'section 2', 'section 3', 'part 1', 'part 2', 'part 3',
  'step 1', 'step 2', 'step 3', 'point 1', 'point 2', 'point 3',
  'heading', 'title', 'untitled',
]);

function classifyHeading(heading: string): HeadingSuggestion['issue'] {
  const lower = heading.toLowerCase().trim();
  if (VAGUE_HEADINGS.has(lower)) return 'generic';
  if (heading.length < 5) return 'short';
  if (lower.match(/^(the |a |an )(overview|introduction|summary|conclusion)/)) return 'vague';
  return 'good';
}

// ── Extract headings with their content ──

function extractHeadingsWithContent(html: string): Array<{
  level: number;
  text: string;
  content: string;
}> {
  const results: Array<{level: number; text: string; content: string}> = [];

  // Split HTML at heading tags
  const parts = html.split(/(<h[1-6][^>]*>.*?<\/h[1-6]>)/gi);

  let currentHeading: {level: number; text: string} | null = null;
  let currentContent = '';

  for (const part of parts) {
    const headingMatch = part.match(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/i);
    if (headingMatch) {
      // Save previous
      if (currentHeading) {
        results.push({
          ...currentHeading,
          content: currentContent.replace(/<[^>]+>/g, ' ').trim().slice(0, 200),
        });
      }
      currentHeading = {
        level: parseInt(headingMatch[1]),
        text: headingMatch[2].replace(/<[^>]+>/g, '').trim(),
      };
      currentContent = '';
    } else if (currentHeading) {
      currentContent += part;
    }
  }

  if (currentHeading) {
    results.push({
      ...currentHeading,
      content: currentContent.replace(/<[^>]+>/g, ' ').trim().slice(0, 200),
    });
  }

  return results;
}

// ── AI suggestions ──

async function fetchHeadingSuggestions(
  heading: string,
  content: string,
  issue: string,
): Promise<string[]> {
  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'suggest-heading',
        payload: {heading, content, issue},
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as {suggestions?: string[]};
    return data.suggestions || [];
  } catch {
    return [];
  }
}

// ── Fallback local suggestions ──

function generateLocalSuggestions(heading: string, content: string): string[] {
  const suggestions: string[] = [];
  const words = content.split(/\s+/).slice(0, 20).join(' ');

  // Add action-oriented prefix
  const actionPrefixes = ['Understanding', 'How to', 'Key', 'Essential', 'Critical'];
  if (heading.length > 3) {
    suggestions.push(`Key ${heading}`);
    suggestions.push(`Understanding ${heading}`);
  }

  // Extract key noun phrases from content
  const nouns = content.match(/\b([A-Z][a-z]+ (?:[A-Z][a-z]+|[a-z]+)){1,3}\b/g);
  if (nouns && nouns.length > 0) {
    suggestions.push(nouns[0]);
  }

  return suggestions.filter(s => s !== heading).slice(0, 3);
}

// ── Component ──

interface HeadingSuggestionsPanelProps {
  editor: Editor;
  onClose: () => void;
}

export function HeadingSuggestionsPanel({editor, onClose}: HeadingSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<HeadingSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedSuggestions, setLoadedSuggestions] = useState<Map<string, string[]>>(new Map());
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const html = editor.getHTML();

  const headings = useMemo(() => extractHeadingsWithContent(html), [html]);
  const issueHeadings = useMemo(
    () => headings.filter(h => classifyHeading(h.text) !== 'good'),
    [headings],
  );

  const handleAnalyze = useCallback(async () => {
    setIsLoading(true);
    const results: HeadingSuggestion[] = [];

    for (const h of issueHeadings.slice(0, 8)) {
      const issue = classifyHeading(h.text);
      let sug = generateLocalSuggestions(h.text, h.content);

      // Try AI for high-value headings
      if (h.content.length > 50) {
        const aiSug = await fetchHeadingSuggestions(h.text, h.content, issue);
        if (aiSug.length > 0) sug = aiSug;
      }

      results.push({
        original: h.text,
        level: h.level,
        issue,
        suggestions: sug,
        sectionPreview: h.content.slice(0, 100),
      });
    }

    setSuggestions(results);
    setIsLoading(false);
  }, [issueHeadings]);

  const handleApply = useCallback((original: string, replacement: string) => {
    const currentHtml = editor.getHTML();
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(<h[1-6][^>]*>)${escaped}(<\/h[1-6]>)`, 'gi');
    const newHtml = currentHtml.replace(regex, (_, open, close) => `${open}${replacement}${close}`);
    editor.commands.setContent(newHtml);
    setApplied(prev => new Set([...prev, original]));
  }, [editor]);

  const ISSUE_LABELS = {
    vague:   {label: 'Vague', color: 'text-yellow-600 bg-yellow-50'},
    generic: {label: 'Generic', color: 'text-orange-600 bg-orange-50'},
    short:   {label: 'Too Short', color: 'text-red-600 bg-red-50'},
    good:    {label: 'Good', color: 'text-green-600 bg-green-50'},
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">📌 Heading Suggestions</span>
          <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">AI</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {suggestions.length === 0 ? (
          <div className="p-5 space-y-4">
            <div className="text-sm text-gray-600">
              {headings.length === 0
                ? 'No headings found in this document. Add some headings first.'
                : issueHeadings.length === 0
                  ? '✅ All headings look great! Clear and descriptive.'
                  : `Found ${issueHeadings.length} heading${issueHeadings.length > 1 ? 's' : ''} that could be improved.`}
            </div>

            {issueHeadings.length > 0 && (
              <div className="space-y-2">
                {issueHeadings.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-4">H{h.level}</span>
                    <span className="text-gray-700">"{h.text}"</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ISSUE_LABELS[classifyHeading(h.text)].color}`}>
                      {ISSUE_LABELS[classifyHeading(h.text)].label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={isLoading || issueHeadings.length === 0}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {isLoading ? '⏳ Analyzing...' : '✨ Suggest Better Headings'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {suggestions.map((s, idx) => (
              <div key={idx} className="px-5 py-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs text-gray-400 mt-0.5">H{s.level}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-700">"{s.original}"</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ISSUE_LABELS[s.issue].color}`}>
                        {ISSUE_LABELS[s.issue].label}
                      </span>
                      {applied.has(s.original) && (
                        <span className="text-[10px] text-green-500">✓ Applied</span>
                      )}
                    </div>
                    {s.sectionPreview && (
                      <div className="text-[11px] text-gray-400 mt-0.5 italic">
                        "{s.sectionPreview.slice(0, 80)}..."
                      </div>
                    )}
                  </div>
                </div>

                {s.suggestions.length > 0 ? (
                  <div className="space-y-1.5 ml-5">
                    {s.suggestions.map((sug, i) => (
                      <button
                        key={i}
                        onClick={() => handleApply(s.original, sug)}
                        disabled={applied.has(s.original)}
                        className="w-full text-left px-3 py-1.5 border border-purple-100 bg-purple-50 hover:bg-purple-100 rounded-lg text-xs text-purple-800 transition-colors disabled:opacity-50"
                      >
                        → {sug}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="ml-5 text-xs text-gray-400">No suggestions available for this heading.</div>
                )}
              </div>
            ))}

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
