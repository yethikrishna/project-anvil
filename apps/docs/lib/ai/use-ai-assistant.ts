'use client';

/**
 * AI Document Assistant Hook
 *
 * Provides a floating AI panel that understands the current document context
 * and can answer questions, make suggestions, and perform actions.
 *
 * Features:
 * - "Ask AI about this document" — Q&A with full document context
 * - Smart suggestions based on document type and content
 * - One-click actions (fix all grammar, add section, etc.)
 * - Document health check (readability, structure, completeness)
 */

import {useState, useCallback, useRef, useEffect} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

export interface AIAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: AIAssistantAction[];
  timestamp: number;
}

export interface AIAssistantAction {
  label: string;
  type: 'replace-all' | 'insert' | 'command';
  payload?: Record<string, unknown>;
}

export interface DocumentHealth {
  overallScore: number;  // 0-100
  readability: number;
  structure: number;
  completeness: number;
  suggestions: string[];
}

export interface AIAssistantState {
  messages: AIAssistantMessage[];
  isOpen: boolean;
  isLoading: boolean;
  documentHealth: DocumentHealth | null;
}

// ── API Client ──

async function callAI(action: string, payload: Record<string, unknown>): Promise<any> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload}),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({error: 'AI request failed'}));
    throw new Error(err.error || 'AI request failed');
  }
  return resp.json();
}

// ── Smart Suggestions Based on Document Analysis ──

function analyzeDocumentContent(html: string): {
  wordCount: number;
  headingCount: number;
  paragraphCount: number;
  listCount: number;
  hasIntroduction: boolean;
  hasConclusion: boolean;
  hasActionItems: boolean;
  estimatedReadTime: number;
} {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  const headingCount = (html.match(/<h[1-3]/gi) || []).length;
  const paragraphCount = (html.match(/<p>/gi) || []).length;
  const listCount = (html.match(/<[uo]l>/gi) || []).length;

  const lowerText = text.toLowerCase();
  const hasIntroduction = /introduction|overview|executive summary|background/i.test(lowerText.slice(0, 500));
  const hasConclusion = /conclusion|summary|next steps|takeaway|wrap.?up/i.test(lowerText.slice(-500));
  const hasActionItems = /action item|todo|☐|next step|follow.?up/i.test(lowerText);

  const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200));

  return {wordCount, headingCount, paragraphCount, listCount, hasIntroduction, hasConclusion, hasActionItems, estimatedReadTime};
}

function generateSmartSuggestions(analysis: ReturnType<typeof analyzeDocumentContent>): string[] {
  const suggestions: string[] = [];

  if (analysis.wordCount < 100) {
    suggestions.push('Document seems short — would you like me to expand any section?');
  }
  if (analysis.headingCount === 0 && analysis.wordCount > 200) {
    suggestions.push('Add headings to improve document structure');
  }
  if (!analysis.hasIntroduction && analysis.wordCount > 300) {
    suggestions.push('Consider adding an introduction or overview section');
  }
  if (!analysis.hasConclusion && analysis.wordCount > 500) {
    suggestions.push('Add a conclusion or summary section');
  }
  if (analysis.wordCount > 1000 && analysis.listCount < 2) {
    suggestions.push('Long documents benefit from bullet points or numbered lists');
  }
  if (analysis.estimatedReadTime > 5) {
    suggestions.push(`This is a ${analysis.estimatedReadTime}-min read — consider adding a table of contents`);
  }

  return suggestions;
}

// ── Hook ──

export function useAIAssistant(editor: Editor | null) {
  const [messages, setMessages] = useState<AIAssistantMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [documentHealth, setDocumentHealth] = useState<DocumentHealth | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Analyze document when opened
  useEffect(() => {
    if (!isOpen || !editor) return;

    const html = editor.getHTML();
    const analysis = analyzeDocumentContent(html);
    const smartSuggestions = generateSmartSuggestions(analysis);
    setSuggestions(smartSuggestions);

    // Compute document health
    const structureScore = Math.min(100, analysis.headingCount * 15 + analysis.listCount * 10 + 30);
    const completenessScore = [
      analysis.hasIntroduction,
      analysis.hasConclusion,
      analysis.hasActionItems,
      analysis.wordCount > 200,
      analysis.headingCount > 0,
    ].filter(Boolean).length * 20;
    const readabilityScore = Math.min(100, Math.max(30, 100 - (analysis.wordCount > 0 ? Math.abs(analysis.wordCount / analysis.paragraphCount - 50) : 0)));
    const overallScore = Math.round((structureScore + completenessScore + readabilityScore) / 3);

    setDocumentHealth({
      overallScore,
      readability: Math.round(readabilityScore),
      structure: Math.round(structureScore),
      completeness: Math.round(completenessScore),
      suggestions: smartSuggestions,
    });
  }, [isOpen, editor]);

  // Send a question to the AI assistant
  const askQuestion = useCallback(async (question: string) => {
    if (!editor) return;

    const userMsg: AIAssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const docContent = editor.getHTML();
      const plainText = docContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);

      const result = await callAI('assistant', {
        question,
        documentContent: plainText,
        conversationHistory: messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content,
        })),
      });

      const assistantMsg: AIAssistantMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: result.response || result.text || 'I couldn\'t generate a response.',
        actions: result.actions || [],
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: AIAssistantMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [editor, messages]);

  // Quick actions
  const fixAllGrammar = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (plainText.length < 10) return;

    setIsLoading(true);
    try {
      const result = await callAI('rewrite', {
        text: plainText,
        mode: 'fix-grammar',
        context: plainText.slice(0, 2000),
      });

      // Replace entire document content
      editor.chain().focus().setContent(`<p>${result.text}</p>`).run();
    } catch (err) {
      console.error('Fix grammar failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor]);

  const generateTOC = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();

    setIsLoading(true);
    try {
      const result = await callAI('toc', {content: html});
      if (result.html) {
        // Insert TOC at the beginning of the document
        editor.chain().focus().insertContentAt(0, result.html).run();
      }
    } catch (err) {
      console.error('Generate TOC failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor]);

  return {
    messages,
    isOpen,
    setIsOpen,
    isLoading,
    documentHealth,
    suggestions,
    askQuestion,
    fixAllGrammar,
    generateTOC,
    clearMessages: () => setMessages([]),
  };
}
