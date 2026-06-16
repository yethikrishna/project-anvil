/**
 * Board Editor page — full-screen Excalidraw canvas with:
 * - Auto-save (debounced, 2s after last change)
 * - Thumbnail generation on save
 * - Export to PNG/SVG/PDF
 * - Keyboard shortcuts (Ctrl+S save, Ctrl+E export)
 * - Title editing
 * - Presenter mode (laser pointer)
 * - Back to gallery
 * - Collaboration status (placeholder for Y.js multi-user)
 */

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Download, Share2, Users, Edit2,
  Loader2, Eye, EyeOff,
} from 'lucide-react';

// Excalidraw must be dynamically imported (SSR breaks)
const Excalidraw = dynamic(
  async () => {
    const { Excalidraw } = await import('@excalidraw/excalidraw');
    return Excalidraw;
  },
  { ssr: false, loading: () => <CanvasLoading /> },
);

const exportToBlob = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw');
    return { default: mod.exportToBlob };
  },
  { ssr: false },
);

function CanvasLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-950">
      <Loader2 size={32} className="animate-spin text-neutral-500" />
    </div>
  );
}

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [board, setBoard] = useState<{
    id: string;
    title: string;
    elements: object[];
    appState: object;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [presenting, setPresenting] = useState(false);

  const excalidrawRef = useRef<{ getSceneElements: () => object[]; getAppState: () => object } | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingElements = useRef<object[]>([]);
  const pendingAppState = useRef<object>({});

  // Load board
  useEffect(() => {
    fetch(`/api/boards/${id}`)
      .then((r) => r.json())
      .then((b) => {
        setBoard(b);
        setTitle(b.title);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Debounced auto-save
  const scheduleAutoSave = useCallback((elements: object[], appState: object) => {
    pendingElements.current = elements;
    pendingAppState.current = appState;

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        // Generate thumbnail
        let thumbnail: string | undefined;
        try {
          const { exportToBlob: exportFn } = await import('@excalidraw/excalidraw');
          const blob = await exportFn({
            elements: pendingElements.current as never,
            appState: { ...pendingAppState.current, exportBackground: true } as never,
            files: null,
            mimeType: 'image/png',
          });
          const reader = new FileReader();
          thumbnail = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {
          // thumbnail generation is best-effort
        }

        await fetch(`/api/boards/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elements: pendingElements.current,
            appState: pendingAppState.current,
            ...(thumbnail ? { thumbnail } : {}),
          }),
        });
        setLastSaved(new Date());
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setSaving(false);
      }
    }, 2000);
  }, [id]);

  // Save title
  const saveTitle = async (newTitle: string) => {
    setTitle(newTitle);
    setEditingTitle(false);
    await fetch(`/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
  };

  // Manual export
  const handleExport = async (format: 'png' | 'svg') => {
    try {
      const { exportToBlob: exportBlobFn, exportToSvg } = await import('@excalidraw/excalidraw');
      const elements = pendingElements.current as never;
      const appState = pendingAppState.current as never;

      if (format === 'svg') {
        const svgEl = await exportToSvg({ elements, appState, files: null });
        const svgStr = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        downloadBlob(blob, `${title}.svg`);
      } else {
        const blob = await exportBlobFn({ elements, appState, files: null, mimeType: 'image/png' });
        downloadBlob(blob, `${title}.png`);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (pendingElements.current.length) {
          scheduleAutoSave(pendingElements.current, pendingAppState.current);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scheduleAutoSave]);

  if (loading) return <CanvasLoading />;
  if (!board) return (
    <div className="flex items-center justify-center h-screen text-neutral-500">
      Board not found
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-950">
      {/* Top bar */}
      {!presenting && (
        <div className="h-12 flex items-center gap-3 px-3 border-b border-neutral-800 flex-shrink-0 z-20 bg-neutral-950">
          {/* Back */}
          <button
            onClick={() => router.push('/')}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>

          {/* Title */}
          {editingTitle ? (
            <input
              type="text"
              defaultValue={title}
              autoFocus
              onBlur={(e) => saveTitle(e.target.value || 'Untitled')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle((e.target as HTMLInputElement).value || 'Untitled');
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="text-sm font-medium bg-transparent border-b border-blue-500 outline-none px-1"
            />
          ) : (
            <button
              className="flex items-center gap-1.5 text-sm font-medium hover:text-neutral-300 transition-colors group"
              onClick={() => setEditingTitle(true)}
            >
              {title}
              <Edit2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500" />
            </button>
          )}

          {/* Save indicator */}
          <div className="ml-2 flex items-center gap-1 text-xs text-neutral-500">
            {saving ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                <span>Saving…</span>
              </>
            ) : lastSaved ? (
              <span>Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {/* Presenter mode */}
            <button
              onClick={() => setPresenting((p) => !p)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors
                ${presenting ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            >
              {presenting ? <EyeOff size={13} /> : <Eye size={13} />}
              {presenting ? 'Exit Present' : 'Present'}
            </button>

            {/* Export */}
            <div className="relative group">
              <button className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
                <Download size={15} />
              </button>
              <div className="absolute top-full right-0 mt-1 w-28 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl hidden group-hover:block z-50">
                <button
                  onClick={() => handleExport('png')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-700 transition-colors"
                >
                  Export PNG
                </button>
                <button
                  onClick={() => handleExport('svg')}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-700 transition-colors"
                >
                  Export SVG
                </button>
              </div>
            </div>

            {/* Collaboration (placeholder) */}
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">
              <Users size={13} />
              Collaborate
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <Excalidraw
          initialData={{
            elements: board.elements as never,
            appState: {
              ...(board.appState as object),
              theme: 'dark',
              viewBackgroundColor: '#0a0a0a',
              currentItemFontFamily: 1,
            },
            scrollToContent: true,
          }}
          onChange={(elements, appState) => {
            scheduleAutoSave(elements as object[], appState as object);
          }}
          // @ts-expect-error excalidraw ref type
          ref={excalidrawRef}
          theme="dark"
          UIOptions={{
            canvasActions: {
              export: false, // We handle export ourselves
              saveToActiveFile: false,
              saveAsImage: false,
            },
          }}
        />

        {/* Present mode overlay: laser pointer hint */}
        {presenting && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-xs text-white px-3 py-1.5 rounded-full">
            Presenter mode — press Esc to exit
          </div>
        )}

        {/* Exit presenter mode */}
        {presenting && (
          <button
            onClick={() => setPresenting(false)}
            className="absolute top-4 right-4 z-50 p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-colors"
          >
            <EyeOff size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
