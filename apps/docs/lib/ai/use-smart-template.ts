'use client';

/**
 * AI Smart Template Generator
 *
 * Dynamically generates document templates based on user intent.
 * Goes beyond static templates — uses AI to create tailored content.
 *
 * Template types:
 * - Project Proposal
 * - Meeting Notes
 * - Weekly Report
 * - Blog Post
 * - Letter / Memo
 * - Research Paper
 * - Presentation Notes
 * - Custom (user describes what they need)
 *
 * Each template includes:
 * - AI-generated content based on user description
 * - Suggested title
 * - Suggested tags/labels
 * - Estimated read time
 */

import {useState, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface SmartTemplate {
  id: string;
  type: string;
  title: string;
  html: string;
  suggestedTags: string[];
  estimatedReadTime: number;
  wordCount: number;
}

export interface TemplateRequest {
  type: string;
  description: string;
  tone?: 'professional' | 'casual' | 'academic' | 'creative';
  language?: string;
  length?: 'brief' | 'medium' | 'detailed';
  context?: string; // Additional context from current document
}

export const TEMPLATE_TYPES = [
  {id: 'proposal', label: 'Project Proposal', icon: '🚀', description: 'Comprehensive project proposal with objectives, timeline, and budget'},
  {id: 'meeting-notes', label: 'Meeting Notes', icon: '📋', description: 'Structured meeting notes with action items'},
  {id: 'weekly-report', label: 'Weekly Report', icon: '📊', description: 'Status update with progress, blockers, and plans'},
  {id: 'blog-post', label: 'Blog Post', icon: '✍️', description: 'Engaging blog post with intro, body, and conclusion'},
  {id: 'letter', label: 'Business Letter', icon: '✉️', description: 'Formal business letter with proper formatting'},
  {id: 'memo', label: 'Memo', icon: '📨', description: 'Professional memo with purpose and call to action'},
  {id: 'research-paper', label: 'Research Paper', icon: '🔬', description: 'Academic paper structure with methodology and findings'},
  {id: 'presentation', label: 'Presentation Notes', icon: '🎤', description: 'Speaker notes with slide-by-slide breakdown'},
  {id: 'swot-analysis', label: 'SWOT Analysis', icon: '📈', description: 'Strengths, Weaknesses, Opportunities, Threats'},
  {id: 'project-charter', label: 'Project Charter', icon: '📜', description: 'Project definition, scope, stakeholders, and governance'},
  {id: 'sop', label: 'Standard Operating Procedure', icon: '🔧', description: 'Step-by-step procedure documentation'},
  {id: 'custom', label: 'Custom Template', icon: '🎨', description: 'Describe what you need — AI will generate it'},
] as const;

// ── API Client ──

async function callAI(action: string, payload: Record<string, unknown>): Promise<any> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
  });
  if (!resp.ok) throw new Error('AI request failed');
  return resp.json();
}

// ── Generator ──

export function useSmartTemplateGenerator(editor: Editor | null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<SmartTemplate | null>(null);

  const generate = useCallback(async (request: TemplateRequest): Promise<SmartTemplate | null> => {
    setIsGenerating(true);
    try {
      const result = await callAI('smart-template', {
        type: request.type,
        description: request.description,
        tone: request.tone || 'professional',
        language: request.language || 'English',
        length: request.length || 'medium',
        context: request.context || editor?.state.doc.textContent.slice(0, 500) || '',
      });

      const template: SmartTemplate = {
        id: `template-${Date.now()}`,
        type: request.type,
        title: result.suggestedTitle || `${request.type} template`,
        html: result.html,
        suggestedTags: result.suggestedTags || [],
        estimatedReadTime: result.estimatedReadTime || Math.ceil((result.html?.replace(/<[^>]+>/g, '').split(/\s+/).length || 0) / 200),
        wordCount: result.wordCount || (result.html?.replace(/<[^>]+>/g, '').split(/\s+/).length || 0),
      };

      setLastGenerated(template);
      return template;
    } catch (err) {
      console.error('Template generation failed:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [editor]);

  const applyTemplate = useCallback((template: SmartTemplate) => {
    if (!editor) return;

    editor.chain().focus()
      .setContent(template.html)
      .run();
  }, [editor]);

  const appendTemplate = useCallback((template: SmartTemplate) => {
    if (!editor) return;

    const pos = editor.state.doc.content.size;
    editor.chain().focus()
      .insertContentAt(pos, `<hr>${template.html}`)
      .run();
  }, [editor]);

  return {
    generate,
    applyTemplate,
    appendTemplate,
    isGenerating,
    lastGenerated,
  };
}
