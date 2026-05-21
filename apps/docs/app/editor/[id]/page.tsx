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
import {useState, useEffect, useCallback, use} from 'react';
import {useAuth} from '@anvil/auth';
import {Button} from '@anvil/ui';
import {AnalyticsPanel} from './AnalyticsPanel';

// ── Toolbar ──

function Toolbar({editor, docId}: {editor: ReturnType<typeof useEditor>; docId: string}) {
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
      // Extract filename from Content-Disposition or use fallback
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
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive('bold'))}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive('italic'))}
        title="Italic"
      >
        <em>I</em>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btnClass(editor.isActive('underline'))}
        title="Underline"
      >
        <u>U</u>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive('strike'))}
        title="Strikethrough"
      >
        <s>S</s>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        className={btnClass(editor.isActive('highlight'))}
        title="Highlight"
      >
        🖍️
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Headings */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({level: 1}).run()}
        className={btnClass(editor.isActive('heading', {level: 1}))}
        title="Heading 1"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({level: 2}).run()}
        className={btnClass(editor.isActive('heading', {level: 2}))}
        title="Heading 2"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({level: 3}).run()}
        className={btnClass(editor.isActive('heading', {level: 3}))}
        title="Heading 3"
      >
        H3
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Lists */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive('bulletList'))}
        title="Bullet List"
      >
        • List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btnClass(editor.isActive('orderedList'))}
        title="Numbered List"
      >
        1. List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btnClass(editor.isActive('blockquote'))}
        title="Blockquote"
      >
        ❝ Quote
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={btnClass(editor.isActive('codeBlock'))}
        title="Code Block"
      >
        {'</>'}
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Text align */}
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={btnClass(editor.isActive({textAlign: 'left'}))}
        title="Align Left"
      >
        ☰
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={btnClass(editor.isActive({textAlign: 'center'}))}
        title="Align Center"
      >
        ☰≡
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Undo/Redo */}
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30"
        title="Undo"
      >
        ↩ Undo
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30"
        title="Redo"
      >
        ↪ Redo
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Export */}
      <button
        onClick={() => handleExport('pdf')}
        className="px-2 py-1 rounded text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
        title="Export as PDF"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        PDF
      </button>
      <button
        onClick={() => handleExport('docx')}
        className="px-2 py-1 rounded text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
        title="Export as DOCX"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
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
      states.forEach((state) => {
        if (state.user) {
          userList.push({name: state.user.name, color: state.user.color});
        }
      });
      setUsers(userList);
    };

    awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      awareness.off('change', updateUsers);
    };
  }, [provider]);

  if (users.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-3">
      {users.map((user, i) => (
        <div
          key={i}
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-medium"
          style={{backgroundColor: user.color, marginLeft: i > 0 ? '-4px' : '0'}}
          title={user.name}
        >
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
  const [isSaving, setIsSaving] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Fetch document metadata
  useEffect(() => {
    fetch(`/api/documents/${paramsId}`)
      .then(r => r.json())
      .then(data => setDocTitle(data.title ?? 'Untitled'))
      .catch(() => setDocTitle('Untitled'));
  }, [paramsId]);

  // Report join/leave to analytics
  useEffect(() => {
    if (!user?.sub) return;

    fetch('/api/analytics/join', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        documentId: paramsId,
        userId: user.sub,
        userName: user.name ?? 'Anonymous',
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }),
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
      onAuthenticated() {
        console.log('Connected to Hocuspocus');
      },
      onAuthenticationFailed({reason}) {
        console.error('Auth failed:', reason);
      },
    });

    // Set local awareness state
    hocuspocusProvider.awareness.setLocalStateField('user', {
      name: user?.name ?? 'Anonymous',
      color: getRandomColor(),
    });

    setProvider(hocuspocusProvider);

    return () => {
      hocuspocusProvider.destroy();
      ydoc.destroy();
    };
  }, [paramsId, user?.name]);

  // Auto-save debounce
  const saveTimeout = useState<ReturnType<typeof setTimeout> | null>(null)[0];
  const saveDocument = useCallback(async (html: string) => {
    setIsSaving(true);
    try {
      await fetch(`/api/documents/${paramsId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({content: html}),
      });
    } finally {
      setIsSaving(false);
    }
  }, [paramsId]);

  // Create editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false, // Collaboration handles history via UndoRedo (renamed from history)
      }),
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight,
      Link.configure({
        openOnClick: false,
      }),
      Typography,
      Image,
      CharacterCount,
      ...(provider
        ? [
            Collaboration.configure({
              document: provider.document,
            }),
            CollaborationCaret.configure({
              provider,
              user: {
                name: user?.name ?? 'Anonymous',
                color: getRandomColor(),
              },
            }),
          ]
        : []),
    ],
    shouldRerenderOnTransaction: false,
    onUpdate: ({editor}) => {
      // Debounced auto-save
      const html = editor.getHTML();
      if (saveTimeout) clearTimeout(saveTimeout);
      setTimeout(() => saveDocument(html), 3000);

      // Report edit to analytics
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

  // Update title
  const handleTitleChange = async (newTitle: string) => {
    setDocTitle(newTitle);
    await fetch(`/api/documents/${paramsId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title: newTitle}),
    });
  };

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
        <PresenceIndicator provider={provider} />
        {isSaving && <span className="text-xs text-gray-400">Saving...</span>}
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            showAnalytics
              ? 'bg-purple-100 text-purple-700'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
          title="Collaboration Analytics"
        >
          📊 Analytics
        </button>
      </div>

      {/* Toolbar */}
      <Toolbar editor={editor} docId={paramsId} />

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <div className={`max-w-4xl mx-auto px-8 py-6 ${showAnalytics ? 'mr-96' : ''}`}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Analytics Side Panel */}
      <AnalyticsPanel
        documentId={paramsId}
        open={showAnalytics}
        onClose={() => setShowAnalytics(false)}
      />
    </div>
  );
}

// ── Helpers ──

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635',
  '#34d399', '#22d3ee', '#818cf8', '#c084fc',
  '#f472b6', '#94a3b8',
];

function getRandomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
