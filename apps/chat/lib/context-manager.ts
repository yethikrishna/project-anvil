/**
 * ContextManager — tracks and surfaces accumulated context about the user.
 * Learns from interactions to provide personalized responses.
 */

'use client';

import type { ConversationContext, ActionRecord, ReferencedFile } from './types';

export interface UserPattern {
  /** Most contacted people */
  frequentContacts: Array<{ name: string; count: number }>;
  /** Common file types worked with */
  filePreferences: Array<{ type: string; count: number }>;
  /** Peak activity hours */
  activeHours: number[];
  /** Preferred meeting times */
  preferredMeetingSlots: string[];
  /** Topics the user cares about */
  interests: string[];
  /** Communication style preferences */
  communicationStyle: 'concise' | 'detailed' | 'technical' | 'casual';
}

/**
 * Analyze conversation context to extract user patterns.
 */
export function analyzePatterns(context: ConversationContext): UserPattern {
  // Contact frequency
  const contactCounts = new Map<string, number>();
  context.people.forEach(p => contactCounts.set(p, (contactCounts.get(p) ?? 0) + 1));
  const frequentContacts = Array.from(contactCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(5);

  // File type preferences
  const typeCounts = new Map<string, number>();
  context.files.forEach(f => typeCounts.set(f.type, (typeCounts.get(f.type) ?? 0) + 1));
  const filePreferences = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Active hours from action timestamps
  const activeHours = context.actions
    .map(a => new Date(a.timestamp).getHours())
    .reduce((acc: number[], h) => {
      if (!acc.includes(h)) acc.push(h);
      return acc;
    }, [])
    .sort();

  // Deduced communication style from preferences
  let communicationStyle: UserPattern['communicationStyle'] = 'concise';
  const prefs = context.preferences.join(' ').toLowerCase();
  if (prefs.includes('detail') || prefs.includes('thorough')) communicationStyle = 'detailed';
  else if (prefs.includes('technical') || prefs.includes('code')) communicationStyle = 'technical';
  else if (prefs.includes('casual') || prefs.includes('informal')) communicationStyle = 'casual';

  return {
    frequentContacts,
    filePreferences,
    activeHours,
    preferredMeetingSlots: [],
    interests: context.topics.slice(10),
    communicationStyle,
  };
}

/**
 * Build a context summary string for the AI system prompt.
 */
export function buildContextSummary(context: ConversationContext, patterns: UserPattern): string {
  const parts: string[] = [];

  if (patterns.frequentContacts.length > 0) {
    parts.push(`Frequent contacts: ${patterns.frequentContacts.map(c => c.name).join(', ')}`);
  }

  if (context.files.length > 0) {
    const recent = context.files.slice(-5).map(f => f.name);
    parts.push(`Recent files: ${recent.join(', ')}`);
  }

  if (context.topics.length > 0) {
    parts.push(`Topics of interest: ${[...new Set(context.topics)].slice(5).join(', ')}`);
  }

  if (patterns.communicationStyle !== 'concise') {
    parts.push(`Communication style: ${patterns.communicationStyle}`);
  }

  return parts.join('\n');
}

/**
 * Local storage persistence for user patterns.
 */

const PATTERNS_KEY = 'anvil-chat:patterns';

export function savePatterns(patterns: UserPattern): void {
  try {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns));
  } catch {
    // Storage full or unavailable
  }
}

export function loadPatterns(): UserPattern | null {
  try {
    const stored = localStorage.getItem(PATTERNS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}
