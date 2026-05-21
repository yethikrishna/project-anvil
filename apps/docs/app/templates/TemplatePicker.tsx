'use client';

import {useState, useCallback} from 'react';
import {templates, type DocumentTemplate} from './definitions';

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: DocumentTemplate) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  business: '💼 Business',
  personal: '👤 Personal',
  education: '🎓 Education',
  creative: '🎨 Creative',
};

// ── AI Smart Templates ──

const AI_TEMPLATE_TYPES = [
  {id: 'ai-proposal', title: 'AI-Generated Proposal', icon: '🤖', description: 'Describe your project and let AI write a professional proposal', prompt: 'proposal'},
  {id: 'ai-meeting-notes', title: 'AI Meeting Notes', icon: '🤖', description: 'Tell AI about the meeting and it structures the notes', prompt: 'meeting-notes'},
  {id: 'ai-report', title: 'AI-Generated Report', icon: '🤖', description: 'Describe what you need analyzed and AI writes the report', prompt: 'report'},
  {id: 'ai-blog', title: 'AI Blog Post', icon: '🤖', description: 'Give AI a topic and it writes a full blog post', prompt: 'blog-post'},
  {id: 'ai-memo', title: 'AI Business Memo', icon: '🤖', description: 'Describe the memo purpose and AI drafts it', prompt: 'memo'},
  {id: 'ai-letter', title: 'AI Letter', icon: '🤖', description: 'Specify the letter type and recipient, AI writes it', prompt: 'letter'},
];

function renderTemplateCard(template: DocumentTemplate, onSelect: (t: DocumentTemplate) => void) {
  return (
    <button
      key={template.id}
      onClick={() => onSelect(template)}
      className="group text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:shadow-md transition-all bg-white dark:bg-gray-800/50"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{template.icon}</span>
        <div className="min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 transition-colors">
            {template.title}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>
    </button>
  );
}

export function TemplatePicker({open, onClose, onSelect}: TemplatePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiTemplateType, setAiTemplateType] = useState('proposal');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAIGenerate = useCallback(async () => {
    if (!aiDescription.trim()) return;
    setIsGenerating(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'template', payload: {type: aiTemplateType, description: aiDescription}}),
      });
      if (!resp.ok) throw new Error('AI generation failed');
      const result = await resp.json();
      onSelect({
        id: `ai-${Date.now()}`,
        title: result.suggestedTitle || 'AI Generated Document',
        description: aiDescription,
        icon: '✨',
        category: 'business',
        content: result.html,
      });
    } catch (err) {
      console.error('AI template generation failed:', err);
      alert('Failed to generate template. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [aiDescription, aiTemplateType, onSelect]);

  if (!open) return null;

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category === activeCategory);

  // Group filtered by category
  const grouped: Record<string, DocumentTemplate[]> = {};
  for (const t of filtered) {
    (grouped[t.category] ??= []).push(t);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Start from a template</h2>
            <p className="text-sm text-gray-500 mt-1">Pick a template to get started quickly, or start from scratch</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-xl leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Category tabs */}
        <div className="px-6 pt-3 flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {activeCategory === 'all' ? (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map(t => renderTemplateCard(t, onSelect))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(t => renderTemplateCard(t, onSelect))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
          <button
            onClick={() => setShowAIGenerator(!showAIGenerator)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-1 ${
              showAIGenerator ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            ✨ AI Generate
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 rounded-lg transition-colors">
              + Blank document
            </button>
          </div>
        </div>

        {/* AI Generator Panel */}
        {showAIGenerator && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-purple-50/50">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">AI Smart Template</h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {AI_TEMPLATE_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setAiTemplateType(t.prompt)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    aiTemplateType === t.prompt ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-purple-100'
                  }`}
                >
                  {t.icon} {t.title.replace('AI-Generated ', '').replace('AI ', '')}
                </button>
              ))}
            </div>
            <textarea
              value={aiDescription}
              onChange={e => setAiDescription(e.target.value)}
              placeholder="Describe what you need... e.g., 'A project proposal for building a mobile app for restaurant ordering'"
              className="w-full h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex justify-end mt-2">
              <button
                disabled={isGenerating || !aiDescription.trim()}
                onClick={handleAIGenerate}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
              >
                {isGenerating ? 'Generating...' : '✨ Generate with AI'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
