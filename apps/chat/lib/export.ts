/**
 * Export conversations to various formats.
 */

import type { Conversation } from './types';

/**
 * Export a conversation as Markdown.
 */
export function toMarkdown(conv: Conversation): string {
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
        lines.push(`- \`${tc.tool}\` → ${tc.status} (${tc.duration}ms)`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Context summary
  if (conv.context.files.length > 0 || conv.context.people.length > 0) {
    lines.push('## Context');
    lines.push('');
    if (conv.context.files.length > 0) {
      lines.push('**Files referenced:** ' + conv.context.files.map(f => f.name).join(', '));
    }
    if (conv.context.people.length > 0) {
      lines.push('**People mentioned:** ' + conv.context.people.join(', '));
    }
    if (conv.context.topics.length > 0) {
      lines.push('**Topics:** ' + conv.context.topics.join(', '));
    }
  }

  return lines.join('\n');
}

/**
 * Export a conversation as JSON.
 */
export function toJSON(conv: Conversation): string {
  return JSON.stringify(conv, null, 2);
}

/**
 * Export conversation and trigger download.
 */
export function downloadConversation(conv: Conversation, format: 'md' | 'json' = 'md') {
  const content = format === 'json' ? toJSON(conv) : toMarkdown(conv);
  const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${conv.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
