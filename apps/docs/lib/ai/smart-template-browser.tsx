'use client';

/**
 * AI Smart Template Browser
 *
 * A full template browser + generator for Anvil Docs.
 * Shows curated templates with previews, and can generate
 * custom templates via AI from a description.
 *
 * Templates: Proposal, Meeting Notes, Report, Memo, Blog Post,
 *            Letter, SWOT Analysis, Project Plan, OKR, Review
 */

import {useState, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  subtypes?: string[];
}

interface GeneratedTemplate {
  html: string;
  suggestedTitle: string;
}

// ── Template Categories ──

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'proposal',
    name: 'Proposal',
    icon: '📋',
    description: 'Project proposals with objectives, timeline, and budget',
    subtypes: ['Project Proposal', 'Business Proposal', 'Research Proposal', 'Grant Proposal'],
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    icon: '📝',
    description: 'Structured meeting notes with decisions and action items',
    subtypes: ['Team Standup', 'Sprint Review', 'Board Meeting', '1-on-1'],
  },
  {
    id: 'report',
    name: 'Report',
    icon: '📊',
    description: 'Analytical reports with findings and recommendations',
    subtypes: ['Status Report', 'Quarterly Report', 'Incident Report', 'Research Report'],
  },
  {
    id: 'memo',
    name: 'Memo',
    icon: '📨',
    description: 'Professional memos with clear purpose and call to action',
    subtypes: ['Policy Update', 'Announcement', 'Directive'],
  },
  {
    id: 'blog-post',
    name: 'Blog Post',
    icon: '✍️',
    description: 'Engaging blog posts with structured body and conclusion',
    subtypes: ['How-To Guide', 'Opinion Piece', 'Technical Deep-Dive', 'Case Study'],
  },
  {
    id: 'letter',
    name: 'Letter',
    icon: '✉️',
    description: 'Formal business letters with proper formatting',
    subtypes: ['Cover Letter', 'Recommendation Letter', 'Resignation Letter', 'Thank You Letter'],
  },
  {
    id: 'swot-analysis',
    name: 'SWOT Analysis',
    icon: '🔍',
    description: 'Structured SWOT with actionable insights',
  },
  {
    id: 'project-plan',
    name: 'Project Plan',
    icon: '📐',
    description: 'Detailed project plans with milestones and deliverables',
    subtypes: ['Product Launch', 'Migration Plan', 'Rollout Plan'],
  },
  {
    id: 'okr',
    name: 'OKR / Goals',
    icon: '🎯',
    description: 'Objectives and Key Results framework',
  },
  {
    id: 'review',
    name: 'Review',
    icon: '⭐',
    description: 'Performance reviews and evaluations',
    subtypes: ['Peer Review', 'Self Review', '360 Feedback'],
  },
  {
    id: 'presentation-notes',
    name: 'Presentation Notes',
    icon: '🎤',
    description: 'Speaker notes with slide-by-slide breakdown',
  },
  {
    id: 'custom',
    name: 'Custom (AI)',
    icon: '✨',
    description: 'Describe what you need — AI generates it',
  },
];

// ── Component ──

interface SmartTemplateBrowserProps {
  editor: Editor | null;
  onClose: () => void;
  onTemplateApplied?: (title: string) => void;
}

export function SmartTemplateBrowser({editor, onClose, onTemplateApplied}: SmartTemplateBrowserProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState('');
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<GeneratedTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!selectedCategory || !editor) return;

    setIsGenerating(true);
    setError(null);

    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: selectedCategory.id === 'custom' ? 'smart-template' : 'template',
          payload: {
            type: selectedCategory.id,
            subtype: selectedSubtype,
            description: customDescription || undefined,
            context: context || undefined,
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({error: 'Generation failed'}));
        throw new Error(err.error || 'Generation failed');
      }

      const data = await resp.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate template');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedCategory, selectedSubtype, customDescription, context, editor]);

  const handleApply = useCallback(() => {
    if (!preview || !editor) return;

    editor.commands.setContent(preview.html);
    onTemplateApplied?.(preview.suggestedTitle);
    onClose();
  }, [preview, editor, onTemplateApplied, onClose]);

  const handleInsert = useCallback(() => {
    if (!preview || !editor) return;

    editor.chain().focus().insertContent(preview.html).run();
    onClose();
  }, [preview, editor, onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Smart Templates</h2>
            <p className="text-sm text-gray-500">AI-generated templates for any document type</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Template list */}
          <div className="w-72 border-r border-gray-100 overflow-y-auto">
            <div className="p-3">
              {TEMPLATE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat); setSelectedSubtype(null); setPreview(null); setError(null); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-0.5 ${
                    selectedCategory?.id === cat.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{cat.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{cat.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Configuration + Preview */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {selectedCategory ? (
              <div className="p-6">
                {/* Category header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{selectedCategory.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-800">{selectedCategory.name}</h3>
                    <p className="text-sm text-gray-500">{selectedCategory.description}</p>
                  </div>
                </div>

                {/* Subtype selector */}
                {selectedCategory.subtypes && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Type</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedCategory.subtypes.map(sub => (
                        <button
                          key={sub}
                          onClick={() => setSelectedSubtype(sub)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            selectedSubtype === sub
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-indigo-200'
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom description for AI */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    {selectedCategory.id === 'custom' ? 'Describe your template' : 'Additional details (optional)'}
                  </label>
                  <textarea
                    value={customDescription}
                    onChange={e => setCustomDescription(e.target.value)}
                    placeholder={selectedCategory.id === 'custom'
                      ? "e.g., 'A quarterly business review for a SaaS company with sections for metrics, challenges, and next steps'"
                      : "e.g., 'For a fintech startup, Series A pitch'"}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none h-20"
                  />
                </div>

                {/* Context */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Context (optional)</label>
                  <textarea
                    value={context}
                    onChange={e => setContext(e.target.value)}
                    placeholder="Any relevant background, data, or specific requirements..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none h-16"
                  />
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full py-2.5 rounded-lg font-medium text-sm transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Generating...
                    </>
                  ) : (
                    <>✨ Generate Template</>
                  )}
                </button>

                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Preview */}
                {preview && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-700">Preview: {preview.suggestedTitle}</h4>
                      <div className="flex gap-2">
                        <button
                          onClick={handleInsert}
                          className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Insert at cursor
                        </button>
                        <button
                          onClick={handleApply}
                          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          Replace document
                        </button>
                      </div>
                    </div>
                    <div
                      className="border border-gray-200 rounded-lg p-4 text-sm text-gray-700 max-h-80 overflow-y-auto prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{__html: preview.html}}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-3">✨</div>
                  <p className="text-sm">Select a template type to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
