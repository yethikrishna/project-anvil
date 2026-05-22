'use client';

/**
 * AI Content Expander & Compressor — Anvil Docs
 *
 * Two complementary tools:
 *
 * EXPANDER: Takes selected bullet points or short notes and expands them
 * into full paragraphs with context, examples, and detail.
 *
 * COMPRESSOR: Takes long, bloated paragraphs and condenses them to
 * the essential point — removes filler, merges redundant sentences.
 *
 * Works on selection or entire document.
 * Inline floating UI — appears near the selection.
 */

import {useState, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

type TransformMode = 'expand' | 'compress' | 'bullets-to-prose' | 'prose-to-bullets';

interface TransformConfig {
  icon: string;
  label: string;
  description: string;
  prompt: string;
  minLength: number;    // minimum text length to enable
  maxLength: number;    // maximum text length to allow
}

// ── Transform configs ──

const TRANSFORMS: Record<TransformMode, TransformConfig> = {
  'expand': {
    icon: '📝',
    label: 'Expand',
    description: 'Expand into full paragraphs with detail and context',
    prompt: 'Expand these notes/bullets into well-written, detailed paragraphs. Add context, examples, and transitions. Keep the same meaning but add depth.',
    minLength: 10,
    maxLength: 2000,
  },
  'compress': {
    icon: '🗜️',
    label: 'Compress',
    description: 'Condense to essential points — remove filler and redundancy',
    prompt: 'Compress this text to its essential meaning. Remove filler words, redundant phrases, and unnecessary repetition. Keep every important point but make it concise.',
    minLength: 100,
    maxLength: 10000,
  },
  'bullets-to-prose': {
    icon: '📖',
    label: 'To Prose',
    description: 'Convert bullet points to flowing paragraphs',
    prompt: 'Convert these bullet points into smooth, flowing paragraphs with natural transitions. Make it read like professional writing, not a list.',
    minLength: 20,
    maxLength: 3000,
  },
  'prose-to-bullets': {
    icon: '•',
    label: 'To Bullets',
    description: 'Convert prose to clean bullet points',
    prompt: 'Convert this text into clear, concise bullet points. Each bullet should capture one key idea. Use action-oriented language.',
    minLength: 50,
    maxLength: 5000,
  },
};

// ── AI call ──

async function transformText(text: string, mode: TransformMode): Promise<string> {
  const config = TRANSFORMS[mode];
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'rewrite',
      payload: {
        text,
        instruction: config.prompt,
        mode,
      },
    }),
  });

  if (!resp.ok) throw new Error('Transform failed');
  const data = await resp.json() as {result?: string; text?: string};
  return data.result || data.text || text;
}

// ── Component ──

interface ContentTransformerProps {
  editor: Editor;
  onClose: () => void;
}

export function ContentTransformer({editor, onClose}: ContentTransformerProps) {
  const [mode, setMode] = useState<TransformMode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const selection = editor.state.selection;
  const selectedText = selection.empty
    ? ''
    : editor.state.doc.textBetween(selection.from, selection.to, '\n');
  const workingText = selectedText.length > 20 ? selectedText : editor.getText();
  const isSelection = selectedText.length > 20;

  const handleTransform = useCallback(async (selectedMode: TransformMode) => {
    setMode(selectedMode);
    setIsLoading(true);
    setPreview(null);

    try {
      const result = await transformText(workingText, selectedMode);
      setPreview(result);
    } catch {
      setPreview('Error — please try again');
    }
    setIsLoading(false);
  }, [workingText]);

  const handleApply = useCallback(() => {
    if (!preview) return;

    if (isSelection && !selection.empty) {
      editor.commands.insertContentAt(
        {from: selection.from, to: selection.to},
        preview,
      );
    } else {
      editor.commands.setContent(preview);
    }
    setApplied(true);
    setTimeout(onClose, 600);
  }, [editor, preview, isSelection, selection, onClose]);

  const wordCount = workingText.split(/\s+/).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-900">✨ Transform Content</span>
          {isSelection && (
            <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">{wordCount} words selected</span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Transform options */}
        {!preview && (
          <div className="p-5">
            <div className="text-xs text-gray-500 mb-3">
              {isSelection ? 'Transform selected text:' : 'Transform entire document:'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(TRANSFORMS) as [TransformMode, TransformConfig][]).map(([tm, config]) => {
                const enabled = wordCount >= config.minLength && wordCount <= config.maxLength;
                return (
                  <button
                    key={tm}
                    onClick={() => enabled && handleTransform(tm)}
                    disabled={!enabled || isLoading}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      mode === tm && isLoading
                        ? 'border-blue-300 bg-blue-50'
                        : enabled
                          ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                          : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <div className="text-2xl mb-1">{config.icon}</div>
                    <div className="text-sm font-semibold text-gray-900">{config.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{config.description}</div>
                    {mode === tm && isLoading && (
                      <div className="text-xs text-blue-500 mt-1 animate-pulse">Transforming...</div>
                    )}
                    {!enabled && (
                      <div className="text-[10px] text-gray-400 mt-1">
                        {wordCount < config.minLength ? `Need ${config.minLength}+ words` : `Max ${config.maxLength} words`}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <span className="text-xs font-medium text-gray-700">
                {mode && `${TRANSFORMS[mode].icon} ${TRANSFORMS[mode].label} preview`}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => { setPreview(null); setMode(null); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Try another
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-2">Original</div>
                  <div className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2">
                    {workingText.slice(0, 500)}{workingText.length > 500 ? '...' : ''}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{wordCount} words</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-blue-400 uppercase mb-2">Transformed</div>
                  <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-blue-100 rounded-lg p-2 bg-blue-50">
                    {preview}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {preview.split(/\s+/).filter(Boolean).length} words
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button
                onClick={() => handleTransform(mode!)}
                className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Regenerate
              </button>
              <button
                onClick={handleApply}
                className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  applied
                    ? 'bg-green-500 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {applied ? '✓ Applied!' : `Apply${isSelection ? ' to Selection' : ' to Document'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
