'use client';

import {useState} from 'react';
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

export function TemplatePicker({open, onClose, onSelect}: TemplatePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');

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
                  {items.map(renderTemplateCard)}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(renderTemplateCard)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 rounded-lg transition-colors"
          >
            + Blank document
          </button>
        </div>
      </div>
    </div>
  );

  function renderTemplateCard(template: DocumentTemplate) {
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
}
