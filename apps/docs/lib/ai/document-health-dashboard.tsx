'use client';

/**
 * Document Health Dashboard — Real-time Writing Quality Panel
 *
 * Shows overall grade, breakdowns, and AI-fixable suggestions.
 * Smarter than Google Docs: not just spell-check but structure,
 * completeness, style, and accessibility analysis.
 */

import {useState, useEffect, useMemo, useCallback} from 'react';
import type {Editor} from '@tiptap/react';
import {
  analyzeDocumentHealth,
  getGradeColor,
  getScoreColor,
  type DocumentHealth,
  type HealthSuggestion,
} from './document-health';

// ── Component ──

interface DocumentHealthDashboardProps {
  editor: Editor | null;
  onClose: () => void;
}

export function DocumentHealthDashboard({editor, onClose}: DocumentHealthDashboardProps) {
  const [health, setHealth] = useState<DocumentHealth | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const analyze = useCallback(() => {
    if (!editor) return;
    setIsAnalyzing(true);
    // Small delay for UX
    setTimeout(() => {
      const result = analyzeDocumentHealth(editor.getHTML());
      setHealth(result);
      setIsAnalyzing(false);
    }, 100);
  }, [editor]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  // Auto-refresh on content changes
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const timeout = setTimeout(analyze, 2000);
      return () => clearTimeout(timeout);
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, analyze]);

  if (!health && !isAnalyzing) return null;

  return (
    <div className="w-72 border-l border-gray-200 bg-white overflow-auto flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-sm font-semibold text-gray-800">Document Health</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      {isAnalyzing && !health ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-xs text-gray-400">Analyzing document...</p>
          </div>
        </div>
      ) : health ? (
        <div className="flex-1 overflow-auto">
          {/* Overall Score */}
          <div className="px-4 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold ${getGradeColor(health.grade)}`}>
                {health.grade}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{health.overallScore}<span className="text-sm text-gray-400">/100</span></p>
                <p className="text-[10px] text-gray-400">Overall Health Score</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-2 gap-2">
            <StatBox label="Words" value={health.wordCount.toLocaleString()} />
            <StatBox label="Read Time" value={`${health.estimatedReadTime} min`} />
            <StatBox label="Headings" value={`${health.headingCount}`} />
            <StatBox label="Paragraphs" value={`${health.paragraphCount}`} />
            <StatBox label="Images" value={`${health.imageCount}`} />
            <StatBox label="Links" value={`${health.linkCount}`} />
          </div>

          {/* Breakdown */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">Breakdown</p>
            {Object.entries(health.breakdown).map(([key, val]) => {
              const pct = val.score / val.max;
              const label = key.charAt(0).toUpperCase() + key.slice(1);
              return (
                <div key={key} className="mb-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-gray-600">{label}</span>
                    <span className="text-[10px] text-gray-400">{val.score}/{val.max}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getScoreColor(val.score, val.max)}`}
                      style={{width: `${pct * 100}%`}}
                    />
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">{val.label}</p>
                </div>
              );
            })}
          </div>

          {/* Suggestions */}
          {health.suggestions.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Suggestions ({health.suggestions.length})
              </p>
              <div className="space-y-1.5">
                {health.suggestions.slice(0, 8).map((sug, i) => (
                  <SuggestionCard key={i} suggestion={sug} onFix={sug.fix ? () => {
                    // Trigger AI fix
                    if (sug.category === 'style' && editor) {
                      (editor.commands as any).aiRewrite?.('fix-grammar');
                    }
                  } : undefined} />
                ))}
                {health.suggestions.length > 8 && (
                  <p className="text-[10px] text-gray-400 text-center pt-1">
                    +{health.suggestions.length - 8} more suggestions
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Re-analyze button */}
      <div className="border-t border-gray-200 px-4 py-2">
        <button
          onClick={analyze}
          disabled={isAnalyzing}
          className="w-full py-1.5 text-xs text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {isAnalyzing ? 'Analyzing...' : '✨ Re-analyze'}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatBox({label, value}: {label: string; value: string}) {
  return (
    <div className="px-2 py-1.5 bg-gray-50 rounded-lg">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-700">{value}</p>
    </div>
  );
}

function SuggestionCard({suggestion, onFix}: {suggestion: HealthSuggestion; onFix?: () => void}) {
  const priorityColors = {
    high: 'border-l-red-500 bg-red-50/50',
    medium: 'border-l-yellow-500 bg-yellow-50/50',
    low: 'border-l-blue-500 bg-blue-50/50',
  };

  const priorityLabels = {
    high: '🔴',
    medium: '🟡',
    low: '🔵',
  };

  return (
    <div className={`border-l-2 rounded-r px-2 py-1.5 ${priorityColors[suggestion.priority]}`}>
      <div className="flex items-start gap-1">
        <span className="text-[9px]">{priorityLabels[suggestion.priority]}</span>
        <p className="text-[10px] text-gray-700 flex-1">{suggestion.message}</p>
      </div>
      {suggestion.fix && onFix && (
        <button
          onClick={onFix}
          className="mt-1 text-[9px] text-purple-600 hover:text-purple-800"
        >
          ✨ {suggestion.fix}
        </button>
      )}
    </div>
  );
}
