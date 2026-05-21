/**
 * AI-powered context extraction from conversations.
 *
 * Uses the AI to extract structured context from unstructured messages:
 * - Named entities (people, companies, projects)
 * - Action items and deadlines
 * - File references
 * - Topics and themes
 * - Sentiment and urgency
 *
 * Runs as a background task after every N messages.
 */

import type { ChatMessage, ConversationContext, ReferencedFile, ActionRecord } from './types';

// ── Entity extraction patterns (fast, no AI needed) ──

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const FILE_PATTERNS = [
  /\b([\w-]+\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|json|yaml|xml))\b/gi,
  /file[:\s]+["']?([^"'\n,]+)["']?/gi,
  /document[:\s]+["']?([^"'\n,]+)["']?/gi,
];

const TOPIC_PATTERNS = [
  /(?:about|regarding|concerning|re:)\s+([A-Z][^.,!?]{3,40})/gi,
  /(?:project|task|issue|ticket)\s+([A-Za-z0-9-]+)/gi,
];

// ── Fast extractors ──

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

export function extractFileReferences(text: string): Array<{ name: string; type: string }> {
  const files: Array<{ name: string; type: string }> = [];

  for (const pattern of FILE_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      const ext = name.split('.').pop()?.toLowerCase() ?? 'unknown';
      if (!files.some(f => f.name === name)) {
        files.push({ name, type: ext });
      }
    }
  }

  return files;
}

export function extractTopics(text: string): string[] {
  const topics: string[] = [];

  for (const pattern of TOPIC_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const topic = match[1].trim();
      if (topic.length > 2 && !topics.includes(topic)) {
        topics.push(topic);
      }
    }
  }

  return topics;
}

// ── Urgency detection ──

const URGENCY_KEYWORDS = [
  /\b(urgent|asap|immediately|critical|emergency|right away)\b/i,
  /\b(deadline|due (today|tomorrow|by\s+\w+))\b/i,
  /\b(overdue|past\s+due|last\s+chance)\b/i,
];

export function detectUrgency(text: string): 'urgent' | 'high' | 'medium' | 'low' {
  for (const pattern of URGENCY_KEYWORDS) {
    if (pattern.test(text)) return 'urgent';
  }

  if (/\b(important|priority|please\s+(review|respond|check))\b/i.test(text)) {
    return 'high';
  }

  if (/\b(when\s+you\s+can|no\s+rush|at\s+your\s+convenience)\b/i.test(text)) {
    return 'low';
  }

  return 'medium';
}

// ── Action item detection ──

const ACTION_PATTERNS = [
  /(?:need\s+to|please|can\s+you|could\s+you|should|must)\s+([^.!?]{10,80})/gi,
  /(?:todo|action\s+item|follow\s+up|next\s+step)[:\s]+([^.!?]{5,80})/gi,
  /(?:remind\s+me|don't\s+forget)\s+(?:to\s+)?([^.!?]{5,80})/gi,
];

export function extractActionItems(text: string): string[] {
  const actions: string[] = [];

  for (const pattern of ACTION_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const action = match[1].trim();
      if (action.length > 5 && !actions.includes(action)) {
        actions.push(action);
      }
    }
  }

  return actions;
}

// ── Full context extraction from a batch of messages ──

export function extractFullContext(messages: ChatMessage[]): Partial<ConversationContext> {
  const allText = messages.map(m => m.content).join('\n');

  // Extract entities
  const people = extractEmails(allText);
  const fileRefs = extractFileReferences(allText);
  const topics = extractTopics(allText);
  const actions = extractActionItems(allText);

  // Build files list
  const files: ReferencedFile[] = fileRefs.map(f => ({
    id: f.name, // Use name as ID until we get real IDs from tool calls
    name: f.name,
    type: f.type,
    lastAccessed: Date.now(),
  }));

  // Build action records from detected action items
  const actionRecords: ActionRecord[] = actions.map(a => ({
    tool: 'detected',
    action: a,
    timestamp: Date.now(),
    success: true,
  }));

  // Detect urgency of last user message
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const urgency = lastUserMsg ? detectUrgency(lastUserMsg.content) : 'low';

  return {
    files,
    people,
    topics,
    actions: actionRecords,
    preferences: urgency === 'urgent' || urgency === 'high'
      ? [`User seems to have urgent items (${urgency})`]
      : [],
  };
}

// ── Incremental context merge ──

export function mergeContext(
  existing: ConversationContext,
  update: Partial<ConversationContext>,
): ConversationContext {
  return {
    files: [
      ...existing.files,
      ...(update.files ?? []),
    ].filter((f, i, arr) =>
      arr.findIndex(x => x.id === f.id) === i, // Dedupe by ID
    ).slice(-30),
    people: [...new Set([
      ...existing.people,
      ...(update.people ?? []),
    ])].slice(-25),
    topics: [...new Set([
      ...existing.topics,
      ...(update.topics ?? []),
    ])].slice(-20),
    preferences: [...new Set([
      ...existing.preferences,
      ...(update.preferences ?? []),
    ])].slice(-15),
    actions: [
      ...existing.actions,
      ...(update.actions ?? []),
    ].slice(-50),
  };
}
