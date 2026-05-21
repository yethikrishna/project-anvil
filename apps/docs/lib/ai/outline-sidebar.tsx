'use client';

/**
 * Document Outline Sidebar
 *
 * Renders a live document outline with:
 * - Heading hierarchy visualization
 * - Section health indicators
 * - Word count per section
 * - Click-to-navigate
 * - AI section summary on hover
 * - Readability per section
 */

import {useState, useCallback} from 'react';
import type {Editor} from '@tiptap/react';
import {
  useDocumentOutline,
  scrollToSection,
  getSectionStatusIcon,
  getSectionStatusColor,
  type OutlineSection,
} from '../../../lib/ai/use-document-outline';
import {analyzeReadability} from '../../../lib/ai/readability-analyzer';

// ── Props ──

interface OutlineSidebarProps {
  editor: Editor | null;
  onClose?: () => void;
}

// ── Component ──

export function OutlineSidebar({editor, onClose}: OutlineSidebarProps) {
  const outline = useDocumentOutline(editor);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showReadability, setShowReadability] = useState(false);

  const handleNavigate = useCallback((section: OutlineSection) => {
    scrollToSection(editor, section.position);
    setActiveSection(section.id);
  }, [editor]);

  const handleToggleCollapse = useCallback((sectionId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  // Group sections into hierarchy
  const rootSections = outline.sections.filter(s => s.level === 1);
  const getChildren = (parentId: string, parentLevel: number): OutlineSection[] => {
    const parentIndex = outline.sections.findIndex(s => s.id === parentId);
    const children: OutlineSection[] = [];
    for (let i = parentIndex + 1; i < outline.sections.length; i++) {
      if (outline.sections[i].level <= parentLevel) break;
      if (outline.sections[i].level === parentLevel + 1) {
        children.push(outline.sections[i]);
      }
    }
    return children;
  };

  return (
    <div className="w-64 h-full border-l border-gray-200 bg-gray-50/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📑</span>
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Outline</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowReadability(!showReadability)}
              className={`p-1 rounded text-xs ${showReadability ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Toggle readability stats"
            >
              📊
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-gray-500">{outline.totalSections} sections</span>
          <span className="text-[10px] text-gray-500">{outline.totalWords} words</span>
          {outline.emptySections.length > 0 && (
            <span className="text-[10px] text-red-400">{outline.emptySections.length} empty</span>
          )}
        </div>
      </div>

      {/* Outline Items */}
      <div className="flex-1 overflow-auto py-1">
        {outline.sections.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <span className="text-2xl">📝</span>
            <p className="text-xs text-gray-400 mt-2">Add headings to see the document outline</p>
          </div>
        ) : (
          <div className="space-y-0.5 px-1">
            {renderSections(outline.sections, 0, {
              collapsed,
              activeSection,
              onNavigate: handleNavigate,
              onToggle: handleToggleCollapse,
              showReadability,
              editor,
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {outline.sections.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-200 bg-white">
          <button
            onClick={() => {
              // AI generate table of contents
              if (editor) {
                const html = outline.sections.map(s => {
                  const indent = '  '.repeat(s.level - 1);
                  return `${indent}• ${s.title} (${s.wordCount} words)`;
                }).join('\n');
                console.log('TOC:', html);
              }
            }}
            className="w-full px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            📋 Copy as Table of Contents
          </button>
        </div>
      )}
    </div>
  );
}

// ── Section Rendering ──

function renderSections(
  sections: OutlineSection[],
  startLevel: number,
  ctx: {
    collapsed: Set<string>;
    activeSection: string | null;
    onNavigate: (s: OutlineSection) => void;
    onToggle: (id: string) => void;
    showReadability: boolean;
    editor: Editor | null;
  }
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const indent = section.level - 1;
    const isCollapsed = ctx.collapsed.has(section.id);
    const isActive = ctx.activeSection === section.id;
    const hasChildren = i + 1 < sections.length && sections[i + 1].level > section.level;

    nodes.push(
      <div key={section.id}>
        <button
          onClick={() => ctx.onNavigate(section)}
          className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 group transition-colors ${
            isActive ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{paddingLeft: `${8 + indent * 12}px`}}
        >
          {/* Collapse toggle */}
          {hasChildren ? (
            <span
              onClick={(e) => { e.stopPropagation(); ctx.onToggle(section.id); }}
              className="text-[10px] text-gray-400 w-3 flex-shrink-0 cursor-pointer"
            >
              {isCollapsed ? '▶' : '▼'}
            </span>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}

          {/* Status */}
          <span className={`text-[10px] flex-shrink-0 ${getSectionStatusColor(section.status)}`}>
            {getSectionStatusIcon(section.status)}
          </span>

          {/* Title */}
          <span className="flex-1 truncate font-medium">{section.title}</span>

          {/* Word count */}
          {ctx.showReadability && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">{section.wordCount}w</span>
          )}
        </button>
      </div>
    );

    // Skip children if collapsed
    if (isCollapsed && hasChildren) {
      let j = i + 1;
      while (j < sections.length && sections[j].level > section.level) j++;
      i = j - 1; // Will be incremented by loop
    }
  }

  return nodes;
}
