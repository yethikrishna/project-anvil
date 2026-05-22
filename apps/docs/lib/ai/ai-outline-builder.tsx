'use client';

/**
 * AI Outline Auto-builder — Anvil Docs
 *
 * Analyzes document content and:
 * 1. Generates a smart outline from unstructured prose
 * 2. Suggests structural improvements to existing outlines
 * 3. Can apply the outline directly (restructures the document)
 * 4. Detects missing sections and suggests additions
 *
 * Two modes:
 * - "Generate from scratch": AI creates an outline from your content
 * - "Improve existing": Analyzes current headings, suggests reorder/additions
 */

import {useState, useCallback, useMemo} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface OutlineNode {
  level: 1 | 2 | 3;
  title: string;
  wordEstimate?: number;
  isNew?: boolean;        // AI-suggested new section
  isMissing?: boolean;    // currently missing from doc
}

export interface GeneratedOutline {
  nodes: OutlineNode[];
  docType: string;           // "technical spec", "business proposal", etc.
  suggestedTitle?: string;
  missingSections: string[];
  structureScore: number;    // 0-100: how well-structured is the current doc
}

// ── Doc type detection ──

const DOC_TYPE_PATTERNS: Array<{type: string; patterns: RegExp[]}> = [
  {
    type: 'Technical Spec',
    patterns: [/\b(api|endpoint|schema|database|architecture|implementation|interface|class|function|component|service|module)\b/i],
  },
  {
    type: 'Business Proposal',
    patterns: [/\b(proposal|budget|roi|stakeholder|deliverable|scope|timeline|cost|revenue|strategy)\b/i],
  },
  {
    type: 'Meeting Notes',
    patterns: [/\b(attendees|action items|agenda|discussed|decision|next steps|follow-up)\b/i],
  },
  {
    type: 'Project Plan',
    patterns: [/\b(milestone|sprint|deadline|task|owner|status|priority|blocked|in progress|completed)\b/i],
  },
  {
    type: 'Research Report',
    patterns: [/\b(hypothesis|methodology|findings|conclusion|data|analysis|study|research|evidence)\b/i],
  },
  {
    type: 'Product Requirements',
    patterns: [/\b(user story|acceptance criteria|feature|requirement|persona|use case|functional|non-functional)\b/i],
  },
];

