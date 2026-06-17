/**
 * conversation-export.ts — Export conversations to multiple formats.
 *
 * Supports:
 * - markdown: Clean readable format with timestamps
 * - json: Full structured data for backup/import
 * - html: Rich formatted with tool result tables
 * - text: Plain text transcript
 */

import type { Conversation } from '@/lib/types';

export type ExportFormat = 'markdown' | 'json' | 'html' | 'text';

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toolSummary(toolCalls: Array<{ tool: string; status?: string; duration?: number }> | undefined): string {
  if (!toolCalls?.length) return '';
  return toolCalls.map(tc => {
    const status = tc.status === 'success' ? '✓' : tc.status === 'error' ? '✗' : '?';
    const dur = tc.duration ? ` (${tc.duration}ms)` : '';
    return `${status} ${tc.tool.replace(/_/g, ' ')}${dur}`;
  }).join(', ');
}

// ── Markdown export ──

export function exportToMarkdown(conv: Conversation): string {
  const lines: string[] = [
    `# ${conv.title}`,
    '',
    `> **Created:** ${formatTimestamp(conv.createdAt)}  `,
    `> **Messages:** ${conv.messages.length}`,
    '',
    '---',
    '',
  ];

  for (const msg of conv.messages) {
    if (msg.role === 'system') {
      lines.push(`*${msg.content}*`, '');
      continue;
    }

    const speaker = msg.role === 'user' ? '**You**' : '**Anvil**';
    const ts = `\`${formatTimestamp(msg.timestamp)}\``;

    lines.push(`### ${speaker} — ${ts}`);
    lines.push('');
    lines.push(msg.content);

    if (msg.toolCalls?.length) {
      lines.push('');
      lines.push(`*Tools used: ${toolSummary(msg.toolCalls)}*`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (conv.context?.topics?.length) {
    lines.push('## Topics discussed');
    lines.push(conv.context.topics.map(t => `- ${t}`).join('\n'));
    lines.push('');
  }

  if (conv.context?.people?.length) {
    lines.push('## People mentioned');
    lines.push(conv.context.people.map(p => `- ${p}`).join('\n'));
    lines.push('');
  }

  return lines.join('\n');
}

// ── Plain text export ──

export function exportToText(conv: Conversation): string {
  const lines: string[] = [
    conv.title,
    '='.repeat(conv.title.length),
    `Created: ${formatTimestamp(conv.createdAt)}`,
    `Messages: ${conv.messages.length}`,
    '',
  ];

  for (const msg of conv.messages) {
    if (msg.role === 'system') continue;

    const speaker = msg.role === 'user' ? 'YOU' : 'ANVIL';
    const ts = formatTimestamp(msg.timestamp);
    lines.push(`[${ts}] ${speaker}:`);
    lines.push(msg.content);
    if (msg.toolCalls?.length) {
      lines.push(`(${toolSummary(msg.toolCalls)})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── HTML export ──

export function exportToHtml(conv: Conversation): string {
  const messages = conv.messages.map(msg => {
    if (msg.role === 'system') {
      return `<div class="msg system"><em>${escapeHtml(msg.content)}</em></div>`;
    }

    const isUser = msg.role === 'user';
    const speaker = isUser ? 'You' : 'Anvil';
    const ts = formatTimestamp(msg.timestamp);
    const toolHtml = msg.toolCalls?.length
      ? `<div class="tools">${escapeHtml(toolSummary(msg.toolCalls))}</div>`
      : '';

    return `<div class="msg ${isUser ? 'user' : 'ai'}">
  <div class="meta"><strong>${speaker}</strong> <span class="ts">${ts}</span></div>
  <div class="content">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
  ${toolHtml}
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(conv.title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
  .meta-info { color: #6b7280; font-size: 0.85rem; margin-bottom: 32px; }
  .msg { margin: 16px 0; padding: 12px 16px; border-radius: 12px; }
  .msg.user { background: #eff6ff; border-left: 3px solid #3b82f6; }
  .msg.ai { background: #f9fafb; border-left: 3px solid #8b5cf6; }
  .msg.system { background: #fffbeb; border-left: 3px solid #f59e0b; font-style: italic; color: #6b7280; }
  .meta { margin-bottom: 6px; }
  .meta strong { font-size: 0.85rem; }
  .ts { font-size: 0.75rem; color: #9ca3af; margin-left: 8px; }
  .content { line-height: 1.6; white-space: pre-wrap; }
  .tools { margin-top: 6px; font-size: 0.75rem; color: #6b7280; font-style: italic; }
</style>
</head>
<body>
<h1>${escapeHtml(conv.title)}</h1>
<div class="meta-info">
  Created: ${formatTimestamp(conv.createdAt)} · ${conv.messages.length} messages
</div>
${messages}
</body>
</html>`;
}

// ── JSON export ──

export function exportToJson(conv: Conversation): string {
  return JSON.stringify(conv, null, 2);
}

// ── Main dispatcher ──

export function exportConversation(conv: Conversation, format: ExportFormat): {
  content: string;
  filename: string;
  mimeType: string;
} {
  const slug = conv.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ts = new Date(conv.createdAt).toISOString().split('T')[0];
  const base = `anvil-${slug}-${ts}`;

  switch (format) {
    case 'markdown':
      return {
        content: exportToMarkdown(conv),
        filename: `${base}.md`,
        mimeType: 'text/markdown',
      };
    case 'html':
      return {
        content: exportToHtml(conv),
        filename: `${base}.html`,
        mimeType: 'text/html',
      };
    case 'text':
      return {
        content: exportToText(conv),
        filename: `${base}.txt`,
        mimeType: 'text/plain',
      };
    case 'json':
    default:
      return {
        content: exportToJson(conv),
        filename: `${base}.json`,
        mimeType: 'application/json',
      };
  }
}
