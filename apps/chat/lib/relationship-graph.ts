/**
 * Relationship Graph — cross-session contact intelligence.
 *
 * Tracks who the user works with, how often, and in what context.
 * This data feeds into:
 * - AI system prompt personalization ("Alice manages the Q3 project")
 * - Smart autocomplete in chat input
 * - Attention digest prioritization (emails from important contacts score higher)
 * - Meeting scheduler (suggest times based on past meeting patterns)
 *
 * Storage: localStorage + server sync via /api/memory
 */

import type { ConversationContext } from './types';

// ── Types ──

export interface Contact {
  identifier: string;          // email or display name
  displayName?: string;        // cleaned name
  email?: string;              // extracted email if available
  mentionCount: number;        // total times mentioned
  lastSeen: number;            // timestamp of most recent mention
  contexts: string[];          // what topics they appear in
  tools: string[];             // which tools were used in their context (email_send, etc)
  importance: number;          // 0-1 score, higher = more important
  relationship?: 'manager' | 'report' | 'peer' | 'external' | 'unknown';
  notes?: string;              // any captured notes about this person
}

export interface RelationshipGraph {
  contacts: Record<string, Contact>;  // keyed by identifier
  lastUpdated: number;
  totalMentions: number;
}

const GRAPH_KEY = 'anvil-chat:relationship-graph-v2';
const SYNC_DEBOUNCE_MS = 5000;

// ── Load/Save ──

export function loadGraph(): RelationshipGraph {
  if (typeof window === 'undefined') {
    return { contacts: {}, lastUpdated: Date.now(), totalMentions: 0 };
  }
  try {
    const raw = localStorage.getItem(GRAPH_KEY);
    if (!raw) return { contacts: {}, lastUpdated: Date.now(), totalMentions: 0 };
    return JSON.parse(raw) as RelationshipGraph;
  } catch {
    return { contacts: {}, lastUpdated: Date.now(), totalMentions: 0 };
  }
}

export function saveGraph(graph: RelationshipGraph): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GRAPH_KEY, JSON.stringify(graph));
  } catch { /* storage quota */ }
}

// ── Email pattern ──
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// ── Name extractors ──
// Match "Alice Smith", "Bob", "Dr. Jones", etc. in conversational context
const NAME_PATTERNS = [
  /\b(from|to|cc|reply to|contact|ask|email|message|tell|inform|notify)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/g,
  /\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(said|mentioned|asked|replied|responded|will|is|has|needs|should|sent|wrote)\b/g,
  /\bwith\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/g,
];

function extractMentions(text: string): Array<{ identifier: string; email?: string }> {
  const mentions: Array<{ identifier: string; email?: string }> = [];
  const seen = new Set<string>();

  // Extract emails
  const emails = text.match(EMAIL_RE) ?? [];
  for (const email of emails) {
    const lower = email.toLowerCase();
    if (!seen.has(lower) && !lower.includes('noreply') && !lower.includes('no-reply')) {
      seen.add(lower);
      mentions.push({ identifier: lower, email: lower });
    }
  }

  // Extract names from contextual patterns
  for (const pattern of NAME_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      const nameGroup = match[2] ?? match[1];
      if (!nameGroup) continue;
      const cleaned = nameGroup.trim();
      // Skip common words that might be falsely captured
      if (['I', 'Me', 'We', 'You', 'He', 'She', 'They', 'It', 'The', 'This', 'That'].includes(cleaned)) continue;
      if (cleaned.length < 2 || cleaned.length > 50) continue;
      if (!seen.has(cleaned.toLowerCase())) {
        seen.add(cleaned.toLowerCase());
        mentions.push({ identifier: cleaned });
      }
    }
  }

  return mentions;
}

// ── Importance scoring ──

function computeImportance(contact: Contact, totalMentions: number): number {
  if (totalMentions === 0) return 0;

  const recencyScore = (() => {
    const ageMs = Date.now() - contact.lastSeen;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - ageDays / 30); // decay to 0 over 30 days
  })();

  const frequencyScore = Math.min(1, contact.mentionCount / Math.max(1, totalMentions * 0.1));

  // Boost for action-oriented contacts (people we actually send emails to, invite to meetings)
  const actionScore = contact.tools.some(t =>
    ['email_send', 'calendar_create_event', 'email_save_draft'].includes(t)
  ) ? 0.2 : 0;

  return Math.min(1, (recencyScore * 0.4 + frequencyScore * 0.4 + actionScore));
}