function detectDocType(text: string): string {
  const scores: Record<string, number> = {};
  for (const {type, patterns} of DOC_TYPE_PATTERNS) {
    scores[type] = patterns.filter(p => p.test(text)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'General Document';
}

// ── Outline templates by doc type ──

const OUTLINE_TEMPLATES: Record<string, OutlineNode[]> = {
  'Technical Spec': [
    {level: 1, title: 'Overview'},
    {level: 2, title: 'Goals & Non-Goals'},
    {level: 2, title: 'Background'},
    {level: 1, title: 'Technical Design'},
    {level: 2, title: 'Architecture'},
    {level: 2, title: 'API / Interface'},
    {level: 2, title: 'Data Model'},
    {level: 1, title: 'Implementation Plan'},
    {level: 2, title: 'Milestones'},
    {level: 2, title: 'Dependencies'},
    {level: 1, title: 'Open Questions'},
  ],
  'Business Proposal': [
    {level: 1, title: 'Executive Summary'},
    {level: 1, title: 'Problem Statement'},
    {level: 1, title: 'Proposed Solution'},
    {level: 2, title: 'Scope of Work'},
    {level: 2, title: 'Deliverables'},
    {level: 1, title: 'Timeline'},
    {level: 1, title: 'Budget & ROI'},
    {level: 1, title: 'Team'},
    {level: 1, title: 'Next Steps'},
  ],
  'Meeting Notes': [
    {level: 1, title: 'Meeting Info'},
    {level: 2, title: 'Date & Attendees'},
    {level: 2, title: 'Agenda'},
    {level: 1, title: 'Discussion'},
    {level: 1, title: 'Decisions Made'},
    {level: 1, title: 'Action Items'},
    {level: 1, title: 'Next Meeting'},
  ],
  'Project Plan': [
    {level: 1, title: 'Project Overview'},
    {level: 2, title: 'Objectives'},
    {level: 2, title: 'Success Criteria'},
    {level: 1, title: 'Scope'},
    {level: 2, title: 'In Scope'},
    {level: 2, title: 'Out of Scope'},
    {level: 1, title: 'Timeline & Milestones'},
    {level: 1, title: 'Team & Responsibilities'},
    {level: 1, title: 'Risks & Mitigations'},
  ],
  'Research Report': [
    {level: 1, title: 'Abstract'},
    {level: 1, title: 'Introduction'},
    {level: 2, title: 'Background & Related Work'},
    {level: 2, title: 'Research Questions'},
    {level: 1, title: 'Methodology'},
    {level: 1, title: 'Findings'},
    {level: 1, title: 'Discussion'},
    {level: 1, title: 'Conclusion'},
    {level: 1, title: 'References'},
  ],
  'Product Requirements': [
    {level: 1, title: 'Product Overview'},
    {level: 2, title: 'Problem & Opportunity'},
    {level: 2, title: 'Target Users'},
    {level: 1, title: 'Goals & Success Metrics'},
    {level: 1, title: 'User Stories'},
    {level: 1, title: 'Functional Requirements'},
    {level: 1, title: 'Non-Functional Requirements'},
    {level: 1, title: 'Open Questions'},
  ],
};

// ── Extract existing headings from HTML ──

function extractHeadings(html: string): Array<{level: number; text: string}> {
  const matches = [...html.matchAll(/<h([1-3])[^>]*>(.*?)<\/h[1-3]>/gi)];
  return matches.map(m => ({
    level: parseInt(m[1]),
    text: m[2].replace(/<[^>]+>/g, '').trim(),
  }));
}

// ── Analyze structure quality ──

function scoreStructure(headings: Array<{level: number; text: string}>, wordCount: number): number {
  if (wordCount < 50) return 50;
  if (headings.length === 0) return 20;

  let score = 40; // base for having some headings

  // Reward h1 usage
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count >= 1 && h1Count <= 5) score += 20;

  // Reward hierarchical structure
  const hasH2 = headings.some(h => h.level === 2);
  if (hasH2) score += 15;

  // Reward reasonable heading density (1 heading per ~200 words)
  const idealHeadings = Math.round(wordCount / 200);
  const headingDiff = Math.abs(headings.length - idealHeadings);
  score += Math.max(0, 15 - headingDiff * 3);

  // Penalize all-same-level
  const uniqueLevels = new Set(headings.map(h => h.level)).size;
  if (uniqueLevels === 1 && headings.length > 2) score -= 10;

  return Math.min(100, Math.max(0, score));
}

// ── AI outline generation ──

async function generateOutlineWithAI(
  text: string,
  docType: string,
  currentHeadings: Array<{level: number; text: string}>,
): Promise<GeneratedOutline> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'generate-outline',
      payload: {
        text: text.slice(0, 3000),
        docType,
        currentHeadings: currentHeadings.map(h => `${'  '.repeat(h.level - 1)}- ${h.text}`).join('\n'),
      },
    }),
  });

  if (!resp.ok) throw new Error('AI outline generation failed');
  const data = await resp.json() as {
    outline?: OutlineNode[];
    suggestedTitle?: string;
    missingSections?: string[];
  };

  return {
    nodes: data.outline || [],
    docType,
    suggestedTitle: data.suggestedTitle,
    missingSections: data.missingSections || [],
    structureScore: scoreStructure(currentHeadings, text.split(/\s+/).length),
  };
}

// ── Apply outline to editor ──

function applyOutlineToEditor(editor: Editor, nodes: OutlineNode[]): void {
  // Build heading HTML
  const headingHtml = nodes
    .map(node => `<h${node.level}>${node.title}</h${node.level}>`)
    .join('');

  // Insert at top if no content, or prepend
  const existingContent = editor.getHTML();
  if (existingContent === '<p></p>' || existingContent === '') {
    editor.commands.setContent(headingHtml + '<p></p>');
  } else {
    editor.commands.setContent(headingHtml + '<hr>' + existingContent);
  }
}

// ── Component ──

const LEVEL_INDENT = {1: '', 2: 'ml-4', 3: 'ml-8'};
const LEVEL_TEXT = {1: 'text-sm font-semibold', 2: 'text-xs font-medium', 3: 'text-xs'};

interface AIOutlineBuilderProps {
  editor: Editor;
  onClose: () => void;
}

