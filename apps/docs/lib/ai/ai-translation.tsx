'use client';

/**
 * AI Translation Component for Anvil Docs
 *
 * Adds a translation toolbar button and dropdown to the editor.
 * Translates selected text or entire document with streaming output.
 * Supports 30+ languages with auto-detection.
 */

import {useState, useCallback, useRef} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

interface TranslationLanguage {
  code: string;
  name: string;
  flag: string;
}

// ── Supported Languages ──

const LANGUAGES: TranslationLanguage[] = [
  {code: 'es', name: 'Spanish', flag: '🇪🇸'},
  {code: 'fr', name: 'French', flag: '🇫🇷'},
  {code: 'de', name: 'German', flag: '🇩🇪'},
  {code: 'it', name: 'Italian', flag: '🇮🇹'},
  {code: 'pt', name: 'Portuguese', flag: '🇧🇷'},
  {code: 'zh', name: 'Chinese', flag: '🇨🇳'},
  {code: 'ja', name: 'Japanese', flag: '🇯🇵'},
  {code: 'ko', name: 'Korean', flag: '🇰🇷'},
  {code: 'ar', name: 'Arabic', flag: '🇸🇦'},
  {code: 'hi', name: 'Hindi', flag: '🇮🇳'},
  {code: 'ru', name: 'Russian', flag: '🇷🇺'},
  {code: 'nl', name: 'Dutch', flag: '🇳🇱'},
  {code: 'pl', name: 'Polish', flag: '🇵🇱'},
  {code: 'tr', name: 'Turkish', flag: '🇹🇷'},
  {code: 'vi', name: 'Vietnamese', flag: '🇻🇳'},
  {code: 'th', name: 'Thai', flag: '🇹🇭'},
  {code: 'sv', name: 'Swedish', flag: '🇸🇪'},
  {code: 'da', name: 'Danish', flag: '🇩🇰'},
  {code: 'fi', name: 'Finnish', flag: '🇫🇮'},
  {code: 'no', name: 'Norwegian', flag: '🇳🇴'},
  {code: 'el', name: 'Greek', flag: '🇬🇷'},
  {code: 'cs', name: 'Czech', flag: '🇨🇿'},
  {code: 'ro', name: 'Romanian', flag: '🇷🇴'},
  {code: 'hu', name: 'Hungarian', flag: '🇭🇺'},
  {code: 'id', name: 'Indonesian', flag: '🇮🇩'},
  {code: 'ms', name: 'Malay', flag: '🇲🇾'},
  {code: 'uk', name: 'Ukrainian', flag: '🇺🇦'},
  {code: 'he', name: 'Hebrew', flag: '🇮🇱'},
  {code: 'bn', name: 'Bengali', flag: '🇧🇩'},
  {code: 'en', name: 'English', flag: '🇬🇧'},
];

// ── Component ──

interface AITranslationDropdownProps {
  editor: Editor | null;
  onClose: () => void;
}

export function AITranslationDropdown({editor, onClose}: AITranslationDropdownProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const filteredLanguages = LANGUAGES.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleTranslate = useCallback(async (targetLang: TranslationLanguage) => {
    if (!editor) return;

    setIsTranslating(true);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const {from, to} = editor.state.selection;
      const hasSelection = from !== to;
      const text = hasSelection
        ? editor.state.doc.textBetween(from, to, '\n')
        : editor.getHTML();

      // Use streaming for real-time feedback
      const resp = await fetch('/api/ai/streaming', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'translate',
          payload: {
            text,
            targetLanguage: targetLang.name,
            preserveFormatting: !hasSelection,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) throw new Error('Translation failed');

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let translatedText = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, {stream: true});
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              translatedText += data.text;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }

      // Apply translation
      if (hasSelection) {
        editor.chain().focus().insertContentAt({from, to}, translatedText).run();
      } else {
        editor.commands.setContent(translatedText);
      }

      onClose();
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsTranslating(false);
      abortRef.current = null;
    }
  }, [editor, onClose]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsTranslating(false);
  }, []);

  return (
    <div
      ref={dropdownRef}
      className="ai-translation-dropdown absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search language..."
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          autoFocus
        />
      </div>

      {/* Language list */}
      <div className="max-h-64 overflow-y-auto">
        {filteredLanguages.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleTranslate(lang)}
            disabled={isTranslating}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 transition-colors"
          >
            <span className="text-lg">{lang.flag}</span>
            <span className="font-medium">{lang.name}</span>
            <span className="text-xs text-gray-400 ml-auto">{lang.code.toUpperCase()}</span>
          </button>
        ))}
        {filteredLanguages.length === 0 && (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">No languages found</div>
        )}
      </div>

      {/* Status */}
      {isTranslating && (
        <div className="p-2 border-t border-gray-100 bg-indigo-50 flex items-center justify-between">
          <span className="text-xs text-indigo-600 animate-pulse">Translating...</span>
          <button
            onClick={handleCancel}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="p-2 border-t border-red-100 bg-red-50">
          <span className="text-xs text-red-600">{error}</span>
        </div>
      )}
    </div>
  );
}

// ── Hook for translation in toolbar ──

export function useAITranslation(editor: Editor | null) {
  const [showDropdown, setShowDropdown] = useState(false);

  const translate = useCallback((targetLanguage: string) => {
    if (!editor) return;

    const {from, to} = editor.state.selection;
    const hasSelection = from !== to;
    const text = hasSelection
      ? editor.state.doc.textBetween(from, to, '\n')
      : editor.getHTML();

    return fetch('/api/ai', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'translate',
        payload: {text, targetLanguage, preserveFormatting: !hasSelection},
      }),
    }).then(r => r.json());
  }, [editor]);

  return {showDropdown, setShowDropdown, translate};
}
