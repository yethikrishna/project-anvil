'use client';

/**
 * AI Content Brief Generator — Anvil Docs
 *
 * Before you start writing, generate a structured brief:
 * - Purpose statement
 * - Target audience
 * - Key messages to convey
 * - Suggested structure
 * - Tone recommendation
 * - Length estimate
 *
 * User provides:
 * - Topic/title
 * - Doc type (article, report, proposal, email, spec, etc.)
 * - Optional context
 *
 * AI returns a structured brief that gets inserted as a commented
 * planning section at the top of the document.
 */

import {useState, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

type DocPurpose = 'inform' | 'persuade' | 'instruct' | 'analyze' | 'propose' | 'document';
type DocAudience = 'executive' | 'technical' | 'general' | 'customer' | 'stakeholder' | 'team';
type DocFormat = 'article' | 'report' | 'proposal' | 'spec' | 'email' | 'memo' | 'presentation' | 'blog';

interface BriefRequest {
  topic: string;
  format: DocFormat;
  purpose: DocPurpose;
  audience: DocAudience;
  context?: string;
  targetLength?: number;
}

interface GeneratedBrief {
  title: string;
  purpose: string;
  audience: string;
  keyMessages: string[];
  structure: Array<{section: string; purpose: string; wordEstimate: number}>;
  tone: string;
  totalWords: number;
  avoidList: string[];
  successCriteria: string;
}

// ── Local brief generation (no AI needed for structure) ──

const FORMAT_STRUCTURES: Record<DocFormat, Array<{section: string; purpose: string; pct: number}>> = {
  article: [
    {section: 'Hook / Opening', purpose: 'Grab attention and establish relevance', pct: 0.1},
    {section: 'Background / Context', purpose: 'Set the scene and problem', pct: 0.2},
    {section: 'Main Argument / Findings', purpose: 'Core message and evidence', pct: 0.45},
    {section: 'Implications', purpose: 'What this means for the reader', pct: 0.15},
    {section: 'Conclusion / Call to Action', purpose: 'Summarize and drive action', pct: 0.1},
  ],
  report: [
    {section: 'Executive Summary', purpose: 'TL;DR for busy readers', pct: 0.1},
    {section: 'Background', purpose: 'Why this report was created', pct: 0.1},
    {section: 'Methodology / Approach', purpose: 'How we gathered the data', pct: 0.15},
    {section: 'Findings', purpose: 'What we discovered', pct: 0.35},
    {section: 'Recommendations', purpose: 'What to do next', pct: 0.2},
    {section: 'Appendix', purpose: 'Supporting data', pct: 0.1},
  ],
  proposal: [
    {section: 'Problem Statement', purpose: 'The pain point we\'re solving', pct: 0.15},
    {section: 'Proposed Solution', purpose: 'Our approach and its benefits', pct: 0.25},
    {section: 'Scope of Work', purpose: 'What\'s included (and what\'s not)', pct: 0.2},
    {section: 'Timeline', purpose: 'When each deliverable arrives', pct: 0.15},
    {section: 'Budget / Investment', purpose: 'Costs and ROI', pct: 0.15},
    {section: 'Why Us / Next Steps', purpose: 'Close the deal', pct: 0.1},
  ],
  spec: [
    {section: 'Overview & Goals', purpose: 'What we\'re building and why', pct: 0.1},
    {section: 'Requirements', purpose: 'What it must do', pct: 0.25},
    {section: 'Technical Design', purpose: 'How it works', pct: 0.35},
    {section: 'Edge Cases & Constraints', purpose: 'What could go wrong', pct: 0.15},
    {section: 'Open Questions', purpose: 'What needs to be decided', pct: 0.15},
  ],
  email: [
    {section: 'Subject Line', purpose: 'Make them want to open it', pct: 0.05},
    {section: 'Opening', purpose: 'Context and why you\'re writing', pct: 0.2},
    {section: 'Key Message', purpose: 'The main point', pct: 0.5},
    {section: 'Call to Action', purpose: 'What you need from them', pct: 0.15},
    {section: 'Closing', purpose: 'Warm sign-off', pct: 0.1},
  ],
  memo: [
    {section: 'To / From / Date / Re', purpose: 'Header info', pct: 0.05},
    {section: 'Purpose', purpose: 'Why this memo exists', pct: 0.15},
    {section: 'Background', purpose: 'Context', pct: 0.2},
    {section: 'Key Points', purpose: 'Main content', pct: 0.4},
    {section: 'Action Items', purpose: 'What happens next', pct: 0.2},
  ],
  presentation: [
    {section: 'Title Slide', purpose: 'First impression', pct: 0.05},
    {section: 'Agenda / Problem', purpose: 'Set expectations', pct: 0.1},
    {section: 'Main Slides', purpose: 'Core content (3-5 key points)', pct: 0.6},
    {section: 'Summary / Takeaways', purpose: 'What to remember', pct: 0.15},
    {section: 'Q&A / Call to Action', purpose: 'Closing', pct: 0.1},
  ],
  blog: [
    {section: 'Title + Hook', purpose: 'SEO + reader capture', pct: 0.1},
    {section: 'Introduction', purpose: 'What this post covers', pct: 0.15},
    {section: 'Main Body (3-5 sections)', purpose: 'Detailed content', pct: 0.55},
    {section: 'Practical Tips / Examples', purpose: 'Actionable value', pct: 0.1},
    {section: 'Conclusion + CTA', purpose: 'Summary and next step', pct: 0.1},
  ],
};

const AUDIENCE_TONES: Record<DocAudience, string> = {
  executive:   'Concise, high-level, ROI-focused. Lead with conclusions. No jargon.',
  technical:   'Precise, detailed, assumes expertise. Include specifics.',
  general:     'Clear, accessible, minimal jargon. Explain concepts.',
  customer:    'Friendly, benefit-focused, avoid internal language.',
  stakeholder: 'Professional, balanced, evidence-based.',
  team:        'Collaborative, direct, can use internal shorthand.',
};

const PURPOSE_TONES: Record<DocPurpose, string> = {
  inform:   'Objective and factual',
  persuade: 'Confident and evidence-based',
  instruct: 'Clear and sequential',
  analyze:  'Thorough and balanced',
  propose:  'Compelling and solution-focused',
  document: 'Precise and comprehensive',
};

function generateBrief(req: BriefRequest): GeneratedBrief {
  const targetLength = req.targetLength || (req.format === 'email' ? 200 : req.format === 'memo' ? 400 : 800);
  const structure = FORMAT_STRUCTURES[req.format] || FORMAT_STRUCTURES['article'];

  return {
    title: req.topic,
    purpose: `${PURPOSE_TONES[req.purpose]}. ${req.context ? `Context: ${req.context}` : ''}`,
    audience: AUDIENCE_TONES[req.audience],
    keyMessages: [
      `State clearly: what is ${req.topic} and why it matters`,
      `Evidence: data, examples, or proof points that support your claims`,
      `Action: what should the reader do or think after reading`,
    ],
    structure: structure.map(s => ({
      section: s.section,
      purpose: s.purpose,
      wordEstimate: Math.round(targetLength * s.pct),
    })),
    tone: `${PURPOSE_TONES[req.purpose]} — ${AUDIENCE_TONES[req.audience]}`,
    totalWords: targetLength,
    avoidList: [
      req.audience === 'executive' ? 'Long paragraphs, technical details, jargon' : '',
      req.audience === 'general' ? 'Unexplained acronyms, industry jargon' : '',
      req.purpose === 'persuade' ? 'Hedging language (might, perhaps, could)' : '',
      'Filler phrases (in order to, due to the fact that)',
      'Passive voice when active is clearer',
    ].filter(Boolean),
    successCriteria: `Reader should leave with a clear understanding of ${req.topic} and know exactly what to do next.`,
  };
}

// ── Markdown formatter ──

function briefToMarkdown(brief: GeneratedBrief): string {
  return `# ${brief.title}

---

## 📋 Writing Brief

**Purpose:** ${brief.purpose}

**Target Audience:** ${brief.audience}

**Tone:** ${brief.tone}

**Target Length:** ~${brief.totalWords} words

**Success Criteria:** ${brief.successCriteria}

### Key Messages
${brief.keyMessages.map(m => `- ${m}`).join('\n')}

### Avoid
${brief.avoidList.map(a => `- ${a}`).join('\n')}

---

## 📐 Suggested Structure

${brief.structure.map(s =>
  `### ${s.section}\n*${s.purpose}* (~${s.wordEstimate} words)\n\n> [Write your content here]`
).join('\n\n')}

