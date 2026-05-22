'use client';

/**
 * AI Compose with Style Matching
 *
 * Enhanced email compose that:
 * - Learns from the user's sent emails
 * - Matches tone, formality, and structure to context
 * - Provides real-time style suggestions
 * - Thread-aware: adapts based on conversation history
 * - Tone selector: Professional, Friendly, Casual, Direct
 * - Length control: Brief, Medium, Detailed
 */

import {useState, useCallback, useMemo, useEffect} from 'react';
import {useEditor, EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  analyzeWritingStyle,
  getStyleHints,
  buildComposePrompt,
  type WritingStyleProfile,
} from '../lib/writing-style-analyzer';
import type {MailMessage} from '../lib/ai-mail';

// ── Types ──

export type ComposeTone = 'professional' | 'friendly' | 'casual' | 'direct' | 'empathetic';
export type ComposeLength = 'brief' | 'medium' | 'detailed';

export interface ComposeContext {
  threadMessages?: MailMessage[];
  to?: {name: string; email: string};
  subject?: string;
  isReply?: boolean;
  isForward?: boolean;
  forwardedMessage?: MailMessage;
}

export interface StyleSuggestion {
  type: 'tone' | 'length' | 'greeting' | 'closing' | 'structure';
  message: string;
  currentValue?: string;
  suggestedValue?: string;
}

// ── Component ──

interface AIComposeWithStyleProps {
  context: ComposeContext;
  onSend: (html: string, subject: string, to: string) => void;
  onDiscard: () => void;
  sentEmails?: MailMessage[]; // For style learning
}