export function AIOutlineBuilder({editor, onClose}: AIOutlineBuilderProps) {
  const [outline, setOutline] = useState<GeneratedOutline | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'generate' | 'template'>('generate');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [applied, setApplied] = useState(false);
  const [editingNodes, setEditingNodes] = useState<OutlineNode[] | null>(null);

  const text = editor.getText();
  const html = editor.getHTML();
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const {docType, currentHeadings, structureScore} = useMemo(() => {
    const dt = detectDocType(text);
    const ch = extractHeadings(html);
    const ss = scoreStructure(ch, wordCount);
    return {docType: dt, currentHeadings: ch, structureScore: ss};
  }, [text, html, wordCount]);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await generateOutlineWithAI(text, docType, currentHeadings);
      setOutline(result);
      setEditingNodes([...result.nodes]);
    } catch {
      // Fallback to template
      const template = OUTLINE_TEMPLATES[docType] || OUTLINE_TEMPLATES['General Document'] || [];
      setOutline({
        nodes: template,
        docType,
        missingSections: [],
        structureScore,
      });
      setEditingNodes([...template]);
    }
    setIsLoading(false);
  }, [text, docType, currentHeadings, structureScore]);

  const handleUseTemplate = useCallback(() => {
    const template = OUTLINE_TEMPLATES[selectedTemplate] || [];
    const result: GeneratedOutline = {
      nodes: template,
      docType: selectedTemplate,
      missingSections: [],
      structureScore,
    };
    setOutline(result);
    setEditingNodes([...template]);
  }, [selectedTemplate, structureScore]);

  const handleApply = useCallback(() => {
    const nodes = editingNodes || outline?.nodes || [];
    applyOutlineToEditor(editor, nodes);
    setApplied(true);
    setTimeout(onClose, 800);
  }, [editor, editingNodes, outline, onClose]);

  const removeNode = (idx: number) => {
    setEditingNodes(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  };

  const moveNode = (idx: number, dir: -1 | 1) => {
    setEditingNodes(prev => {
      if (!prev) return prev;
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">📐 AI Outline Builder</span>
          <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full font-medium">AI</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {!outline ? (
          /* Setup phase */
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Doc type detection */}
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
              <span className="text-sm">📄</span>
              <div>
                <div className="text-xs font-medium text-blue-900">Detected: {docType}</div>
                <div className="text-[11px] text-blue-600">
                  {wordCount} words · {currentHeadings.length} headings · Structure score: {structureScore}/100
                </div>
              </div>
            </div>

            {/* Mode selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  mode === 'generate' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                ✨ AI Generate
              </button>
              <button
                onClick={() => setMode('template')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  mode === 'template' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                📋 Use Template
              </button>
            </div>

            {mode === 'generate' ? (
              <div className="text-xs text-gray-500">
                AI will analyze your document content and generate a smart outline tailored to your writing.
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Choose template</label>
                <select
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">Select template...</option>
                  {Object.keys(OUTLINE_TEMPLATES).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={mode === 'generate' ? handleGenerate : handleUseTemplate}
                disabled={isLoading || (mode === 'template' && !selectedTemplate)}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? '⏳ Generating...' : mode === 'generate' ? '✨ Generate Outline' : '📋 Use Template'}
              </button>
            </div>
          </div>
        ) : (
          /* Review & apply phase */
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <span className="text-xs text-gray-500">{outline.docType}</span>
              {outline.suggestedTitle && (
                <span className="text-xs text-blue-500 truncate">→ "{outline.suggestedTitle}"</span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => { setOutline(null); setEditingNodes(null); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back
              </button>
            </div>

            {/* Outline nodes */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {(editingNodes || outline.nodes).map((node, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 group ${LEVEL_INDENT[node.level]}`}
                >
                  <span className="text-gray-300 text-xs w-4">H{node.level}</span>
                  <span className={`flex-1 text-gray-800 ${LEVEL_TEXT[node.level]} ${node.isMissing ? 'text-blue-500' : ''}`}>
                    {node.title}
                    {node.isNew && <span className="ml-1 text-[10px] text-purple-500">new</span>}
                    {node.isMissing && <span className="ml-1 text-[10px] text-blue-400">missing</span>}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    <button onClick={() => moveNode(idx, -1)} className="p-0.5 text-gray-400 hover:text-gray-600 text-xs">↑</button>
                    <button onClick={() => moveNode(idx, 1)} className="p-0.5 text-gray-400 hover:text-gray-600 text-xs">↓</button>
                    <button onClick={() => removeNode(idx)} className="p-0.5 text-red-300 hover:text-red-500 text-xs">×</button>
                  </div>
                </div>
              ))}
            </div>

            {outline.missingSections.length > 0 && (
              <div className="px-5 py-2 border-t border-gray-100 bg-yellow-50">
                <div className="text-[11px] text-yellow-700 font-medium mb-1">Suggested additions:</div>
                <div className="flex flex-wrap gap-1">
                  {outline.missingSections.map(s => (
                    <button
                      key={s}
                      onClick={() => setEditingNodes(prev => prev ? [...prev, {level: 2, title: s, isNew: true}] : prev)}
                      className="text-[10px] px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full hover:bg-yellow-200"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {(editingNodes || outline.nodes).length} sections · Will prepend outline to document
              </span>
              <button
                onClick={handleApply}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  applied
                    ? 'bg-green-500 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {applied ? '✓ Applied!' : '📐 Apply to Document'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
