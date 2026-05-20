'use client';

/**
 * Drive — File preview component
 * Renders previews for images, PDFs, and text files.
 */

import { useState } from 'react';

interface FilePreviewProps {
  fileId: string;
  fileName: string;
  mimeType: string | null;
  downloadUrl: string | null;
  onClose: () => void;
}

export function FilePreview({ fileId, fileName, mimeType, downloadUrl, onClose }: FilePreviewProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const isText = mimeType?.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.yaml') ||
    fileName.endsWith('.yml') ||
    fileName.endsWith('.toml');

  // Fetch text content on demand
  if (isText && textContent === null && downloadUrl && !loading) {
    setLoading(true);
    fetch(downloadUrl)
      .then(r => r.text())
      .then(content => {
        setTextContent(content);
        setLoading(false);
      })
      .catch(() => {
        setTextContent('Failed to load file content');
        setLoading(false);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{fileName}</h3>
          <div className="flex items-center gap-2">
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={fileName}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Download
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto p-6">
          {isImage && downloadUrl && (
            <div className="flex items-center justify-center min-h-[300px]">
              <img
                src={downloadUrl}
                alt={fileName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}

          {isPdf && downloadUrl && (
            <iframe
              src={downloadUrl}
              className="w-full h-[70vh] rounded-lg border border-gray-200"
              title={fileName}
            />
          )}

          {isText && (
            <pre className="bg-gray-900 text-green-400 p-6 rounded-xl text-sm font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap break-words">
              {loading ? 'Loading...' : textContent ?? 'Loading...'}
            </pre>
          )}

          {!isImage && !isPdf && !isText && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">Preview not available</p>
              <p className="text-sm mt-1">{mimeType ?? 'Unknown file type'}</p>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={fileName}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download file
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