export function AIComposeWithStyle({
  context,
  onSend,
  onDiscard,
  sentEmails = [],
}: AIComposeWithStyleProps) {
  const [tone, setTone] = useState<ComposeTone>('professional');
  const [length, setLength] = useState<ComposeLength>('medium');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showStyleHints, setShowStyleHints] = useState(false);
  const [subject, setSubject] = useState(context.subject || '');
  const [recipient, setRecipient] = useState(context.to?.email || '');

  // Analyze writing style from sent emails
  const styleProfile = useMemo(() => {
    if (sentEmails.length === 0) return null;
    return analyzeWritingStyle(sentEmails);
  }, [sentEmails]);

  const styleHints = useMemo(() => {
    if (!styleProfile) return [];
    const hints = getStyleHints(styleProfile);
    const notes: string[] = [];
    if (hints.tone) notes.push(`Tone: ${hints.tone}`);
    if (hints.greeting) notes.push(`Greeting: ${hints.greeting}`);
    if (hints.signOff) notes.push(`Sign-off: ${hints.signOff}`);
    if (hints.avgLength) notes.push(`Length: ${hints.avgLength}`);
    return [...notes, ...hints.notes];
  }, [styleProfile]);

  // Thread context
  const threadContext = useMemo(() => {
    if (!context.threadMessages?.length) return '';
    return context.threadMessages
      .slice(-5) // Last 5 messages
      .map(m => `${m.from.name}: ${m.body.slice(0, 300)}`)
      .join('\n---\n');
  }, [context.threadMessages]);

  // Build compose prompt
  const composePrompt = useMemo(() => {
    if (!styleProfile) return '';
    return buildComposePrompt(
      styleProfile,
      threadContext,
      context.isReply ? 'reply' : 'new'
    );
  }, [threadContext, styleProfile, context.isReply]);

  // Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: context.isReply
          ? 'Write your reply...'
          : 'Start typing or press ✨ AI Compose to generate...',
      }),
    ],
    content: '',
  });

  // Generate initial draft
  const handleAICompose = useCallback(async () => {
    if (!editor) return;
    setIsGenerating(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose-email',
          payload: composePrompt,
        }),
      });
      if (!resp.ok) throw new Error('Compose failed');
      const data = await resp.json();
      editor.commands.setContent(data.html || data.text || '');

      // Auto-fill subject if empty and reply
      if (!subject && data.suggestedSubject) {
        setSubject(data.suggestedSubject);
      }
    } catch (err) {
      console.error('AI compose failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [editor, composePrompt, subject]);

  // Improve current draft
  const handleImprove = useCallback(async () => {
    if (!editor) return;
    const currentContent = editor.getHTML();
    if (!currentContent || currentContent === '<p></p>') return;

    setIsGenerating(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'improve-email',
          payload: {
            html: currentContent,
            tone,
            styleProfile,
            threadContext,
          },
        }),
      });
      if (!resp.ok) throw new Error('Improve failed');
      const data = await resp.json();
      editor.commands.setContent(data.html || currentContent);
    } catch (err) {
      console.error('AI improve failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [editor, tone, styleProfile, threadContext]);

  // Get real-time style suggestions
  const styleSuggestions = useMemo((): StyleSuggestion[] => {
    if (!editor) return [];
    const text = editor.state.doc.textContent;
    if (text.length < 20) return [];

    const suggestions: StyleSuggestion[] = [];

    // Check greeting
    const hasGreeting = /^(hi|hey|dear|hello|good morning|good afternoon|greetings)/i.test(text);
    if (!hasGreeting && context.isReply) {
      suggestions.push({
        type: 'greeting',
        message: 'Add a greeting to match professional email norms',
        suggestedValue: `Hi ${context.to?.name || 'there'},`,
      });
    }

    // Check closing
    const hasClosing = /(regards|best|sincerely|cheers|thanks|warmly|best regards)/i.test(text);
    if (!hasClosing) {
      suggestions.push({
        type: 'closing',
        message: 'Add a closing',
        suggestedValue: tone === 'professional' ? 'Best regards,' : 'Thanks,',
      });
    }

    // Check length
    const wordCount = text.split(/\s+/).length;
    if (length === 'brief' && wordCount > 150) {
      suggestions.push({
        type: 'length',
        message: `Draft is ${wordCount} words. Consider being more concise for a brief email.`,
      });
    } else if (length === 'detailed' && wordCount < 100) {
      suggestions.push({
        type: 'length',
        message: `Only ${wordCount} words. Consider adding more detail.`,
      });
    }

    // Check tone match
    const formalIndicators = /(please find|kindly|would you|may I|regarding|pursuant)/i;
    const casualIndicators = /(lol|btw|gonna|wanna|cool|awesome|super)/i;
    if (tone === 'professional' && casualIndicators.test(text)) {
      suggestions.push({
        type: 'tone',
        message: 'Some casual language detected. Consider more professional alternatives.',
      });
    } else if (tone === 'casual' && formalIndicators.test(text)) {
      suggestions.push({
        type: 'tone',
        message: 'Tone seems formal. Consider more casual language.',
      });
    }

    return suggestions;
  }, [editor, tone, length, context]);

  const handleSend = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    onSend(html, subject, recipient);
  }, [editor, subject, recipient, onSend]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">
          {context.isReply ? 'Reply' : context.isForward ? 'Forward' : 'New Email'}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowStyleHints(!showStyleHints)}
            className={`px-2 py-1 text-xs rounded ${showStyleHints ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Style hints"
          >
            💡
          </button>
          <button onClick={onDiscard} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
      </div>

      {/* Recipient & Subject */}
      <div className="px-4 py-2 border-b border-gray-100 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-12">To:</span>
          <input
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            className="flex-1 text-sm outline-none"
            placeholder="recipient@example.com"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-12">Subject:</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="flex-1 text-sm outline-none"
            placeholder="Email subject"
          />
        </div>
      </div>

      {/* Tone & Length Controls */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Tone:</span>
          {(['professional', 'friendly', 'casual', 'direct', 'empathetic'] as ComposeTone[]).map(t => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-1.5 py-0.5 text-[10px] rounded-full transition-colors ${
                tone === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Length:</span>
          {(['brief', 'medium', 'detailed'] as ComposeLength[]).map(l => (
            <button
              key={l}
              onClick={() => setLength(l)}
              className={`px-1.5 py-0.5 text-[10px] rounded-full transition-colors ${
                length === l ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {styleProfile && (
          <span className="text-[10px] text-purple-500">✨ Style matched</span>
        )}
      </div>

      {/* Thread Context Preview */}
      {threadContext && (
        <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
          <details className="text-[10px] text-gray-400">
            <summary className="cursor-pointer hover:text-gray-600">
              Thread context ({context.threadMessages?.length || 0} messages)
            </summary>
            <pre className="mt-1 text-[9px] max-h-20 overflow-auto whitespace-pre-wrap">{threadContext}</pre>
          </details>
        </div>
      )}

      {/* Style Hints Panel */}
      {showStyleHints && (styleHints.length > 0 || styleSuggestions.length > 0) && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100">
          <div className="space-y-1">
            {styleHints.map((hint, i) => (
              <div key={i} className="text-[10px] text-purple-700">
                💡 {hint}
              </div>
            ))}
            {styleSuggestions.map((sug, i) => (
              <div key={`sug-${i}`} className="text-[10px] text-purple-700">
                {sug.type === 'tone' ? '🎭' : sug.type === 'greeting' ? '👋' : sug.type === 'closing' ? '✍️' : '📏'} {sug.message}
                {sug.suggestedValue && (
                  <button className="ml-1 text-purple-500 underline">Insert</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {editor && <EditorContent editor={editor} />}
      </div>

      {/* Action Bar */}
      <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleAICompose}
            disabled={isGenerating}
            className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
          >
            {isGenerating ? '⏳ Generating...' : '✨ AI Compose'}
          </button>
          <button
            onClick={handleImprove}
            disabled={isGenerating}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            ✨ Improve
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onDiscard} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
            Discard
          </button>
          <button
            onClick={handleSend}
            disabled={!recipient || !editor?.state.doc.textContent.trim()}
            className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
