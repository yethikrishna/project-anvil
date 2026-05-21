'use client';

/**
 * Auto-generate document title and summary on save.
 * Uses debounced save detection + AI generation.
 */

import {useState, useEffect, useCallback, useRef} from 'react';
import type {Editor} from '@tiptap/react';

interface AutoTitleSummary {
  title: string | null;
  summary: string | null;
  isGenerating: boolean;
  generate: () => Promise<{title: string; summary: string} | null>;
  applyTitle: (title: string) => void;
}

async function callAI(action: string, payload: Record<string, unknown>): Promise<any> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
  });
  if (!resp.ok) throw new Error('AI request failed');
  return resp.json();
}

export function useAutoTitleSummary(
  editor: Editor | null,
  docId: string,
  currentTitle: string,
  onTitleUpdate: (title: string) => void
): AutoTitleSummary {
  const [title, setTitle] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const lastSaveCount = useRef(0);

  const generate = useCallback(async (): Promise<{title: string; summary: string} | null> => {
    if (!editor) return null;
    setIsGenerating(true);
    try {
      const content = editor.getHTML();
      const [titleResult, summaryResult] = await Promise.all([
        callAI('title', {content, currentTitle}),
        callAI('summary', {content}),
      ]);
      const newTitle = titleResult.title;
      const newSummary = summaryResult.summary;
      setTitle(newTitle);
      setSummary(newSummary);
      return {title: newTitle, summary: newSummary};
    } catch (err) {
      console.error('Auto title/summary failed:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [editor]);

  const applyTitle = useCallback((newTitle: string) => {
    setTitle(newTitle);
    onTitleUpdate(newTitle);
  }, [onTitleUpdate]);

  // Auto-generate on meaningful saves (every ~5 saves for efficiency)
  useEffect(() => {
    if (!editor) return;

    const handler = () => {
      lastSaveCount.current++;
      // Generate title/summary every 5 saves, or if title is still default
      if (lastSaveCount.current % 5 === 0 || currentTitle === 'Untitled' || currentTitle === 'Untitled Document') {
        generate().then(result => {
          if (result && (currentTitle === 'Untitled' || currentTitle === 'Untitled Document')) {
            applyTitle(result.title);
          }
        });
      }
    };

    // Listen for save events via custom event
    window.addEventListener('anvil:doc-saved', handler);
    return () => window.removeEventListener('anvil:doc-saved', handler);
  }, [editor, currentTitle, generate, applyTitle]);

  return {title, summary, isGenerating, generate, applyTitle};
}
