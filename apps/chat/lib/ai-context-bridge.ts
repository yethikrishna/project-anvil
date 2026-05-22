/**
 * AI Context Bridge — connects @anvil/ai's UserContext and Session
 * to the chat engine's system prompt builder.
 *
 * This is the "brain" that makes the assistant feel intelligent:
 * - Remembers communication style across sessions
 * - Tracks frequent contacts and file patterns
 * - Provides task-aware context (email triage vs scheduling vs general)
 * - Bridges RAG pipeline for knowledge-grounded responses
 */

import type { UserContextData } from '@anvil/ai';
import type { ConversationContext, ChatMessage } from './types';
import type { UserPattern } from './context-manager';

// ── Context Enrichment ──

export interface EnrichedContext {
  /** For the system prompt */
  systemPromptAdditions: string[];
  /** For tool selection */
  preferredTools: string[];
  /** For response style */
  responseStyle: 'professional' | 'casual' | 'concise' | 'detailed';
  /** For scheduling preferences */
  schedulingPrefs: {
    preferredDays: number[];
    preferredHours: number[];
    meetingDuration: number;
  };
  /** Known contacts for autocomplete */
  knownContacts: string[];
}

/**
 * Merge user context from @anvil/ai with local conversation context
 * and user patterns to build an enriched context for the AI.
 */
export function enrichContext(
  aiContext: UserContextData | null,
  convContext: ConversationContext,
  patterns: UserPattern | null,
): EnrichedContext {
  const additions: string[] = [];
  const preferredTools: string[] = [];
  const knownContacts: string[] = [];

  // ── From @anvil/ai UserContext ──

  if (aiContext) {
    // Communication style
    if (aiContext.communicationStyle) {
      const toneMap: Record<string, string> = {
        concise: 'Keep responses brief and to the point. Use bullet lists.',
        detailed: 'Provide thorough explanations with context and examples.',
        professional: 'Use a professional, business-appropriate tone.',
        casual: 'Be conversational and relaxed. Use natural language.',
      };
      const guidance = toneMap[aiContext.communicationStyle.tone];
      if (guidance) additions.push(`STYLE: ${guidance}`);
    }

    // Frequent contacts
    if (aiContext.frequentContacts && aiContext.frequentContacts.length > 0) {
      const top = aiContext.frequentContacts.slice(5).map(c => c.name);
      additions.push(`FREQUENT CONTACTS: ${top.join(', ')}`);
      knownContacts.push(...aiContext.frequentContacts.map(c => c.name));
    }

    // Active documents
    if (aiContext.activeDocuments && aiContext.activeDocuments.length > 0) {
      const docs = aiContext.activeDocuments.slice(5).map(d => d.title);
      additions.push(`RECENTLY WORKED ON: ${docs.join(', ')}`);
    }

    // Knowledge entities
    if (aiContext.entities && aiContext.entities.size > 0) {
      const entities = Array.from(aiContext.entities.values()).slice(8).map(e => e.name);
      if (entities.length > 0) additions.push(`KNOWN ENTITIES: ${entities.join(', ')}`);
    }

    // Tool usage stats
    if (aiContext.toolUsage && aiContext.toolUsage.size > 0) {
      const topTools = Array.from(aiContext.toolUsage.values())
        .sort((a, b) => b.invocations - a.invocations)
        .slice(3)
        .map(t => t.toolName);
      preferredTools.push(...topTools);
    }
  }

  // ── From local patterns ──

  if (patterns) {
    if (patterns.emailTone !== 'professional') {
      additions.push(`EMAIL TONE: ${patterns.emailTone}`);
    }

    if (patterns.meetingTimePreference !== 'flexible') {
      additions.push(`MEETING TIME PREFERENCE: ${patterns.meetingTimePreference}`);
    }

    if (patterns.frequentContacts.length > 0) {
      const contacts = patterns.frequentContacts.slice(5).map(c => c.name);
      if (!additions.some(a => a.includes('FREQUENT CONTACTS'))) {
        additions.push(`FREQUENT CONTACTS: ${contacts.join(', ')}`);
      }
      knownContacts.push(...contacts);
    }

    if (patterns.interests.length > 0) {
      additions.push(`INTERESTS: ${patterns.interests.slice(5).join(', ')}`);
    }
  }

  // ── From conversation context ──

  if (convContext.preferences.length > 0) {
    additions.push(`EXPLICIT PREFERENCES:\n${convContext.preferences.map(p => `- ${p}`).join('\n')}`);
  }

  // Deduplicate known contacts
  const uniqueContacts = [...new Set(knownContacts)];

  return {
    systemPromptAdditions: additions,
    preferredTools,
    responseStyle: aiContext?.communicationStyle?.tone ?? 'concise',
    schedulingPrefs: {
      preferredDays: patterns?.preferredMeetingDays ?? [2, 3, 4], // Tue-Thu default
      preferredHours: patterns?.activeHours.filter(h => h >= 9 && h <= 17) ?? [9, 10, 11, 14, 15],
      meetingDuration: 30,
    },
    knownContacts: uniqueContacts,
  };
}

/**
 * Build a context-aware system prompt from enriched context.
 */
export function buildContextAwarePrompt(
  basePrompt: string,
  enriched: EnrichedContext,
): string {
  if (enriched.systemPromptAdditions.length === 0) return basePrompt;

  return `${basePrompt}

--- USER CONTEXT ---
${enriched.systemPromptAdditions.join('\n\n')}
--- END CONTEXT ---`;
}

/**
 * Detect implicit preferences from a user message.
 * Returns topics and preferences to add to context.
 */
export function detectImplicitPreferences(
  message: string,
): { topics: string[]; preferences: string[] } {
  const topics: string[] = [];
  const preferences: string[] = [];
  const lower = message.toLowerCase();

  // Topic detection
  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /\b(q\d|quarterly|quarter)\b/i, topic: 'quarterly review' },
    { pattern: /\b(budget|finance|revenue|cost)\b/i, topic: 'finance' },
    { pattern: /\b(hiring|recruiting|candidate|interview)\b/i, topic: 'hiring' },
    { pattern: /\b(product|roadmap|feature|release)\b/i, topic: 'product' },
    { pattern: /\b(design|ux|ui|prototype)\b/i, topic: 'design' },
    { pattern: /\b(marketing|campaign|launch|brand)\b/i, topic: 'marketing' },
    { pattern: /\b(sales|deal|pipeline|crm)\b/i, topic: 'sales' },
    { pattern: /\b(engineering|tech debt|architecture|deploy)\b/i, topic: 'engineering' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(lower) && !topics.includes(topic)) {
      topics.push(topic);
    }
  }

  // Preference detection
  if (/\b(always|never|prefer|usually|typically|i like|i hate|don't|don't like)\b/i.test(lower)) {
    // Extract the sentence containing the preference keyword
    const sentences = message.split(/[.!?]+/).filter(Boolean);
    for (const sentence of sentences) {
      if (/\b(always|never|prefer|usually|typically|i like|i hate|don't|don't like)\b/i.test(sentence)) {
        preferences.push(sentence.trim());
      }
    }
  }

  return { topics, preferences };
}
