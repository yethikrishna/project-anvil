/**
 * Natural language file search — converts plain English queries into
 * structured search parameters for Drive, Docs, Gmail, etc.
 *
 * Examples:
 * - "find the contract I sent to Acme Corp" → {app: 'drive', query: 'contract Acme Corp', type: 'document', dateRange: 'sent'}
 * - "show me photos from last summer" → {app: 'drive', query: 'photos', type: 'image', dateRange: '2025-06..2025-08'}
 * - "emails from John about the budget" → {app: 'gmail', query: 'budget', sender: 'John'}
 */

export interface ParsedQuery {
  /** Which app to search in */
  app: 'drive' | 'docs' | 'gmail' | 'all';
  /** Core search terms */
  query: string;
  /** File type filter */
  fileType?: string;
  /** Date range */
  dateFrom?: string;
  dateTo?: string;
  /** Sender/author filter */
  sender?: string;
  /** Recipient filter */
  recipient?: string;
  /** Sort order */
  sort?: 'relevance' | 'date' | 'name';
  /** Original query */
  original: string;
  /** Extracted entities */
  entities: ExtractedEntity[];
}

export interface ExtractedEntity {
  type: 'person' | 'date' | 'file_type' | 'app' | 'keyword';
  value: string;
  confidence: number;
}

// ── Patterns ──

const FILE_TYPE_MAP: Record<string, string> = {
  'pdf': 'application/pdf',
  'document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'doc': 'application/msword',
  'spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'slides': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image': 'image/*',
  'photo': 'image/*',
  'picture': 'image/*',
  'video': 'video/*',
  'audio': 'audio/*',
  'zip': 'application/zip',
};

const APP_KEYWORDS: Record<string, string[]> = {
  drive: ['file', 'folder', 'document', 'upload', 'drive', 'storage'],
  docs: ['doc', 'document', 'write', 'edit', 'collaborate'],
  gmail: ['email', 'mail', 'inbox', 'sent', 'draft', 'message', 'thread'],
  youtube: ['video', 'watch', 'channel', 'playlist', 'youtube'],
  maps: ['map', 'location', 'direction', 'route', 'place'],
  search: ['search', 'find', 'look up', 'google'],
};

const DATE_PATTERNS: [RegExp, () => {from: string; to: string}][] = [
  [/today/i, () => {
    const d = new Date().toISOString().split('T')[0];
    return {from: d, to: d};
  }],
  [/yesterday/i, () => {
    const d = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return {from: d, to: d};
  }],
  [/this week/i, () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    return {from: startOfWeek.toISOString().split('T')[0], to: now.toISOString().split('T')[0]};
  }],
  [/last week/i, () => {
    const now = new Date();
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - now.getDay() - 1);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
    return {from: startOfLastWeek.toISOString().split('T')[0], to: endOfLastWeek.toISOString().split('T')[0]};
  }],
  [/this month/i, () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    return {from: start, to: now.toISOString().split('T')[0]};
  }],
  [/last month/i, () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    return {from: start, to: end};
  }],
  [/last (\d+) days?/i, (match?: RegExpMatchArray) => {
    const days = parseInt(match?.[1] || '7') || 7;
    const now = new Date();
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    return {from, to: now.toISOString().split('T')[0]};
  }],
];

// ── Parser ──

export function parseNaturalLanguageQuery(input: string): ParsedQuery {
  const original = input;
  let remaining = input;
  const entities: ExtractedEntity[] = [];

  let app: ParsedQuery['app'] = 'all';
  let fileType: string | undefined;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  let sender: string | undefined;
  let recipient: string | undefined;
  let sort: ParsedQuery['sort'] = 'relevance';

  // Detect app context
  for (const [appName, keywords] of Object.entries(APP_KEYWORDS)) {
    if (keywords.some(kw => remaining.toLowerCase().includes(kw))) {
      if (appName === 'drive' || appName === 'docs' || appName === 'gmail') {
        app = appName;
      }
      break;
    }
  }

  // "email(s) from X" → gmail app, sender
  const senderMatch = remaining.match(/(?:from|by|sender)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (senderMatch) {
    sender = senderMatch[1];
    entities.push({type: 'person', value: sender, confidence: 0.8});
    remaining = remaining.replace(senderMatch[0], '');
    if (app === 'all') app = 'gmail';
  }

  // "to X" → recipient
  const recipientMatch = remaining.match(/(?:to|sent to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (recipientMatch) {
    recipient = recipientMatch[1];
    entities.push({type: 'person', value: recipient, confidence: 0.7});
    remaining = remaining.replace(recipientMatch[0], '');
    if (app === 'all') app = 'gmail';
  }

  // File type detection
  for (const [keyword, mimeType] of Object.entries(FILE_TYPE_MAP)) {
    const regex = new RegExp(`\\b${keyword}s?\\b`, 'i');
    if (regex.test(remaining)) {
      fileType = mimeType;
      entities.push({type: 'file_type', value: keyword, confidence: 0.9});
      remaining = remaining.replace(regex, '');
      if (app === 'all') app = 'drive';
      break;
    }
  }

  // Date detection
  for (const [pattern, getDateRange] of DATE_PATTERNS) {
    if (pattern.test(remaining)) {
      const range = getDateRange();
      dateFrom = range.from;
      dateTo = range.to;
      entities.push({type: 'date', value: remaining.match(pattern)![0], confidence: 0.9});
      remaining = remaining.replace(pattern, '');
      break;
    }
  }

  // "recently" → sort by date
  if (/\brecent(?:ly)?\b/i.test(remaining)) {
    sort = 'date';
    remaining = remaining.replace(/\brecent(?:ly)?\b/i, '');
  }

  // Clean up remaining query
  const query = remaining
    .replace(/\b(find|show|get|search|look|for|my|me|the|a|an|from|about|with)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Add remaining words as keyword entities
  if (query) {
    const keywords = query.split(/\s+/);
    for (const kw of keywords) {
      if (kw.length > 2) {
        entities.push({type: 'keyword', value: kw, confidence: 0.6});
      }
    }
  }

  return {
    app,
    query: query || original,
    fileType,
    dateFrom,
    dateTo,
    sender,
    recipient,
    sort,
    original,
    entities,
  };
}
