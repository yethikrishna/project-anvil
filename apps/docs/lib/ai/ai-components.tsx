'use client';

import {useState, useCallback} from 'react';
import type {Editor} from '@tiptap/react';

// ── AI Rewrite Toolbar ──

interface AIRewriteToolbarProps {
  editor: Editor;
  onClose: () => void;
}

const REWRITE_MODES = [
  {mode: 'shorter', label: 'Shorter', icon: '↓', desc: 'More concise'},
  {mode: 'formal', label: 'Formal', icon: '👔', desc: 'Professional tone'},
  {mode: 'casual', label: 'Casual', icon: '😊', desc: 'Relaxed tone'},
  {mode: 'fix-grammar', label: 'Fix Grammar', icon: '✓', desc: 'Fix errors'},
  {mode: 'longer', label: 'Expand', icon: '↑', desc: 'More detail'},
  {mode: 'bullet-points', label: 'Bullets', icon: '•', desc: 'Convert to list'},
] as const;

export function AIRewriteToolbar({editor, onClose}: AIRewriteToolbarProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRewrite = useCallback(async (mode: string) => {
    setIsProcessing(true);
    try {
      await (editor.commands as any).aiRewrite(mode);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  }, [editor, onClose]);

  return (
    <div className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[200px]"
         style={{top: '100%', left: 0}}>
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-xs font-semibold text-gray-700">AI Rewrite</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="space-y-0.5">
        {REWRITE_MODES.map(({mode, label, icon, desc}) => (
          <button
            key={mode}
            disabled={isProcessing}
            onClick={() => handleRewrite(mode)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded disabled:opacity-50 transition-colors"
          >
            <span className="text-sm w-5 text-center">{icon}</span>
            <div>
              <div className="font-medium text-xs">{label}</div>
              <div className="text-[10px] text-gray-400">{desc}</div>
            </div>
          </button>
        ))}
      </div>
      {isProcessing && (
        <div className="px-2 py-1 text-xs text-blue-600 animate-pulse">Processing...</div>
      )}
    </div>
  );
}

// ── AI Command Panel (for /ai commands) ──

interface AICommandPanelProps {
  editor: Editor;
  onClose: () => void;
}

const LANGUAGES = [
  'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Japanese', 'Korean', 'Chinese', 'Hindi', 'Arabic',
  'Russian', 'Dutch', 'Swedish', 'Turkish', 'Polish',
];

export function AICommandPanel({editor, onClose}: AICommandPanelProps) {
  const [activeTab, setActiveTab] = useState<'draft' | 'research' | 'translate' | 'template'>('draft');
  const [input, setInput] = useState('');
  const [docType, setDocType] = useState('general');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [templateType, setTemplateType] = useState('proposal');
  const [isLoading, setIsLoading] = useState(false);

  const handleDraft = useCallback(async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    try {
      await (editor.commands as any).aiDraft(input, docType);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, input, docType, onClose]);

  const handleResearch = useCallback(async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    try {
      await (editor.commands as any).aiResearch(input);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, input, onClose]);

  const handleTranslate = useCallback(async () => {
    setIsLoading(true);
    try {
      await (editor.commands as any).aiTranslate(targetLang);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, targetLang, onClose]);

  const handleTemplate = useCallback(async () => {
    setIsLoading(true);
    try {
      const title = await (editor.commands as any).aiGenerateTemplate(templateType, input || undefined);
      if (title) {
        // Update document title
        const titleInput = document.querySelector<HTMLInputElement>('input[value]');
        if (titleInput) {
          // Trigger title update via native input event
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          nativeInputValueSetter?.call(titleInput, title);
          titleInput.dispatchEvent(new Event('input', {bubbles: true}));
        }
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, templateType, input, onClose]);

  const tabs = [
    {id: 'draft', label: '✍️ Draft', key: '1' as const},
    {id: 'research', label: '🔍 Research', key: '2' as const},
    {id: 'translate', label: '🌐 Translate', key: '3' as const},
    {id: 'template', label: '📋 Template', key: '4' as const},
  ];

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[520px] max-h-[400px] flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto">
          {activeTab === 'draft' && (
            <>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Describe what you want to write...&#10;&#10;e.g., 'A project update email to stakeholders about the Q3 roadmap delays'"
                className="w-full h-28 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500">Type:</span>
                {['general', 'email', 'report', 'proposal', 'blog'].map(t => (
                  <button
                    key={t}
                    onClick={() => setDocType(t)}
                    className={`px-2 py-0.5 rounded text-xs ${
                      docType === t ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          {activeTab === 'research' && (
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="What do you want to research?&#10;&#10;e.g., 'Best practices for microservices architecture' or 'Market analysis for SaaS pricing models'"
              className="w-full h-40 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          )}

          {activeTab === 'translate' && (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Translate selected text into:
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang}
                    onClick={() => setTargetLang(lang)}
                    className={`px-2 py-1.5 rounded text-xs text-left transition-colors ${
                      targetLang === lang
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Select text in the editor first, then click Translate.
              </p>
            </div>
          )}

          {activeTab === 'template' && (
            <div>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {[
                  {id: 'proposal', label: '📋 Proposal'},
                  {id: 'meeting-notes', label: '📝 Meeting Notes'},
                  {id: 'report', label: '📊 Report'},
                  {id: 'memo', label: '📨 Memo'},
                  {id: 'blog-post', label: '✍️ Blog Post'},
                  {id: 'letter', label: '✉️ Letter'},
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateType(t.id)}
                    className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      templateType === t.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Any specific requirements? (optional)&#10;&#10;e.g., 'For a fintech startup, Series A pitch'"
                className="w-full h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <span className="text-xs text-gray-400">
            {activeTab === 'translate' ? 'Select text in editor first' : `AI will ${activeTab === 'draft' ? 'write' : activeTab === 'research' ? 'research' : 'generate'} content`}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
              Cancel
            </button>
            <button
              disabled={isLoading || (activeTab !== 'translate' && !input.trim())}
              onClick={() => {
                switch (activeTab) {
                  case 'draft': handleDraft(); break;
                  case 'research': handleResearch(); break;
                  case 'translate': handleTranslate(); break;
                  case 'template': handleTemplate(); break;
                }
              }}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {isLoading ? 'Generating...' : activeTab === 'translate' ? 'Translate' : activeTab === 'research' ? 'Research' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Suggestion Accept/Reject Bar ──

interface AISuggestionBarProps {
  visible: boolean;
  onAccept: () => void;
  onReject: () => void;
  suggestionText?: string;
}

export function AISuggestionBar({visible, onAccept, onReject, suggestionText}: AISuggestionBarProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-xl text-sm">
      <span className="text-gray-300 text-xs">AI Suggestion:</span>
      {suggestionText && (
        <span className="text-gray-200 italic max-w-[200px] truncate">{suggestionText}</span>
      )}
      <button
        onClick={onAccept}
        className="px-2 py-0.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
      >
        Accept ↵
      </button>
      <button
        onClick={onReject}
        className="px-2 py-0.5 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
      >
        Reject ⎋
      </button>
    </div>
  );
}
