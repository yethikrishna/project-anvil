/**
 * ExportButton — conversation export dropdown.
 *
 * Supports:
 * - Markdown export
 * - JSON export
 * - Copy to clipboard
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
import type { Conversation } from '@/lib/types';

interface Props {
  conversation: Conversation;
}

function conversationToMarkdown(conv: Conversation): string {
  const lines: string[] = [
    `# ${conv.title}`,
    '',
    `*Created: ${new Date(conv.createdAt).toLocaleString()}*`,
    `*Last updated: ${new Date(conv.updatedAt).toLocaleString()}*`,
    '',
    '---',
    '',
  ];

  for (const msg of conv.messages) {
    const time = new Date(msg.timestamp).toLocaleString();
    const role = msg.role === 'user' ? '👤 User' : '🤖 Anvil AI';
    lines.push(`### ${role} — ${time}`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push('**Tool calls:**');
      for (const tc of msg.toolCalls) {
        const toolName = tc.tool.replace(/_/g, ' ');
        lines.push(`- ${toolName} → ${tc.status}${tc.duration ? ` (${tc.duration}ms)` : ''}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  if (conv.context.files.length > 0 || conv.context.people.length > 0) {
    lines.push('## Context');
    lines.push('');
    if (conv.context.files.length > 0) {
      lines.push('**Files:** ' + conv.context.files.map(f => f.name).join(', '));
    }
    if (conv.context.people.length > 0) {
      lines.push('**People:** ' + conv.context.people.join(', '));
    }
    if (conv.context.topics.length > 0) {
      lines.push('**Topics:** ' + conv.context.topics.join(', '));
    }
  }

  return lines.join('\n');
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportButton({ conversation }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const safeName = conversation.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  const handleMarkdown = () => {
    const md = conversationToMarkdown(conversation);
    triggerDownload(md, `${safeName}.md`, 'text/markdown');
    setOpen(false);
  };

  const handleJSON = () => {
    const json = JSON.stringify(conversation, null, 2);
    triggerDownload(json, `${safeName}.json`, 'application/json');
    setOpen(false);
  };

  const handleCopy = async () => {
    const md = conversationToMarkdown(conversation);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 1200);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        title="Export conversation"
      >
        ↗ Export
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-50 min-w-[160px]">
          <button
            onClick={handleMarkdown}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <span>📝</span> Markdown
          </button>
          <button
            onClick={handleJSON}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <span>{'{ }'}</span> JSON
          </button>
          <button
            onClick={handleCopy}
            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 transition-colors"
          >
            <span>📋</span> {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
      )}
    </div>
  );
}
