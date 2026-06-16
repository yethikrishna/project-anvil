/**
 * Board Gallery — pick or create a whiteboard.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Share2, Users, Pencil,
  Layout, GitBranch, BarChart3, RotateCcw, Square,
} from 'lucide-react';
import { TEMPLATES, type TemplateType } from '@/lib/templates';

interface BoardMeta {
  id: string;
  title: string;
  template: string;
  thumbnail?: string;
  updatedAt: string;
  isPublic: boolean;
}

export default function GalleryPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => setBoards(d.boards ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const createBoard = async (title: string, template: TemplateType) => {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, template }),
    });
    const board = await res.json();
    router.push(`/board/${board.id}`);
  };

  const deleteBoard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this board?')) return;
    await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    setBoards((b) => b.filter((x) => x.id !== id));
  };

  const templateEmoji: Record<string, string> = {
    blank: '⬜', wireframe: '🖼️', mindmap: '🧠', flowchart: '📊', retro: '🔄',
  };

  return (
    <div className="min-h-screen bg-neutral-950 p-8">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Whiteboard</h1>
            <p className="text-sm text-neutral-500 mt-1">Infinite collaborative canvas</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            New Board
          </button>
        </div>

        {/* Boards grid */}
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {Array(8).fill(null).map((_, i) => (
              <div key={i} className="h-40 bg-neutral-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
            <div className="text-5xl mb-4">✏️</div>
            <p className="text-lg font-medium mb-2">No boards yet</p>
            <p className="text-sm mb-6">Create your first whiteboard to get started</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Plus size={16} />
              Create Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {/* New board quick card */}
            <button
              onClick={() => setShowNewModal(true)}
              className="h-40 border-2 border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center gap-2 text-neutral-500 hover:text-white hover:border-neutral-500 transition-colors"
            >
              <Plus size={24} />
              <span className="text-sm">New Board</span>
            </button>

            {boards.map((board) => (
              <div
                key={board.id}
                className="board-card h-40 group"
                onClick={() => router.push(`/board/${board.id}`)}
              >
                {/* Thumbnail or emoji fallback */}
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                  {board.thumbnail ? (
                    <img
                      src={board.thumbnail}
                      alt=""
                      className="w-full h-full object-cover opacity-80"
                    />
                  ) : (
                    <span className="text-4xl opacity-40">
                      {templateEmoji[board.template] ?? '⬜'}
                    </span>
                  )}
                </div>

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="text-sm font-medium truncate">{board.title}</p>
                  <p className="text-xs text-neutral-400">
                    {new Date(board.updatedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-neutral-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  onClick={(e) => deleteBoard(board.id, e)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Board Modal */}
      {showNewModal && (
        <NewBoardModal
          onClose={() => setShowNewModal(false)}
          onCreate={createBoard}
        />
      )}
    </div>
  );
}

// ── New Board Modal ──

function NewBoardModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, template: TemplateType) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<TemplateType>('blank');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    await onCreate(title.trim() || 'Untitled', template);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-neutral-800">
          <h2 className="font-semibold">New Board</h2>
        </div>

        <div className="px-6 py-4">
          <label className="block text-xs text-neutral-400 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            autoFocus
            className="w-full bg-neutral-800 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500 mb-4"
          />

          <label className="block text-xs text-neutral-400 mb-2">Template</label>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`template-card ${template === t.id ? 'selected' : ''}`}
                onClick={() => setTemplate(t.id)}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-xs text-neutral-500 text-center">{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? 'Creating…' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
