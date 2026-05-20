'use client';

/**
 * Cross-app drag-and-drop system for Project Anvil.
 *
 * Supports:
 * - File (Drive) → Email attachment
 * - Video (YouTube) → Document embed
 * - Location (Maps) → Email body
 * - Any item → Task creation
 *
 * Uses the HTML5 Drag and Drop API with custom data transfer types.
 */

import {useState, useCallback, useRef, type ReactNode} from 'react';

// ── Types ──

export type DragItemType = 'file' | 'document' | 'video' | 'location' | 'email' | 'contact';

export interface DragItem {
  type: DragItemType;
  sourceApp: string;
  id: string;
  name: string;
  /** Additional data depending on type */
  data: Record<string, string>;
}

export interface DropTarget {
  acceptedTypes: DragItemType[];
  onDrop: (item: DragItem) => void;
  label: string;
}

// ── Custom MIME types for cross-app transfer ──

export const ANVIL_MIME = 'application/x-anvil-item';

// ── Drag Source Hook ──

export function useDragSource(item: DragItem) {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(ANVIL_MIME, JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';

    // Also set plain text fallback
    e.dataTransfer.setData('text/plain', item.name);
  }, [item]);

  return {handleDragStart};
}

// ── Drop Target Hook ──

export function useDropTarget(acceptedTypes: DragItemType[], onDrop: (item: DragItem) => void) {
  const [isOver, setIsOver] = useState(false);
  const [droppedItem, setDroppedItem] = useState<DragItem | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    const data = e.dataTransfer.getData(ANVIL_MIME);
    if (!data) return;

    try {
      const item: DragItem = JSON.parse(data);
      if (acceptedTypes.includes(item.type)) {
        setDroppedItem(item);
        onDrop(item);
      }
    } catch {
      // Invalid data
    }
  }, [acceptedTypes, onDrop]);

  return {isOver, droppedItem, handleDragOver, handleDragLeave, handleDrop};
}

// ── Drag Preview Component ──

export function DragPreview({item}: {item: DragItem}) {
  const icons: Record<DragItemType, string> = {
    file: '📁',
    document: '📝',
    video: '▶️',
    location: '📍',
    email: '✉️',
    contact: '👤',
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-sm">
      <span>{icons[item.type]}</span>
      <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
    </div>
  );
}

// ── Drop Zone Component ──

export function DropZone({
  acceptedTypes,
  onDrop,
  label,
  children,
  className,
}: {
  acceptedTypes: DragItemType[];
  onDrop: (item: DragItem) => void;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const {isOver, handleDragOver, handleDragLeave, handleDrop} = useDropTarget(acceptedTypes, onDrop);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative transition-all ${
        isOver
          ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50 dark:bg-blue-900/20'
          : ''
      } ${className ?? ''}`}
    >
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 dark:bg-blue-900/30 rounded-lg z-10">
          <div className="text-center">
            <span className="text-2xl">📥</span>
            <p className="text-sm font-medium text-blue-600 mt-1">Drop {label} here</p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Cross-app Drop Handlers ──

export const DROP_HANDLERS: Record<string, {label: string; acceptedTypes: DragItemType[]}> = {
  'gmail-compose': {label: 'file attachment', acceptedTypes: ['file', 'contact']},
  'docs-editor': {label: 'video or file', acceptedTypes: ['video', 'file', 'location']},
  'tasks-new': {label: 'any item as task', acceptedTypes: ['file', 'document', 'video', 'location', 'email']},
  'drive-folder': {label: 'file', acceptedTypes: ['file']},
};

// ── File → Email Attachment handler ──

export function handleFileToEmail(item: DragItem): {attachmentName: string; attachmentUrl: string} {
  return {
    attachmentName: item.name,
    attachmentUrl: item.data.url ?? `/api/files/${item.id}/download`,
  };
}

// ── Video → Document Embed handler ──

export function handleVideoToDoc(item: DragItem): string {
  return `<iframe src="${item.data.embedUrl ?? `/video/${item.id}`}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
}

// ── Location → Email/Doc handler ──

export function handleLocationInsert(item: DragItem): string {
  return `📍 ${item.name}\n${item.data.address ?? ''}\n${item.data.mapsUrl ?? `https://maps.google.com/?q=${item.data.lat},${item.data.lng}`}`;
}
