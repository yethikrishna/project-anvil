'use client';

import {useEditor, EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Image from '@tiptap/extension-image';
import CharacterCount from '@tiptap/extension-character-count';
import * as Y from 'yjs';
import {HocuspocusProvider} from '@hocuspocus/provider';
import {useState, useEffect, useCallback, use, useRef} from 'react';
import {useAuth} from '@anvil/auth';
import {AnalyticsPanel} from './AnalyticsPanel';
import {AIRewrite, AIShortcuts} from '../../../lib/ai/tiptap-extensions';
import {AISlashCommands} from '../../../lib/ai/ai-slash-commands';
import {AIRewriteToolbar, AICommandPanel, AISuggestionBar} from '../../../lib/ai/ai-components';
import {useAutoTitleSummary} from '../../../lib/ai/use-auto-title';
import {AIAssistantPanel} from '../../../lib/ai/ai-assistant-panel';
import {AIQuickActions} from '../../../lib/ai/ai-quick-actions';
import {AIGrammarChecker} from '../../../lib/ai/grammar-checker';
import {AIAutocorrect} from '../../../lib/ai/ai-autocorrect';
import {AIWritingCoach} from '../../../lib/ai/writing-coach';
import {OutlineSidebar} from '../../../lib/ai/outline-sidebar';
import {DocumentHealthDashboard} from '../../../lib/ai/document-health-dashboard';
import {AITranslationDropdown} from '../../../lib/ai/ai-translation';
import {SmartTemplateBrowser} from '../../../lib/ai/smart-template-browser';
import {AIContextMenu, useAIContextMenu} from '../../../lib/ai/ai-context-menu';
import {AIFloatingToolbar} from '../../../lib/ai/ai-floating-toolbar';
import {useWritingScore, WritingScoreBadge, WritingScorePanel} from '../../../lib/ai/writing-score';
import {AIFindReplace} from '../../../lib/ai/ai-find-replace';
import {DocumentComparisonPanel} from '../../../lib/ai/document-comparison';
import {AIFocusMode} from '../../../lib/ai/ai-focus-mode';
import {ToneAnalyzerPanel} from '../../../lib/ai/tone-analyzer';
import {ReadingMetricsBadge, ReadingMetricsPanel} from '../../../lib/ai/reading-metrics';
import {AIOutlineBuilder} from '../../../lib/ai/ai-outline-builder';
import {WordChoicePanel} from '../../../lib/ai/word-choice-suggester';
import {ContentTransformer} from '../../../lib/ai/content-transformer';
import {HeadingSuggestionsPanel} from '../../../lib/ai/heading-suggestions';
import {ContentBriefGenerator} from '../../../lib/ai/content-brief-generator';
import {AIErrorBoundary} from '@anvil/ui';
import '../../../ai-styles.css';

// ── Toolbar ──

function Toolbar({editor, docId, onShowAICommands, onShowAIRewrite, showAIRewrite}: {
  editor: ReturnType<typeof useEditor>;
  docId: string;
  onShowAICommands: () => void;
  onShowAIRewrite: () => void;
  showAIRewrite: boolean;
}) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `px-2 py-1 rounded text-sm transition-colors ${
      active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
    }`;

  const handleExport = async (format: 'pdf' | 'docx') => {
    try {
      const resp = await fetch(`/api/documents/${docId}/export/${format}`);
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = resp.headers.get('content-disposition') ?? '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch ? filenameMatch[1] : `document.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-1 flex-wrap sticky top-0 z-10">
      {/* Text formatting */}
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))} title="Bold"><strong>B</strong></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))} title="Italic"><em>I</em></button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive('underline'))} title="Underline"><u>U</u></button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive('strike'))} title="Strikethrough"><s>S</s></button>
      <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={btnClass(editor.isActive('highlight'))} title="Highlight">🖍️</button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Headings */}
      <button onClick={() => editor.chain().focus().toggleHeading({level: 1}).run()} className={btnClass(editor.isActive('heading', {level: 1}))} title="Heading 1">H1</button>
      <button onClick={() => editor.chain().focus().toggleHeading({level: 2}).run()} className={btnClass(editor.isActive('heading', {level: 2}))} title="Heading 2">H2</button>
      <button onClick={() => editor.chain().focus().toggleHeading({level: 3}).run()} className={btnClass(editor.isActive('heading', {level: 3}))} title="Heading 3">H3</button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Lists */}
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))} title="Bullet List">• List</button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))} title="Numbered List">1. List</button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))} title="Blockquote">❝ Quote</button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive('codeBlock'))} title="Code Block">{'</>'}</button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Text align */}
      <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editor.isActive({textAlign: 'left'}))} title="Align Left">☰</button>
      <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editor.isActive({textAlign: 'center'}))} title="Align Center">☰≡</button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Undo/Redo */}
      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="Undo">↩ Undo</button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="Redo">↪ Redo</button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* AI Tools */}
      <div className="relative">
        <button
          onClick={onShowAIRewrite}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            showAIRewrite ? 'bg-purple-100 text-purple-700' : 'text-purple-600 hover:bg-purple-50'
          }`}
          title="AI Rewrite (select text first)"
        >
          ✨ AI Rewrite
        </button>
        {showAIRewrite && <AIRewriteToolbar editor={editor} onClose={() => onShowAIRewrite()} />}
      </div>

      <button
        onClick={onShowAICommands}
        className="px-2 py-1 rounded text-sm text-purple-600 hover:bg-purple-50 transition-colors"
        title="/ai commands"
      >
        🤖 AI Commands
      </button>

      <div className="flex-1" />

      {/* Export */}
      <button onClick={() => handleExport('pdf')} className="px-2 py-1 rounded text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1" title="Export as PDF">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        PDF
      </button>
      <button onClick={() => handleExport('docx')} className="px-2 py-1 rounded text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1" title="Export as DOCX">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        DOCX
      </button>
    </div>
  );
}

// ── Presence indicator ──

function PresenceIndicator({provider}: {provider: HocuspocusProvider | null}) {
  const [users, setUsers] = useState<{name: string; color: string}[]>([]);

  useEffect(() => {
    if (!provider) return;
    const awareness = provider.awareness;
    const updateUsers = () => {
      const states = awareness.getStates();
      const userList: {name: string; color: string}[] = [];
      states.forEach((state) => { if (state.user) userList.push({name: state.user.name, color: state.user.color}); });
      setUsers(userList);
    };
    awareness.on('change', updateUsers);
    updateUsers();
    return () => { awareness.off('change', updateUsers); };
  }, [provider]);

  if (users.length <= 1) return null;
  return (
    <div className="flex items-center gap-1 px-3">
      {users.map((user, i) => (
        <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-medium" style={{backgroundColor: user.color, marginLeft: i > 0 ? '-4px' : '0'}} title={user.name}>
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      <span className="text-xs text-gray-500 ml-1">{users.length} online</span>
    </div>
  );
}

// ── Editor Page ──

interface EditorPageProps {
  params: Promise<{id: string}>;
}

export default function EditorPage({params}: EditorPageProps) {
  const {id: paramsId} = use(params);
  const {user, isAuthenticated} = useAuth();
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [docTitle, setDocTitle] = useState('Loading...');
  const [docSummary, setDocSummary] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showAIRewrite, setShowAIRewrite] = useState(false);
  const [showAICommands, setShowAICommands] = useState(false);
  const [hasSuggestion, setHasSuggestion] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [showHealth, setShowHealth] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [showWritingScore, setShowWritingScore] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [showToneAnalyzer, setShowToneAnalyzer] = useState(false);
  const [showReadingMetrics, setShowReadingMetrics] = useState(false);
  const [showOutlineBuilder, setShowOutlineBuilder] = useState(false);
  const [showWordChoice, setShowWordChoice] = useState(false);
  const [showTransformer, setShowTransformer] = useState(false);
  const [showHeadingSuggestions, setShowHeadingSuggestions] = useState(false);
  const [showBriefGenerator, setShowBriefGenerator] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch document metadata
  useEffect(() => {
    fetch(`/api/documents/${paramsId}`)
      .then(r => r.json())
      .then(data => {
        setDocTitle(data.title ?? 'Untitled');
        if (data.summary) setDocSummary(data.summary);
      })
      .catch(() => setDocTitle('Untitled'));
  }, [paramsId]);

  // Report join/leave to analytics
  useEffect(() => {
    if (!user?.sub) return;
    fetch('/api/analytics/join', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({documentId: paramsId, userId: user.sub, userName: user.name ?? 'Anonymous', color: COLORS[Math.floor(Math.random() * COLORS.length)]}),
    }).catch(() => {});
    return () => {
      fetch('/api/analytics/leave', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({documentId: paramsId, userId: user.sub}),
      }).catch(() => {});
    };
  }, [paramsId, user?.sub]);

  // Create Yjs document + Hocuspocus provider
  useEffect(() => {
    const ydoc = new Y.Doc();
    const hocuspocusProvider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? 'ws://localhost:3102/hocuspocus',
      name: `doc-${paramsId}`,
      document: ydoc,
      onAuthenticated() { console.log('Connected to Hocuspocus'); },
      onAuthenticationFailed({reason}) { console.error('Auth failed:', reason); },
    });
    hocuspocusProvider.awareness.setLocalStateField('user', {
      name: user?.name ?? 'Anonymous',
      color: getRandomColor(),
    });
    setProvider(hocuspocusProvider);
    return () => { hocuspocusProvider.destroy(); ydoc.destroy(); };
  }, [paramsId, user?.name]);

  // Auto-save with AI title/summary generation
  const saveDocument = useCallback(async (html: string) => {
    setIsSaving(true);
    try {
      await fetch(`/api/documents/${paramsId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({content: html}),
      });
      // Dispatch save event for auto-title hook
      window.dispatchEvent(new CustomEvent('anvil:doc-saved'));
    } finally {
      setIsSaving(false);
    }
  }, [paramsId]);

  // Create editor with AI extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({undoRedo: false}),
      Placeholder.configure({placeholder: 'Start writing... or use /ai commands'}),
      Underline,
      TextAlign.configure({types: ['heading', 'paragraph']}),
      Highlight,
      Link.configure({openOnClick: false}),
      Typography,
      Image,
      CharacterCount,
      AIRewrite,
      AIShortcuts,
      AISlashCommands,
      AIQuickActions,
      AIGrammarChecker,
      AIAutocorrect,
      AIWritingCoach,
      ...(provider ? [
        Collaboration.configure({document: provider.document}),
        CollaborationCaret.configure({provider, user: {name: user?.name ?? 'Anonymous', color: getRandomColor()}}),
      ] : []),
    ],
    shouldRerenderOnTransaction: false,
    onUpdate: ({editor}) => {
      const html = editor.getHTML();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveDocument(html), 3000);
      fetch('/api/analytics/edit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({documentId: paramsId, userId: user?.sub ?? 'anonymous'}),
      }).catch(() => {});
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none min-h-[calc(100vh-200px)]',
      },
    },
  });

  // Auto title/summary hook
  const autoTitle = useAutoTitleSummary(editor, paramsId, docTitle, (title) => {
    setDocTitle(title);
    fetch(`/api/documents/${paramsId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title}),
    }).catch(() => {});
  });

  // Writing score
  const writingScore = useWritingScore(editor ?? null);

  // AI Context Menu
  const {menuPosition: contextMenuPos, closeMenu: closeContextMenu} = useAIContextMenu(editor);

  // Handle AI command dispatch from slash menu
  useEffect(() => {
    if (!editor) return;

    const handleTransaction = ({transaction}: {transaction: any}) => {
      const meta = transaction.getMeta('ai-command');
      if (!meta) return;

      switch (meta.action) {
        case 'draft':
        case 'research':
        case 'translate':
        case 'template':
          setShowAICommands(true);
          break;
        case 'title':
          if (meta.title) {
            setDocTitle(meta.title);
            fetch(`/api/documents/${paramsId}`, {
              method: 'PATCH',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({title: meta.title}),
            }).catch(() => {});
          }
          break;
        case 'summary':
          if (meta.summary) {
            setDocSummary(meta.summary);
          }
          break;
        case 'error':
          // Could show a toast notification here
          console.warn('AI command error:', meta.message);
          break;
      }
    };

    editor.on('transaction', handleTransaction);
    return () => { editor.off('transaction', handleTransaction); };
  }, [editor, paramsId]);

  // Update title
  const handleTitleChange = async (newTitle: string) => {
    setDocTitle(newTitle);
    await fetch(`/api/documents/${paramsId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title: newTitle}),
    });
  };

  // Keyboard shortcut: Ctrl+H / Cmd+H → Find & Replace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setShowFindReplace(f => !f);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-generate summary for display
  const handleGenerateSummary = useCallback(async () => {
    if (!editor) return;
    const result = await autoTitle.generate();
    if (result) {
      setDocSummary(result.summary);
      // Save summary to document metadata
      fetch(`/api/documents/${paramsId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({summary: result.summary}),
      }).catch(() => {});
    }
  }, [editor, autoTitle, paramsId]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
        <a href="/" className="text-gray-500 hover:text-gray-700 text-sm">← Docs</a>
        <input
          type="text"
          value={docTitle}
          onChange={e => handleTitleChange(e.target.value)}
          className="text-lg font-medium text-gray-900 border-none outline-none bg-transparent flex-1"
        />
        {docSummary && (
          <span className="text-xs text-gray-400 max-w-[300px] truncate hidden lg:block" title={docSummary}>
            {docSummary}
          </span>
        )}
        <PresenceIndicator provider={provider} />
        {isSaving && <span className="text-xs text-gray-400">Saving...</span>}
        <button
          onClick={handleGenerateSummary}
          disabled={autoTitle.isGenerating}
          className="px-2 py-1 rounded text-xs text-purple-600 hover:bg-purple-50 disabled:opacity-50"
          title="AI: Generate title & summary"
        >
          {autoTitle.isGenerating ? '⏳' : '✨ Title/Summary'}
        </button>
        <button
          onClick={() => setShowAIAssistant(!showAIAssistant)}
          className={`px-2 py-1 rounded text-xs transition-colors ${showAIAssistant ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
          title="AI Document Assistant"
        >
          ✨ AI Assist
        </button>
        <button
          onClick={() => setShowHealth(!showHealth)}
          className={`px-2 py-1 rounded text-xs transition-colors ${showHealth ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Document Health"
        >
          📊 Health
        </button>
        <button
          onClick={() => setShowOutline(!showOutline)}
          className={`px-2 py-1 rounded text-xs transition-colors ${showOutline ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Document Outline"
        >
          📑 Outline
        </button>
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className={`px-2 py-1 rounded text-xs transition-colors ${showAnalytics ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Collaboration Analytics"
        >
          📊 Analytics
        </button>
        <div className="relative">
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className={`px-2 py-1 rounded text-xs transition-colors ${showTranslation ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="AI Translation"
          >
            🌐 Translate
          </button>
          {showTranslation && editor && (
            <AIErrorBoundary featureName="AI Translation">
              <AITranslationDropdown editor={editor} onClose={() => setShowTranslation(false)} />
            </AIErrorBoundary>
          )}
        </div>
        <button
          onClick={() => setShowTemplateBrowser(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Smart Templates"
        >
          📄 Templates
        </button>
        {/* Writing Score Badge */}
        <WritingScoreBadge score={writingScore} onClick={() => setShowWritingScore(s => !s)} />
        {/* Reading Metrics Badge */}
        {editor && <ReadingMetricsBadge text={editor.getText()} onClick={() => setShowReadingMetrics(r => !r)} />}
        <button
          onClick={() => setShowFindReplace(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="AI Find & Replace (Ctrl+H)"
        >
          🔍 Find
        </button>
        <button
          onClick={() => setShowComparison(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Compare Documents with AI"
        >
          📄 Compare
        </button>
        <button
          onClick={() => setShowFocusMode(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Focus Mode — distraction-free writing"
        >
          🎯 Focus
        </button>
        <button
          onClick={() => setShowToneAnalyzer(t => !t)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Tone Analyzer"
        >
          🎭 Tone
        </button>
        <button
          onClick={() => setShowOutlineBuilder(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="AI Outline Builder"
        >
          📀 Outline
        </button>
        <button
          onClick={() => setShowWordChoice(w => !w)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Word Choice Suggestions"
        >
          ✍️ Words
        </button>
        <button
          onClick={() => setShowTransformer(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Transform Content (expand/compress/bullets)"
        >
          ✨ Transform
        </button>
        <button
          onClick={() => setShowHeadingSuggestions(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Improve Headings with AI"
        >
          📌 Headings
        </button>
        <button
          onClick={() => setShowBriefGenerator(true)}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          title="Generate Content Brief before writing"
        >
          📝 Brief
        </button>
      </div>

      {/* Toolbar with AI */}
      <Toolbar
        editor={editor}
        docId={paramsId}
        onShowAICommands={() => setShowAICommands(true)}
        onShowAIRewrite={() => setShowAIRewrite(!showAIRewrite)}
        showAIRewrite={showAIRewrite}
      />

      {/* Editor + Outline */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-auto">
          <div
            ref={editorContainerRef}
            className={`relative max-w-4xl mx-auto px-8 py-6 ${showAnalytics ? 'mr-96' : ''} ${showAIAssistant ? 'mr-80' : ''}`}
          >
            {/* Floating AI Selection Toolbar */}
            {editor && (
              <AIErrorBoundary featureName="AI Floating Toolbar">
                <AIFloatingToolbar editor={editor} containerRef={editorContainerRef} />
              </AIErrorBoundary>
            )}
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Document Outline Sidebar */}
        {showOutline && editor && (
          <OutlineSidebar editor={editor} onClose={() => setShowOutline(false)} />
        )}
      </div>

      {/* AI Assistant Side Panel */}
      {showAIAssistant && editor && (
        <AIErrorBoundary featureName="AI Assistant">
          <AIAssistantPanel editor={editor} onClose={() => setShowAIAssistant(false)} />
        </AIErrorBoundary>
      )}

      {/* Analytics Side Panel */}
      <AnalyticsPanel documentId={paramsId} open={showAnalytics} onClose={() => setShowAnalytics(false)} />

      {/* Document Health Dashboard */}
      {showHealth && (
        <DocumentHealthDashboard editor={editor} onClose={() => setShowHealth(false)} />
      )}

      {/* AI Command Panel */}
      {showAICommands && editor && (
        <AIErrorBoundary featureName="AI Commands">
          <AICommandPanel editor={editor} onClose={() => setShowAICommands(false)} />
        </AIErrorBoundary>
      )}

      {/* AI Suggestion Bar */}
      <AISuggestionBar
        visible={hasSuggestion}
        suggestionText={suggestionText}
        onAccept={() => (editor?.commands as any).aiAcceptSuggestion?.()}
        onReject={() => (editor?.commands as any).aiRejectSuggestion?.()}
      />

      {/* Smart Template Browser */}
      {showTemplateBrowser && (
        <AIErrorBoundary featureName="Smart Templates">
          <SmartTemplateBrowser
            editor={editor}
            onClose={() => setShowTemplateBrowser(false)}
            onTemplateApplied={(title) => setDocTitle(title)}
          />
        </AIErrorBoundary>
      )}

      {/* AI Context Menu (right-click) */}
      <AIContextMenu
        editor={editor}
        position={contextMenuPos}
        onClose={closeContextMenu}
      />

      {/* AI Find & Replace */}
      {showFindReplace && editor && (
        <AIErrorBoundary featureName="AI Find & Replace">
          <AIFindReplace editor={editor} onClose={() => setShowFindReplace(false)} />
        </AIErrorBoundary>
      )}

      {/* Document Comparison */}
      {showComparison && editor && (
        <AIErrorBoundary featureName="Document Comparison">
          <DocumentComparisonPanel editor={editor} onClose={() => setShowComparison(false)} />
        </AIErrorBoundary>
      )}

      {/* AI Focus Mode */}
      {showFocusMode && editor && (
        <AIErrorBoundary featureName="Focus Mode">
          <AIFocusMode editor={editor} onClose={() => setShowFocusMode(false)} />
        </AIErrorBoundary>
      )}

      {/* Tone Analyzer */}
      {showToneAnalyzer && editor && (
        <AIErrorBoundary featureName="Tone Analyzer">
          <ToneAnalyzerPanel
            editor={editor}
            onClose={() => setShowToneAnalyzer(false)}
            onApplyShift={async (shiftLabel, text) => {
              await fetch('/api/ai', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  action: 'rewrite',
                  payload: {text, instruction: `Rewrite this to be ${shiftLabel.toLowerCase()}.`},
                }),
              });
            }}
          />
        </AIErrorBoundary>
      )}

      {/* Reading Metrics Panel */}
      {showReadingMetrics && editor && (
        <AIErrorBoundary featureName="Reading Metrics">
          <ReadingMetricsPanel text={editor.getText()} onClose={() => setShowReadingMetrics(false)} />
        </AIErrorBoundary>
      )}

      {/* AI Outline Builder */}
      {showOutlineBuilder && editor && (
        <AIErrorBoundary featureName="Outline Builder">
          <AIOutlineBuilder editor={editor} onClose={() => setShowOutlineBuilder(false)} />
        </AIErrorBoundary>
      )}

      {/* Word Choice Suggester */}
      {showWordChoice && editor && (
        <AIErrorBoundary featureName="Word Choice">
          <WordChoicePanel editor={editor} onClose={() => setShowWordChoice(false)} />
        </AIErrorBoundary>
      )}

      {/* Content Transformer */}
      {showTransformer && editor && (
        <AIErrorBoundary featureName="Content Transformer">
          <ContentTransformer editor={editor} onClose={() => setShowTransformer(false)} />
        </AIErrorBoundary>
      )}

      {/* Heading Suggestions */}
      {showHeadingSuggestions && editor && (
        <AIErrorBoundary featureName="Heading Suggestions">
          <HeadingSuggestionsPanel editor={editor} onClose={() => setShowHeadingSuggestions(false)} />
        </AIErrorBoundary>
      )}

      {/* Content Brief Generator */}
      {showBriefGenerator && editor && (
        <AIErrorBoundary featureName="Content Brief">
          <ContentBriefGenerator editor={editor} onClose={() => setShowBriefGenerator(false)} />
        </AIErrorBoundary>
      )}

      {/* Writing Score Panel */}
      {showWritingScore && writingScore && (
        <div className="fixed bottom-4 right-4 z-50">
          <AIErrorBoundary featureName="Writing Score">
            <WritingScorePanel
              score={writingScore}
              onClose={() => setShowWritingScore(false)}
              onAICoach={async () => {
                if (!editor) return;
                const text = editor.getText();
                await fetch('/api/ai', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({action: 'writing-coach', payload: {text: text.slice(0, 2000), docContext: text.slice(0, 500)}}),
                });
              }}
            />
          </AIErrorBoundary>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

const COLORS = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#818cf8', '#c084fc', '#f472b6', '#94a3b8'];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
