/**
 * ImageAttachmentDisplay — inline image preview with AI vision integration.
 *
 * Shows attached images directly in the chat bubble:
 * - Thumbnail preview with click-to-expand lightbox
 * - AI-generated alt description (accessibility + context)
 * - File info (name, size, type)
 * - Multi-image grid layout for multiple attachments
 * - Download button
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@anvil/ui';

export interface ImageAttachment {
  id: string;
  name: string;
  type: string;         // MIME type
  size: number;
  /** base64 data URL or object URL */
  dataUrl: string;
  /** AI-generated description (populated after upload) */
  description?: string;
  width?: number;
  height?: number;
}

interface SingleImageProps {
  attachment: ImageAttachment;
  onExpand: (attachment: ImageAttachment) => void;
}

interface Props {
  attachments: ImageAttachment[];
  /** Whether this is the user's own message (affects alignment) */
  isUser?: boolean;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SingleImage({ attachment, onExpand }: SingleImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <span className="text-2xl">🖼️</span>
        <div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[140px]">{attachment.name}</p>
          <p className="text-[10px] text-gray-400">{formatBytes(attachment.size)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Skeleton while loading */}
      {!loaded && (
        <div className="w-full h-32 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
      )}

      <img
        src={attachment.dataUrl}
        alt={attachment.description ?? attachment.name}
        className={cn(
          'max-w-[280px] max-h-48 w-auto h-auto rounded-xl object-cover cursor-pointer transition-all',
          'hover:brightness-90 border border-gray-200 dark:border-gray-700',
          loaded ? 'block' : 'hidden',
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        onClick={() => onExpand(attachment)}
      />

      {/* Hover overlay */}
      {loaded && (
        <div
          className="absolute inset-0 rounded-xl bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          onClick={() => onExpand(attachment)}
        >
          <span className="text-white text-xl bg-black/40 rounded-full w-9 h-9 flex items-center justify-center">
            ⤢
          </span>
        </div>
      )}

      {/* File info */}
      {loaded && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-white bg-black/60 rounded px-1.5 py-0.5 backdrop-blur-sm truncate max-w-[140px]">
            {attachment.name}
          </span>
          <span className="text-[10px] text-white bg-black/60 rounded px-1.5 py-0.5 backdrop-blur-sm">
            {formatBytes(attachment.size)}
          </span>
        </div>
      )}

      {/* AI description badge */}
      {attachment.description && loaded && (
        <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-white bg-indigo-600/80 rounded px-1.5 py-0.5 backdrop-blur-sm max-w-[180px] line-clamp-2">
            🤖 {attachment.description.slice(0, 80)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Lightbox ──

interface LightboxProps {
  attachments: ImageAttachment[];
  initialIndex: number;
  onClose: () => void;
}

function Lightbox({ attachments, initialIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const current = attachments[index];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
    if (e.key === 'ArrowRight') setIndex(i => Math.min(attachments.length - 1, i + 1));
  }, [onClose, attachments.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const downloadImage = useCallback(() => {
    const a = document.createElement('a');
    a.href = current.dataUrl;
    a.download = current.name;
    a.click();
  }, [current]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-4xl max-h-full flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between text-white">
          <div>
            <p className="font-medium text-sm">{current.name}</p>
            <p className="text-xs text-gray-400">{formatBytes(current.size)} · {current.type}</p>
          </div>
          <div className="flex items-center gap-2">
            {attachments.length > 1 && (
              <span className="text-xs text-gray-400">{index + 1} / {attachments.length}</span>
            )}
            <button
              onClick={downloadImage}
              className="text-sm text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-white/10"
            >
              ⬇ Download
            </button>
            <button
              onClick={onClose}
              className="text-xl text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
            >
              ×
            </button>
          </div>
        </div>

        {/* Image */}
        <img
          src={current.dataUrl}
          alt={current.description ?? current.name}
          className="max-w-full max-h-[70vh] object-contain rounded-xl"
        />

        {/* AI description */}
        {current.description && (
          <div className="bg-indigo-900/60 text-indigo-200 text-sm px-4 py-2.5 rounded-xl border border-indigo-700/50">
            <span className="font-medium text-indigo-300">🤖 AI: </span>
            {current.description}
          </div>
        )}

        {/* Navigation arrows */}
        {index > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setIndex(i => i - 1); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-lg"
          >
            ‹
          </button>
        )}
        {index < attachments.length - 1 && (
          <button
            onClick={e => { e.stopPropagation(); setIndex(i => i + 1); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-lg"
          >
            ›
          </button>
        )}

        {/* Thumbnail strip */}
        {attachments.length > 1 && (
          <div className="flex gap-2 justify-center flex-wrap">
            {attachments.map((att, i) => (
              <button
                key={att.id}
                onClick={() => setIndex(i)}
                className={cn(
                  'w-12 h-12 rounded-lg overflow-hidden border-2 transition-all',
                  i === index
                    ? 'border-indigo-400 scale-110'
                    : 'border-gray-600 hover:border-gray-400',
                )}
              >
                <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function ImageAttachmentDisplay({ attachments, isUser, className }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const isSingle = attachments.length === 1;
  const isDouble = attachments.length === 2;

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap gap-2',
          isUser ? 'justify-end' : 'justify-start',
          className,
        )}
      >
        {isSingle ? (
          <SingleImage
            attachment={attachments[0]}
            onExpand={() => setLightboxIndex(0)}
          />
        ) : (
          <div className={cn(
            'grid gap-1.5',
            isDouble ? 'grid-cols-2' : attachments.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
          )}>
            {attachments.slice(0, 4).map((att, i) => (
              <div key={att.id} className="relative">
                <SingleImage attachment={att} onExpand={() => setLightboxIndex(i)} />
                {/* +N overlay for 5th+ images */}
                {i === 3 && attachments.length > 4 && (
                  <div
                    className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center cursor-pointer"
                    onClick={() => setLightboxIndex(3)}
                  >
                    <span className="text-white text-xl font-bold">+{attachments.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          attachments={attachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