// ── Graph mutations ──

export function ingestContext(
  context: ConversationContext,
  messages: Array<{ role: string; content: string }>,
): void {
  const graph = loadGraph();

  // Extract from conversation messages
  const textToScan = messages
    .filter(m => m.role !== 'system')
    .map(m => m.content)
    .join('\n');

  const mentions = extractMentions(textToScan);

  for (const mention of mentions) {
    const key = mention.email ?? mention.identifier.toLowerCase();
    const existing = graph.contacts[key] ?? {
      identifier: mention.identifier,
      email: mention.email,
      mentionCount: 0,
      lastSeen: 0,
      contexts: [],
      tools: [],
      importance: 0,
    };

    existing.mentionCount += 1;
    existing.lastSeen = Date.now();
    graph.totalMentions += 1;

    // Add topics as context
    const newTopics = context.topics.slice(-3);
    for (const t of newTopics) {
      if (!existing.contexts.includes(t)) {
        existing.contexts = [...existing.contexts, t].slice(-10);
      }
    }

    // Track which tools were used
    const recentTools = context.actions.slice(-5).map(a => a.tool);
    for (const tool of recentTools) {
      if (!existing.tools.includes(tool)) {
        existing.tools = [...existing.tools, tool].slice(-10);
      }
    }

    graph.contacts[key] = existing;
  }

  // Also ingest from structured context.people
  for (const person of context.people) {
    const key = person.toLowerCase();
    if (!graph.contacts[key]) {
      graph.contacts[key] = {
        identifier: person,
        email: EMAIL_RE.test(person) ? person : undefined,
        mentionCount: 1,
        lastSeen: Date.now(),
        contexts: context.topics.slice(-3),
        tools: [],
        importance: 0,
      };
      graph.totalMentions += 1;
    }
  }

  // Recompute importance scores
  for (const key of Object.keys(graph.contacts)) {
    graph.contacts[key].importance = computeImportance(graph.contacts[key], graph.totalMentions);
  }

  graph.lastUpdated = Date.now();

  // Prune: keep top 200 contacts by importance
  const keys = Object.keys(graph.contacts);
  if (keys.length > 200) {
    const sorted = keys.sort((a, b) => graph.contacts[b].importance - graph.contacts[a].importance);
    const toKeep = new Set(sorted.slice(0, 200));
    for (const key of keys) {
      if (!toKeep.has(key)) delete graph.contacts[key];
    }
  }

  saveGraph(graph);
}

// ── Queries ──

export function getTopContacts(limit = 10): Contact[] {
  const graph = loadGraph();
  return Object.values(graph.contacts)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

export function getContactSummary(limit = 8): string {
  const top = getTopContacts(limit);
  if (top.length === 0) return '';

  const items = top.map(c => {
    const name = c.displayName ?? c.identifier;
    const context = c.contexts[0] ?? '';
    return context ? `${name} (${context})` : name;
  });

  return `Frequent collaborators: ${items.join(', ')}.`;
}

export function findContact(query: string): Contact | null {
  const graph = loadGraph();
  const lower = query.toLowerCase();
  return Object.values(graph.contacts)
    .find(c =>
      c.identifier.toLowerCase().includes(lower) ||
      c.email?.toLowerCase().includes(lower) ||
      c.displayName?.toLowerCase().includes(lower)
    ) ?? null;
}

export function searchContacts(query: string, limit = 5): Contact[] {
  const graph = loadGraph();
  const lower = query.toLowerCase();
  return Object.values(graph.contacts)
    .filter(c =>
      c.identifier.toLowerCase().includes(lower) ||
      c.email?.toLowerCase().includes(lower) ||
      c.displayName?.toLowerCase().includes(lower)
    )
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

// ── System prompt injection ──

export function buildRelationshipContext(limit = 5): string {
  const top = getTopContacts(limit);
  if (top.length === 0) return '';

  const lines = top.map(c => {
    const name = c.displayName ?? c.identifier;
    const ctx = c.contexts.slice(0, 2).join(', ');
    const email = c.email ? ` <${c.email}>` : '';
    return `- ${name}${email}${ctx ? ` — context: ${ctx}` : ''}`;
  });

  return `IMPORTANT CONTACTS (from past interactions):\n${lines.join('\n')}`;
}
