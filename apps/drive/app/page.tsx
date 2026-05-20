'use client';

/**
 * Drive — Main file browser page
 */

import { useState, useEffect, useCallback } from 'react';
import { FileUpload } from './components/FileUpload';
import { FilePreview } from './components/FilePreview';
import { ContextMenu, useContextMenu } from './components/ContextMenu';

interface FileEntry {
  id: string;
  name: string;
  mimeType: string | null;
  size: number;
  isDirectory: boolean;
  createdAt: string;
  updatedAt: string;
  path: string;
}

const API_BASE = process.env.NEXT_PUBLIC_DRIVE_API_URL ?? 'http://localhost:3100';

export default function DrivePage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{
    fileId: string;
    fileName: string;
    mimeType: string | null;
    downloadUrl: string | null;
  } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('anvil_access_token');
      const res = await fetch(
        `${API_BASE}/files?path=${encodeURIComponent(currentPath)}`,
        { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
      );
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
      setFiles(data.data ?? []);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── Actions ───────────────────────────────────────────

  const handleRename = async (id: string, newName: string) => {
    const token = sessionStorage.getItem('anvil_access_token');
    await fetch(`${API_BASE}/files/${id}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: newName }),
    });
    fetchFiles();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const token = sessionStorage.getItem('anvil_access_token');
    await fetch(`${API_BASE}/files/${id}`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    fetchFiles();
  };

  const handleShare = async (id: string) => {
    const token = sessionStorage.getItem('anvil_access_token');
    const res = await fetch(`${API_BASE}/files/${id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ expiresInHours: 168 }),
    });
    const data = await res.json();
    setShareUrl(`${window.location.origin}/share/${data.data?.token}`);
  };

  const handleDownload = async (id: string) => {
    const token = sessionStorage.getItem('anvil_access_token');
    const res = await fetch(`${API_BASE}/files/${id}/download`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const data = await res.json();
    if (data.data?.url) {
      window.open(data.data.url, '_blank');
    }
  };

  const handleOpenFile = async (file: FileEntry) => {
    if (file.isDirectory) {
      // Navigate into directory
      const pathParts = file.path.replace(/^root\./, '').replace(/\./g, '/');
      setCurrentPath(`/${pathParts}`);
      return;
    }
    // Get download URL for preview
    const token = sessionStorage.getItem('anvil_access_token');
    const res = await fetch(`${API_BASE}/files/${file.id}/download`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const data = await res.json();
    setPreview({
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      downloadUrl: data.data?.url ?? null,
    });
  };

  const handleCreateFolder = async () => {
    const name = prompt('Folder name:');
    if (!name) return;
    const token = sessionStorage.getItem('anvil_access_token');
    await fetch(`${API_BASE}/files/folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name, parentPath: currentPath }),
    });
    fetchFiles();
  };

  // ── Helpers ───────────────────────────────────────────

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (file: FileEntry) => {
    if (file.isDirectory) return '📁';
    const mime = file.mimeType ?? '';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime === 'application/pdf') return '📄';
    if (mime.startsWith('text/') || mime === 'application/json') return '📝';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    return '📎';
  };

  const breadcrumbs = currentPath
    .split('/')
    .filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => setCurrentPath('/')}
            className="text-gray-500 hover:text-gray-900 font-medium"
          >
            My Drive
          </button>
          {breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-gray-300">/</span>
              <button
                onClick={() => setCurrentPath('/' + breadcrumbs.slice(0, i + 1).join('/'))}
                className="text-gray-500 hover:text-gray-900"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateFolder}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            📁 New folder
          </button>
        </div>
      </div>

      {/* Upload area */}
      <div className="px-6 pt-4">
        <FileUpload
          currentPath={currentPath}
          onUploadComplete={fetchFiles}
          apiBaseUrl={API_BASE}
        />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-16 h-16 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-lg font-medium">No files yet</p>
            <p className="text-sm">Upload files or create a folder to get started</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_150px] gap-4 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
            </div>

            {files.map(file => (
              <div
                key={file.id}
                onClick={() => handleOpenFile(file)}
                onContextMenu={e => showContextMenu(e, file.id, file.name, file.isDirectory)}
                className="grid grid-cols-[1fr_100px_150px] gap-4 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg flex-shrink-0">{getFileIcon(file)}</span>
                  <span className="text-sm text-gray-900 truncate">{file.name}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {file.isDirectory ? '—' : formatSize(file.size)}
                </span>
                <span className="text-sm text-gray-500">
                  {new Date(file.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu?.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          fileId={contextMenu.fileId}
          fileName={contextMenu.fileName}
          isDirectory={contextMenu.isDirectory}
          onClose={hideContextMenu}
          onRename={handleRename}
          onDelete={handleDelete}
          onShare={handleShare}
          onDownload={handleDownload}
        />
      )}

      {/* File preview modal */}
      {preview && (
        <FilePreview
          fileId={preview.fileId}
          fileName={preview.fileName}
          mimeType={preview.mimeType}
          downloadUrl={preview.downloadUrl}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Share URL toast */}
      {shareUrl && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 z-50">
          <span className="text-sm">Share link copied!</span>
          <input
            readOnly
            value={shareUrl}
            className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded font-mono w-64"
            onClick={e => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
            }}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
          >
            Copy
          </button>
          <button
            onClick={() => setShareUrl(null)}
            className="text-gray-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
