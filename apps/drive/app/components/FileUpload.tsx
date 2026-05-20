'use client';

/**
 * Drive — Drag-and-drop file upload component
 */

import { useState, useCallback, useRef } from 'react';

interface FileUploadProps {
  currentPath: string;
  onUploadComplete: () => void;
  apiBaseUrl?: string;
}

interface UploadItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function FileUpload({
  currentPath,
  onUploadComplete,
  apiBaseUrl = '/api',
}: FileUploadProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateUpload = (index: number, updates: Partial<UploadItem>) => {
    setUploads(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const uploadFile = async (file: File, index: number) => {
    updateUpload(index, { status: 'uploading', progress: 0 });

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress with XMLHttpRequest for real progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBaseUrl}/files/upload?path=${encodeURIComponent(currentPath)}`);

        // Set auth header if available
        const token = typeof window !== 'undefined'
          ? sessionStorage.getItem('anvil_access_token')
          : null;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            updateUpload(index, { progress });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateUpload(index, { status: 'done', progress: 100 });
            resolve();
          } else {
            const error = xhr.statusText || 'Upload failed';
            updateUpload(index, { status: 'error', error });
            reject(new Error(error));
          }
        };

        xhr.onerror = () => {
          updateUpload(index, { status: 'error', error: 'Network error' });
          reject(new Error('Network error'));
        };

        xhr.send(formData);
      });
    } catch {
      // Error already handled above
    }
  };

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const startIndex = uploads.length;

    const newUploads: UploadItem[] = files.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setUploads(prev => [...prev, ...newUploads]);

    // Upload all files in parallel (max 3 concurrent)
    const batch = files.slice(0, 3);
    await Promise.allSettled(
      batch.map((file, i) => uploadFile(file, startIndex + i))
    );

    // Upload remaining sequentially to avoid overloading
    for (let i = 3; i < files.length; i++) {
      await uploadFile(files[i], startIndex + i);
    }

    onUploadComplete();
  }, [currentPath, onUploadComplete]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const activeUploads = uploads.filter(u => u.status !== 'done');
  const hasActive = activeUploads.length > 0;

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
        <div className="flex flex-col items-center gap-2">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-600">
            <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-400">Up to 100 MB per file</p>
        </div>
      </div>

      {/* Upload progress */}
      {hasActive && (
        <div className="mt-4 space-y-2">
          {uploads.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {item.file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatSize(item.file.size)}
                </p>
              </div>

              {/* Progress bar */}
              {item.status === 'uploading' && (
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              {/* Status icon */}
              {item.status === 'done' && (
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {item.status === 'error' && (
                <span className="text-xs text-red-500" title={item.error}>Failed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
