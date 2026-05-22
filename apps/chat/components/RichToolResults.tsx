/**
 * RichToolResults — premium inline rendering for tool call results.
 *
 * Transforms raw JSON tool results into visually rich cards:
 * - Email previews: from, subject, snippet, date
 * - File cards: name, type, size, icon
 * - Calendar events: title, time, attendees, location
 * - Web search: title, snippet, favicon, URL
 * - Share links: clickable card with URL
 * - Generic JSON: pretty-printed with syntax highlighting
 */

'use client';

import { useState, useMemo } from 'react';
import { cn } from '@anvil/ui';
import type { ToolCallResult } from '@/lib/types';

// ── File type icons ──

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  document: { icon: '📄', color: 'text-blue-500' },
  spreadsheet: { icon: '📊', color: 'text-green-500' },
  presentation: { icon: '📽️', color: 'text-orange-500' },
  pdf: { icon: '📕', color: 'text-red-500' },
  image: { icon: '🖼️', color: 'text-purple-500' },
  video: { icon: '🎬', color: 'text-pink-500' },
  folder: { icon: '📁', color: 'text-yellow-500' },
  unknown: { icon: '📎', color: 'text-gray-500' },
};

function fileIconForType(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes('sheet') || lower.includes('xls') || lower.includes('csv')) return FILE_ICONS.spreadsheet;
  if (lower.includes('slide') || lower.includes('ppt') || lower.includes('presentation')) return FILE_ICONS.presentation;
  if (lower.includes('pdf')) return FILE_ICONS.pdf;
  if (lower.includes('image') || lower.includes('png') || lower.includes('jpg') || lower.includes('gif')) return FILE_ICONS.image;
  if (lower.includes('video') || lower.includes('mp4')) return FILE_ICONS.video;
  if (lower.includes('doc') || lower.includes('text')) return FILE_ICONS.document;
  if (lower.includes('folder') || lower.includes('dir')) return FILE_ICONS.folder;
  return FILE_ICONS.unknown;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function truncate(str: string, max: number): string {
  if (!str || str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

// ── Email Result Card ──

function EmailCard({ data }: { data: Record<string, unknown> }) {
  const from = String(data.from ?? data.sender ?? 'Unknown');
  const subject = String(data.subject ?? data.title ?? '(No subject)');
  const snippet = String(data.snippet ?? data.body ?? data.content ?? '');
  const date = data.date ?? data.timestamp ?? data.receivedAt;
  const unread = data.unread || data.isUnread;
  const hasAttachment = data.hasAttachment || data.attachments;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:shadow-sm transition-shadow">
      <div className="px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {unread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
            <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
              {truncate(from, 30)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasAttachment && <span className="text-[10px]" title="Has attachment">📎</span>}
            {date && (
              <span className="text-[10px] text-gray-400">
                {formatRelativeTime(String(date))}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-1 truncate">
          {truncate(subject, 80)}
        </p>
        {snippet && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
            {truncate(snippet, 200)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── File Result Card ──

function FileCard({ data }: { data: Record<string, unknown> }) {
  const name = String(data.name ?? data.title ?? data.filename ?? 'Unknown file');
  const type = String(data.type ?? data.mimeType ?? 'unknown');
  const size = data.size ? Number(data.size) : undefined;
  const modified = data.modified ?? data.updatedAt ?? data.lastModified;
  const { icon, color } = fileIconForType(type);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-lg shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {truncate(name, 50)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] font-medium', color)}>
              {type.split('/').pop()?.toUpperCase() ?? 'FILE'}
            </span>
            {size !== undefined && (
              <span className="text-[10px] text-gray-400">
                {formatFileSize(size)}
              </span>
            )}
            {modified && (
              <span className="text-[10px] text-gray-400">
                {formatRelativeTime(String(modified))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar Event Card ──

function CalendarCard({ data }: { data: Record<string, unknown> }) {
  const title = String(data.title ?? data.summary ?? 'Untitled event');
  const start = data.start ?? data.startTime ?? data.start_time;
  const end = data.end ?? data.endTime ?? data.end_time;
  const attendees = data.attendees ?? data.participants;
  const location = data.location;
  const description = data.description;

  const startTime = start ? new Date(String(start)) : null;
  const endTime = end ? new Date(String(end)) : null;

  const timeStr = startTime
    ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const endTimeStr = endTime
    ? endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const dateStr = startTime
    ? startTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 overflow-hidden">
      <div className="border-l-3 border-blue-500 pl-3.5 pr-3.5 py-2.5" style={{ borderLeftWidth: '3px' }}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
            {truncate(title, 60)}
          </p>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 shrink-0 font-medium">
            📅 Event
          </span>
        </div>
        {(timeStr || dateStr) && (
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
            🕐 {dateStr}{timeStr ? ` ${timeStr}` : ''}{endTimeStr ? ` – ${endTimeStr}` : ''}
          </p>
        )}
        {location && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            📍 {truncate(String(location), 60)}
          </p>
        )}
        {Array.isArray(attendees) && attendees.length > 0 && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            👥 {attendees.slice(0, 3).map(a => typeof a === 'string' ? a : a.email ?? a.name ?? '').join(', ')}
            {attendees.length > 3 ? ` +${attendees.length - 3} more` : ''}
          </p>
        )}
        {description && (
          <p className="text-[10px] text-gray-400 mt-1 line-clamp-2">
            {truncate(String(description), 120)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Web Search Result Card ──

function WebResultCard({ data }: { data: Record<string, unknown> }) {
  const title = String(data.title ?? 'Untitled');
  const url = String(data.url ?? data.link ?? '');
  const snippet = String(data.snippet ?? data.description ?? '');
  const favicon = data.favicon;

  const domain = url ? (() => {
    try { return new URL(url).hostname; } catch { return ''; }
  })() : '';

  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition-all"
    >
      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          {favicon ? (
            <img src={String(favicon)} alt="" className="w-3.5 h-3.5 rounded" />
          ) : (
            <span className="text-[10px]">🌐</span>
          )}
          <span className="text-[10px] text-gray-400 truncate">{domain}</span>
        </div>
        <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1 hover:underline truncate">
          {truncate(title, 80)}
        </p>
        {snippet && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
            {truncate(snippet, 160)}
          </p>
        )}
      </div>
    </a>
  );
}

// ── Share Link Card ──

function ShareLinkCard({ data }: { data: Record<string, unknown> }) {
  const url = String(data.url ?? data.link ?? data.shareLink ?? '');
  const fileName = String(data.name ?? data.title ?? (typeof data.file === 'object' && data.file ? (data.file as Record<string, unknown>).name : '') ?? 'File');

  return (
    <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 overflow-hidden">
      <div className="px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
            Shared: {truncate(fileName, 40)}
          </span>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1 block truncate"
          >
            {truncate(url, 80)}
          </a>
        )}
      </div>
    </div>
  );
}

// ── Generic JSON Card ──

function GenericCard({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="text-sm">🔧</span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-[10px] text-gray-400 ml-auto">
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {expanded && (
        <pre className="px-3.5 pb-2.5 text-[10px] font-mono text-gray-500 dark:text-gray-400 whitespace-pre-wrap max-h-48 overflow-auto">
          {formatted.length > 500 ? formatted.slice(0, 500) + '\n...' : formatted}
        </pre>
      )}
    </div>
  );
}

// ── Smart tool result detector ──

type CardType = 'email' | 'file' | 'calendar' | 'web' | 'share' | 'generic';

function detectCardType(tool: string, data: Record<string, unknown>): CardType {
  switch (tool) {
    case 'email_search':
    case 'email_read_thread':
      return 'email';
    case 'email_send':
      return 'generic';
    case 'email_save_draft':
      return 'generic';
    case 'file_search':
    case 'file_read':
      return 'file';
    case 'file_share':
      return 'share';
    case 'calendar_create_event':
    case 'calendar_check_availability':
      return 'calendar';
    case 'web_search':
      return 'web';
    case 'document_write':
      return 'file';
    default:
      return 'generic';
  }
}

// ── Render tool results as rich cards ──

function renderToolResult(tc: ToolCallResult, index: number) {
  let data: unknown;
  try {
    data = JSON.parse(tc.result);
  } catch {
    data = { raw: tc.result };
  }

  const toolName = tc.tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const statusIcon = tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '⟳';
  const statusCls = tc.status === 'success'
    ? 'text-green-600 dark:text-green-400'
    : tc.status === 'error'
      ? 'text-red-600 dark:text-red-400'
      : 'text-blue-500';

  // Error result
  if (tc.status === 'error') {
    const errorMsg = typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>).error ?? (data as Record<string, unknown>).message ?? tc.result
      : tc.result;
    return (
      <div key={tc.id} className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium', statusCls)}>{statusIcon}</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{toolName}</span>
        </div>
        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
          {truncate(String(errorMsg), 150)}
        </p>
      </div>
    );
  }

  // Running
  if (tc.status === 'running') {
    return (
      <div key={tc.id} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-500 animate-pulse">⟳</span>
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{toolName}</span>
          <span className="text-[10px] text-blue-400 ml-auto">Running...</span>
        </div>
      </div>
    );
  }

  const dataObj = (typeof data === 'object' && data !== null ? data : { raw: data }) as Record<string, unknown>;
  const cardType = detectCardType(tc.tool, dataObj);

  // Check if result has an array of items (search results)
  const items = Array.isArray(dataObj.results) ? dataObj.results
    : Array.isArray(dataObj.messages) ? dataObj.messages
    : Array.isArray(dataObj.events) ? dataObj.events
    : null;

  // Multi-item results
  if (items && items.length > 0) {
    const count = items.length;
    return (
      <div key={tc.id} className="space-y-1.5">
        <div className="flex items-center gap-2 px-1">
          <span className={cn('text-[10px] font-medium', statusCls)}>{statusIcon}</span>
          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {toolName} — {count} result{count !== 1 ? 's' : ''}
            {tc.duration ? ` in ${tc.duration}ms` : ''}
          </span>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto chat-scroll">
          {items.slice(0, 5).map((item: unknown, i: number) => {
            const itemObj = (typeof item === 'object' && item !== null ? item : { raw: item }) as Record<string, unknown>;
            return (
              <div key={i}>
                {cardType === 'email' && <EmailCard data={itemObj} />}
                {cardType === 'file' && <FileCard data={itemObj} />}
                {cardType === 'calendar' && <CalendarCard data={itemObj} />}
                {cardType === 'web' && <WebResultCard data={itemObj} />}
                {cardType === 'share' && <ShareLinkCard data={itemObj} />}
                {cardType === 'generic' && <GenericCard data={itemObj} label={`${toolName} #${i + 1}`} />}
              </div>
            );
          })}
          {count > 5 && (
            <p className="text-[10px] text-gray-400 text-center py-1">
              +{count - 5} more results
            </p>
          )}
        </div>
      </div>
    );
  }

  // Single-item result
  return (
    <div key={tc.id}>
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <span className={cn('text-[10px] font-medium', statusCls)}>{statusIcon}</span>
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
          {toolName}
          {tc.duration ? ` · ${tc.duration}ms` : ''}
        </span>
      </div>
      {cardType === 'email' && <EmailCard data={dataObj} />}
      {cardType === 'file' && <FileCard data={dataObj} />}
      {cardType === 'calendar' && <CalendarCard data={dataObj} />}
      {cardType === 'web' && <WebResultCard data={dataObj} />}
      {cardType === 'share' && <ShareLinkCard data={dataObj} />}
      {cardType === 'generic' && <GenericCard data={dataObj} label={toolName} />}
    </div>
  );
}

// ── Public component ──

interface Props {
  toolCalls: ToolCallResult[];
}

export default function RichToolResults({ toolCalls }: Props) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 max-w-full">
      {toolCalls.map((tc, i) => renderToolResult(tc, i))}
    </div>
  );
}
