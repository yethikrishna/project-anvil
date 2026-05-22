/**
 * Rich Content Renderer — renders structured content within AI messages.
 *
 * Detects and renders:
 * - Email previews (from: subject: date:)
 * - File cards (filename + link)
 * - Calendar event cards (title, time, attendees)
 * - Action item lists with checkboxes
 * - Code blocks with syntax hints
 * - Share links as clickable cards
 */

export interface RichBlock {
  type: 'email' | 'file' | 'calendar' | 'action_items' | 'share_link' | 'code' | 'text';
  content: string;
  meta?: Record<string, string>;
}

/**
 * Parse AI message content into rich blocks.
 */
export function parseRichContent(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect email preview block
    if (line.match(/^>\s*(From|Subject|Date|To|CC):/i)) {
      const emailBlock: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        emailBlock.push(lines[i].slice(1).trim());
        i++;
      }
      blocks.push({
        type: 'email',
        content: emailBlock.join('\n'),
        meta: Object.fromEntries(
          emailBlock.map(l => {
            const colonIdx = l.indexOf(':');
            return [l.slice(0, colonIdx).trim().toLowerCase(), l.slice(colonIdx + 1).trim()];
          }),
        ),
      });
      continue;
    }

    // Detect file card [📄 filename.ext]
    const fileMatch = line.match(/^\[(📄|📎|🗂️)\s+(.+)\]\(([^)]+)\)/);
    if (fileMatch) {
      blocks.push({
        type: 'file',
        content: fileMatch[2],
        meta: { link: fileMatch[3], icon: fileMatch[1] },
      });
      i++;
      continue;
    }

    // Detect calendar event block
    if (line.match(/^📅\s+(.+)$/)) {
      const calBlock: string[] = [line];
      i++;
      while (i < lines.length && lines[i].match(/^\s+(🕐|👥|📝|📍):/)) {
        calBlock.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'calendar',
        content: calBlock.join('\n'),
        meta: Object.fromEntries(
          calBlock.map(l => {
            const cleaned = l.trim().replace(/^[📅🕐👥📝📍]\s*/, '');
            const colonIdx = cleaned.indexOf(':');
            if (colonIdx === -1) return ['title', cleaned];
            return [cleaned.slice(0, colonIdx).trim().toLowerCase(), cleaned.slice(colonIdx + 1).trim()];
          }),
        ),
      });
      continue;
    }

    // Detect share link card
    const shareMatch = line.match(/^🔗\s+\*\*(.+?)\*\*\s*(.*)/);
    if (shareMatch) {
      blocks.push({
        type: 'share_link',
        content: shareMatch[1],
        meta: { url: shareMatch[2]?.trim() || '' },
      });
      i++;
      continue;
    }

    // Detect action items (checkbox list)
    if (line.match(/^-\s*\[[ x]\]/i) || line.match(/^\*\s*\[[ x]\]/i)) {
      const actionBlock: string[] = [];
      while (i < lines.length && (lines[i].match(/^-\s*\[[ x]\]/i) || lines[i].match(/^\*\s*\[[ x]\]/i))) {
        actionBlock.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'action_items',
        content: actionBlock.join('\n'),
      });
      continue;
    }

    // Fallback: text block
    blocks.push({ type: 'text', content: line });
    i++;
  }

  return blocks;
}

/**
 * Auto-title generator — creates conversation title from first message.
 * Falls back to truncation if no AI is available.
 */
export function generateAutoTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim();

  // Remove common prefixes
  const withoutPrefix = cleaned
    .replace(/^(hey|hi|hello|please|can you|could you|would you|i need|help me)\s*/i, '')
    .trim();

  // Remove trailing punctuation
  const withoutPunct = withoutPrefix.replace(/[.!?]+$/, '');

  // If it starts with a question word, include it
  if (/^(what|when|where|who|how|why|which|find|search|show|get|draft|schedule|summarize|create|write)\b/i.test(withoutPunct)) {
    return withoutPunct.length > 60
      ? withoutPunct.slice(0, 57) + '...'
      : withoutPunct;
  }

  // Otherwise, first 60 chars
  return cleaned.length > 60 ? cleaned.slice(0, 57) + '...' : cleaned;
}

/**
 * Format a timestamp relative to now.
 */
export function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Extract @mentions from text.
 */
export function extractMentions(text: string): string[] {
  const mentions = text.match(/@(\w[\w.-]*)/g);
  return mentions ? [...new Set(mentions.map(m => m.slice(1)))] : [];
}

/**
 * Build slash command hints from partial input.
 */
export function getSlashCommandHints(partial: string): Array<{ command: string; description: string }> {
  if (!partial.startsWith('/')) return [];

  const commands = [
    { command: '/attention', description: 'What needs my attention?' },
    { command: '/draft', description: 'Draft a reply to latest email' },
    { command: '/find', description: 'Search Drive for files' },
    { command: '/share', description: 'Find and share a file' },
    { command: '/schedule', description: 'Schedule a meeting' },
    { command: '/summary', description: 'Weekly summary' },
    { command: '/compose', description: 'Compose an email' },
    { command: '/search', description: 'Search the web' },
    { command: '/clear', description: 'Clear conversation' },
    { command: '/export', description: 'Export conversation' },
    { command: '/help', description: 'Show available commands' },
  ];

  const q = partial.toLowerCase();
  return commands.filter(c => c.command.startsWith(q));
}

/**
 * Count approximate tokens (rough heuristic: 4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to token limit with ellipsis.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}
