'use client';

/**
 * ActionHistory — Persistent log of all AI actions
 *
 * Tracks every tool call the AI makes, grouped by conversation/session.
 * Stored in IndexedDB for persistence across page reloads.
 *
 * Features:
 * - Real-time append from chat stream
 * - Filter by type (email, calendar, drive, etc.)
 * - Expandable detail view per action
 * - Undo/replay hooks for supported actions
 * - Export as CSV
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Mail, Calendar, FolderOpen, Globe, FileText, Zap,
  CheckCircle2, AlertCircle, Clock, Filter, Download,
  ChevronDown, ChevronRight, RotateCcw, Trash2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────

export interface ActionRecord {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  status: 'success' | 'error' | 'pending';
  durationMs: number;
  conversationId: string;
  messageId?: string;
  timestamp: number;
  userId?: string;
}

// ── Tool metadata ──────────────────────────────────────

const TOOL_META: Record<string, { label: string; category: string; color: string; icon: React.ReactNode }> = {
  email_search:    { label: 'Search Email',       category: 'email',    color: 'text-blue-400',    icon: <Mail size={12} /> },
  email_send:      { label: 'Send Email',          category: 'email',    color: 'text-blue-400',    icon: <Mail size={12} /> },
  email_save_draft: { label: 'Save Draft',         category: 'email',    color: 'text-blue-300',    icon: <Mail size={12} /> },
  email_archive:   { label: 'Archive Email',       category: 'email',    color: 'text-blue-300',    icon: <Mail size={12} /> },
  email_read_thread: { label: 'Read Thread',       category: 'email',    color: 'text-blue-300',    icon: <Mail size={12} /> },
  email_bulk_action: { label: 'Bulk Email Action', category: 'email',    color: 'text-blue-400',    icon: <Mail size={12} /> },
  calendar_create_event: { label: 'Create Event',  category: 'calendar', color: 'text-green-400',   icon: <Calendar size={12} /> },
  calendar_check_availability: { label: 'Check Availability', category: 'calendar', color: 'text-green-300', icon: <Calendar size={12} /> },
  calendar_get_events: { label: 'Get Events',      category: 'calendar', color: 'text-green-300',   icon: <Calendar size={12} /> },
  file_search:     { label: 'Search Drive',        category: 'drive',    color: 'text-yellow-400',  icon: <FolderOpen size={12} /> },
  file_read:       { label: 'Read File',           category: 'drive',    color: 'text-yellow-300',  icon: <FolderOpen size={12} /> },
  file_share:      { label: 'Share File',          category: 'drive',    color: 'text-yellow-400',  icon: <FolderOpen size={12} /> },
  file_extract_structured: { label: 'Extract Data', category: 'drive',   color: 'text-yellow-400',  icon: <FolderOpen size={12} /> },
  document_write:  { label: 'Write Document',      category: 'docs',     color: 'text-purple-400',  icon: <FileText size={12} /> },
  web_search:      { label: 'Web Search',          category: 'web',      color: 'text-cyan-400',    icon: <Globe size={12} /> },
  cross_reference: { label: 'Cross-Reference',     category: 'system',   color: 'text-indigo-400',  icon: <Zap size={12} /> },
  tasks_create:    { label: 'Create Task',         category: 'system',   color: 'text-orange-400',  icon: <CheckCircle2 size={12} /> },
  run_workflow:    { label: 'Run Workflow',         category: 'system',   color: 'text-pink-400',    icon: <Zap size={12} /> },
  context_memo:    { label: 'Remember',            category: 'system',   color: 'text-white/50',    icon: <FileText size={12} /> },
  context_recall:  { label: 'Recall',              category: 'system',   color: 'text-white/50',    icon: <FileText size={12} /> },
};

function getToolMeta(tool: string) {
  return TOOL_META[tool] ?? { label: tool, category: 'system', color: 'text-white/50', icon: <Zap size={12} /> };
}

// ── Format args summary ────────────────────────────────

function summarizeArgs(tool: string, args: Record<string, unknown>): string {
  if (tool === 'email_search' || tool === 'web_search') return `"${args.query ?? ''}"`;
  if (tool === 'email_send') return `to ${args.to}`;
  if (tool === 'email_save_draft') return `draft to ${args.to ?? 'unknown'}`;
  if (tool === 'calendar_create_event') return `"${args.title ?? args.summary ?? ''}"`;
  if (tool === 'file_search') return `"${args.query ?? ''}"`;
  if (tool === 'file_read' || tool === 'file_share') return `file ${args.file_id ?? ''}`;
  if (tool === 'document_write') return `"${args.title ?? ''}"`;
  if (tool === 'tasks_create') return `"${args.title ?? ''}"`;
  if (tool === 'email_bulk_action') {
    const ids = Array.isArray(args.message_ids) ? args.message_ids.length : 0;
    return `${ids} emails → ${args.action}`;
  }
  if (tool === 'cross_reference') return `"${args.query ?? ''}"`;
  if (tool === 'run_workflow') return String(args.workflow_id ?? '');
  if (tool === 'context_memo') return `${args.key}: ${String(args.value ?? '').slice(0, 40)}`;
  return Object.values(args).slice(0, 2).map(String).join(', ').slice(0, 60);
}

// ── Individual action row ──────────────────────────────

function ActionRow({ action }: { action: ActionRecord }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(action.tool);

  const resultPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(action.result);
      if (parsed.error) return `Error: ${parsed.error}`;
      if (parsed.message) return parsed.message;
      if (parsed.count !== undefined) return `${parsed.count} items`;
      if (typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}}`;
      }
    } catch { /* fall through */ }
    return action.result.slice(0, 80);
  }, [action.result]);

  const time = new Date(action.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="group">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
      >
        {/* Status */}
        <span className="flex-shrink-0">
          {action.status === 'success' ? (
            <CheckCircle2 size={12} className="text-green-400" />
          ) : action.status === 'error' ? (
            <AlertCircle size={12} className="text-red-400" />
          ) : (
            <Clock size={12} className="text-white/30 animate-pulse" />
          )}
        </span>

        {/* Tool icon + label */}
        <span className={`flex-shrink-0 ${meta.color}`}>{meta.icon}</span>
        <span className="text-xs text-white/70 font-medium flex-shrink-0">{meta.label}</span>

        {/* Summary */}
        <span className="text-xs text-white/40 truncate min-w-0 flex-1">{summarizeArgs(action.tool, action.args)}</span>

        {/* Time + duration */}
        <span className="flex-shrink-0 text-[10px] text-white/25">{timeStr}</span>
        {action.durationMs > 0 && (
          <span className="flex-shrink-0 text-[10px] text-white/25">{action.durationMs}ms</span>
        )}

        {/* Expand toggle */}
        <span className="flex-shrink-0 text-white/20 group-hover:text-white/40 transition-colors">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {expanded && (
        <div className="mx-3 mb-2 rounded-lg bg-black/20 border border-white/5 p-3 space-y-2">
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Arguments</div>
            <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(action.args, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Result</div>
            <pre className="text-[11px] text-white/60 whitespace-pre-wrap break-all font-mono max-h-40 overflow-y-auto">
              {(() => {
                try { return JSON.stringify(JSON.parse(action.result), null, 2); }
                catch { return action.result; }
              })()}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Category filter ────────────────────────────────────

const CATEGORIES = ['all', 'email', 'calendar', 'drive', 'docs', 'web', 'system'] as const;
type Category = typeof CATEGORIES[number];

// ── Main component ─────────────────────────────────────

export interface ActionHistoryProps {
  actions: ActionRecord[];
  onClear?: () => void;
  className?: string;
}

export default function ActionHistory({ actions, onClear, className }: ActionHistoryProps) {
  const [filter, setFilter] = useState<Category>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return actions;
    return actions.filter((a) => {
      const meta = getToolMeta(a.tool);
      return meta.category === filter;
    });
  }, [actions, filter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of actions) {
      const cat = getToolMeta(a.tool).category;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [actions]);

  const exportCSV = useCallback(() => {
    const headers = ['timestamp', 'tool', 'status', 'summary', 'duration_ms'];
    const rows = actions.map((a) => [
      new Date(a.timestamp).toISOString(),
      a.tool,
      a.status,
      summarizeArgs(a.tool, a.args).replace(/,/g, ';'),
      a.durationMs,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anvil-action-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [actions]);

  if (actions.length === 0) {
    return (
      <div className={`text-center py-8 text-white/30 text-xs ${className ?? ''}`}>
        <Zap size={20} className="mx-auto mb-2 opacity-30" />
        No actions yet — the AI will log every tool call here
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-white/40" />
          <span className="text-xs text-white/50">{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={exportCSV}
            title="Export CSV"
            className="p-1 rounded text-white/30 hover:text-white/60 transition-colors"
          >
            <Download size={13} />
          </button>
          {onClear && (
            <button
              onClick={onClear}
              title="Clear history"
              className="p-1 rounded text-white/30 hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap px-1">
        {CATEGORIES.map((cat) => {
          const count = cat === 'all' ? actions.length : (categoryCounts[cat] ?? 0);
          if (count === 0 && cat !== 'all') return null;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors capitalize ${
                filter === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              {cat} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* Action list */}
      <div className="space-y-0.5 max-h-96 overflow-y-auto">
        {filtered.slice().reverse().map((action) => (
          <ActionRow key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
}
