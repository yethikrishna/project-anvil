/**
 * UploadZone — drag-and-drop + click-to-upload photo uploader.
 *
 * Features:
 * - Drag-and-drop anywhere in the app
 * - File picker (multi-select)
 * - Real upload progress per file (XHR)
 * - Queue panel showing active uploads
 * - Duplicate detection notification
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Upload, X, CheckCircle, AlertCircle, ImageIcon } from 'lucide-react';
import { usePhotosStore } from '@/lib/store';
import { uploadPhoto } from '@/lib/api';
import type { UploadTask } from '@/lib/store';
import crypto from 'crypto';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/tiff', 'image/avif', 'image/gif'];

export default function UploadZone() {
  const { uploadQueue, addUpload, updateUpload, removeUpload, showUploadPanel, setShowUploadPanel, updatePhotoAfterUpload } = usePhotosStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Global drag-and-drop
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCounterRef.current++;
      setDragging(true);
    };
    const onDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);
      if (!e.dataTransfer?.files.length) return;
      handleFiles(Array.from(e.dataTransfer.files));
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => ACCEPTED.includes(f.type));
    if (!imageFiles.length) return;

    // Queue all files immediately
    const tasks: UploadTask[] = imageFiles.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      progress: 0,
      status: 'pending',
    }));

    for (const task of tasks) {
      addUpload(task);
    }

    // Upload concurrently (max 3 at a time)
    const CONCURRENCY = 3;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((task) => uploadFile(task)));
    }
  }, []);

  const uploadFile = async (task: UploadTask) => {
    updateUpload(task.id, { status: 'uploading' });
    try {
      const photo = await uploadPhoto(task.file, (progress) => {
        updateUpload(task.id, { progress });
      });
      updateUpload(task.id, { status: 'done', progress: 100, photoId: photo.id });
      updatePhotoAfterUpload(photo.id, photo);

      // Auto-remove after 2s
      setTimeout(() => removeUpload(task.id), 2000);
    } catch (err) {
      updateUpload(task.id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const pendingCount = uploadQueue.filter((t) => t.status !== 'done' && t.status !== 'error').length;

  return (
    <>
      {/* Global drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 bg-blue-500/20 border-2 border-blue-500 border-dashed flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload size={48} className="mx-auto mb-3 text-blue-400" />
            <p className="text-xl font-semibold text-blue-300">Drop photos to upload</p>
          </div>
        </div>
      )}

      {/* Upload trigger button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
      >
        <Upload size={14} />
        Upload
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Upload queue panel */}
      {showUploadPanel && uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-80 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-semibold">
              {pendingCount > 0 ? `Uploading ${pendingCount} photos…` : 'Uploads complete'}
            </span>
            <button
              onClick={() => setShowUploadPanel(false)}
              className="text-neutral-500 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800">
            {uploadQueue.map((task) => (
              <UploadItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function UploadItem({ task }: { task: UploadTask }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {/* File icon */}
      <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center flex-shrink-0">
        <ImageIcon size={14} className="text-neutral-400" />
      </div>

      {/* Name + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{task.file.name}</p>
        {task.status === 'uploading' && (
          <div className="mt-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-200"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
        {task.status === 'error' && (
          <p className="text-xs text-red-400">{task.errorMessage}</p>
        )}
        {task.status === 'done' && (
          <p className="text-xs text-green-400">Uploaded</p>
        )}
        {task.status === 'pending' && (
          <p className="text-xs text-neutral-500">Waiting…</p>
        )}
      </div>

      {/* Status icon */}
      <div className="flex-shrink-0">
        {task.status === 'done' && <CheckCircle size={14} className="text-green-400" />}
        {task.status === 'error' && <AlertCircle size={14} className="text-red-400" />}
        {task.status === 'uploading' && (
          <div className="w-3.5 h-3.5 border border-neutral-600 border-t-blue-400 rounded-full spin" />
        )}
      </div>
    </div>
  );
}