---
`;
}

// ── Component ──

interface ContentBriefGeneratorProps {
  editor: Editor;
  onClose: () => void;
}

export function ContentBriefGenerator({editor, onClose}: ContentBriefGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<DocFormat>('article');
  const [purpose, setPurpose] = useState<DocPurpose>('inform');
  const [audience, setAudience] = useState<DocAudience>('general');
  const [context, setContext] = useState('');
  const [targetLength, setTargetLength] = useState(800);
  const [brief, setBrief] = useState<GeneratedBrief | null>(null);
  const [applied, setApplied] = useState(false);

  const handleGenerate = useCallback(() => {
    if (!topic.trim()) return;
    const result = generateBrief({topic: topic.trim(), format, purpose, audience, context, targetLength});
    setBrief(result);
  }, [topic, format, purpose, audience, context, targetLength]);

  const handleApply = useCallback(() => {
    if (!brief) return;
    const md = briefToMarkdown(brief);
    editor.commands.setContent(`<p>${md.replace(/\n/g, '<br>')}</p>`);
    setApplied(true);
    setTimeout(onClose, 600);
  }, [brief, editor, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">📝 Content Brief</span>
          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">AI</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {!brief ? (
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Topic / Title *</label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g., Q3 Sales Report, How to onboard new engineers, Proposal for new CRM system..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Format</label>
                <select
                  value={format}
                  onChange={e => setFormat(e.target.value as DocFormat)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                  {(['article','report','proposal','spec','email','memo','presentation','blog'] as DocFormat[]).map(f => (
                    <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Purpose</label>
                <select
                  value={purpose}
                  onChange={e => setPurpose(e.target.value as DocPurpose)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                  {(['inform','persuade','instruct','analyze','propose','document'] as DocPurpose[]).map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Audience</label>
                <select
                  value={audience}
                  onChange={e => setAudience(e.target.value as DocAudience)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                  {(['executive','technical','general','customer','stakeholder','team'] as DocAudience[]).map(a => (
                    <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Context (optional)</label>
              <input
                type="text"
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Any specific requirements, constraints, or background info..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Target Length</label>
              <div className="flex gap-2">
                {[200, 500, 800, 1500, 3000].map(n => (
                  <button
                    key={n}
                    onClick={() => setTargetLength(n)}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${targetLength === n ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {n < 1000 ? n : `${n/1000}k`} words
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={!topic.trim()}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                📝 Generate Brief
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Brief header */}
            <div className="px-5 py-3 bg-green-50 border-b border-green-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-green-900">{brief.title}</span>
                <span className="text-[10px] text-green-600">~{brief.totalWords} words</span>
              </div>
              <div className="text-xs text-green-700 mt-0.5">{brief.tone}</div>
            </div>

            {/* Key messages */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Key Messages</div>
              <div className="space-y-1">
                {brief.keyMessages.map((m, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                    <span className="text-green-500 mt-0.5">→</span>{m}
                  </div>
                ))}
              </div>
            </div>

            {/* Structure */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Structure</div>
              <div className="space-y-2">
                {brief.structure.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-800">{s.section}</div>
                      <div className="text-[10px] text-gray-400">{s.purpose}</div>
                    </div>
                    <div className="text-[10px] text-gray-400 flex-shrink-0">~{s.wordEstimate}w</div>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full flex-shrink-0">
                      <div
                        className="h-1.5 bg-green-400 rounded-full"
                        style={{width: `${(s.wordEstimate / brief.totalWords) * 100}%`}}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Avoid */}
            {brief.avoidList.length > 0 && (
              <div className="px-5 py-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Avoid</div>
                <div className="flex flex-wrap gap-1">
                  {brief.avoidList.map((a, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded-full">{a}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setBrief(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Revise
              </button>
              <button
                onClick={handleApply}
                className={`px-5 py-2 rounded-lg text-sm font-medium ${applied ? 'bg-green-500 text-white' : 'bg-green-600 text-white hover:bg-green-700'}`}
              >
                {applied ? '✓ Inserted!' : '📝 Insert into Document'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
