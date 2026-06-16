/**
 * Context Accumulator — learns and persists user patterns across sessions.
 *
 * After each AI turn, this module:
 * 1. Extracts entities, contacts, and patterns from the conversation
 * 2. Updates the @anvil/ai UserContext
 * 3. Persists to SQLite via dbSetPreference
 * 4. Feeds enriched context back into the next system prompt
 *
 * This is what makes the AI feel like it "remembers" you.
 *
 * Works server-side (called from /api/chat route after each response).
 */

import { UserContext } from '@anvil/ai';
import { enrichContext, type EnrichedContext } from './ai-context-bridge';
import { analyzePatterns } from './context-manager';
import { dbSetPreference, dbGetPreferences, dbSavePatterns, dbGetPatterns } from './db';
import type { ChatMessage, ConversationContext } from './types';

// ── Per-user context store (in-memory, backed by SQLite) ──

const userContexts = new Map<string, UserContext>();

function getUserContext(userId: string): UserContext {
  if (!userContexts.has(userId)) {
    const ctx = new UserContext(userId);

    // Rehydrate from SQLite preferences
    try {
      const prefs = dbGetPreferences(userId);
      if (prefs['profile_name']) {
        ctx.updateProfile({ name: prefs['profile_name'] });
      }
      if (prefs['comm_tone']) {
        ctx.updateCommunicationStyle({
          tone: prefs['comm_tone'] as 'professional' | 'casual' | 'concise' | 'detailed',
        });
      }
      if (prefs['comm_length']) {
        ctx.updateCommunicationStyle({
          responseLength: prefs['comm_length'] as 'brief' | 'standard' | 'thorough',
        });
      }
    } catch {
      // db may not be available in all environments
    }

    userContexts.set(userId, ctx);
  }
  return userContexts.get(userId)!;
}

// ── Learning from conversations ──

/**
 * Process a completed AI turn and update user context.
 * Call this after each message pair (user + assistant).
 */
export function learnFromTurn(
  userId: string,
  userMessage: string,
  assistantMessage: string,
  toolsUsed: string[],
  convContext: ConversationContext,
): void {
  try {
    const ctx = getUserContext(userId);

    // Learn from messages
    ctx.inferFromMessage({ role: 'user', content: userMessage });

    // Extract contacts mentioned in messages
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = [userMessage, assistantMessage].join(' ').match(emailPattern) ?? [];
    for (const email of emails) {
      ctx.addContact({
        email,
        frequency: 1,
        lastInteraction: Date.now(),
      });
    }

    // Extract entities from context
    for (const person of convContext.people ?? []) {
      ctx.addEntity({
        id: `person:${person.toLowerCase().replace(/\s+/g, '-')}`,
        name: person,
        type: 'person',
        aliases: [],
        attributes: {},
        relations: [],
        mentionCount: 1,
        lastMentioned: Date.now(),
      });
    }

    for (const file of convContext.files ?? []) {
      ctx.addEntity({
        id: `file:${file.id}`,
        name: file.name,
        type: 'document',
        aliases: [file.type],
        attributes: { type: file.type },
        relations: [],
        mentionCount: 1,
        lastMentioned: Date.now(),
      });

      ctx.addActiveDocument({
        id: file.id,
        title: file.name,
        type: file.type,
        lastAccessed: Date.now(),
        relevanceScore: 1,
      });
    }

    // Record tool usage stats
    for (const tool of toolsUsed) {
      ctx.recordToolUsage(tool, true, 0);
    }

    // Record interaction
    const topics = convContext.topics?.slice(0, 5) ?? [];
    ctx.recordInteraction(
      userMessage.slice(0, 200),
      toolsUsed,
      topics,
    );

    // Auto-detect communication style from message length
    const msgLen = userMessage.length;
    if (msgLen < 30) {
      ctx.updateCommunicationStyle({ responseLength: 'brief' });
    } else if (msgLen > 200) {
      ctx.updateCommunicationStyle({ responseLength: 'thorough' });
    }

    // Persist learned data
    persistContext(userId, ctx);
  } catch {
    // Never let context learning crash the main flow
  }
}

/**
 * Persist user context data to SQLite for cross-session retention.
 */
function persistContext(userId: string, ctx: UserContext): void {
  try {
    const profile = ctx.profile;
    const style = ctx.communicationStyle;
    const topContacts = ctx.getTopContacts(20);
    const topDocs = ctx.getActiveDocuments(10);
    const topTools = ctx.getMostUsedTools(10);

    // Save key signals as preferences
    if (style.tone) dbSetPreference(userId, 'comm_tone', style.tone);
    if (style.responseLength) dbSetPreference(userId, 'comm_length', style.responseLength);
    if (profile.name) dbSetPreference(userId, 'profile_name', profile.name);

    // Save richer data as patterns
    dbSavePatterns(userId, {
      topContacts: topContacts.map(c => ({ email: c.email, name: c.name, frequency: c.frequency })),
      topDocs: topDocs.map(d => ({ id: d.id, title: d.title, type: d.type })),
      topTools: topTools.map(t => ({ name: t.toolName, count: t.invocations })),
      communicationStyle: style,
      updatedAt: Date.now(),
    });
  } catch {
    // Silent fail
  }
}

/**
 * Build enriched context additions for the system prompt.
 * Call at the start of each conversation turn.
 */
export function buildContextAdditions(
  userId: string,
  convContext: ConversationContext,
  messages: ChatMessage[],
): string {
  try {
    const ctx = getUserContext(userId);
    const patterns = dbGetPatterns(userId);
    const prefs = dbGetPreferences(userId);

    // Check for explicit user preferences saved via context_memo
    const memoKeys = Object.keys(prefs).filter(k =>
      !['comm_tone', 'comm_length', 'profile_name'].includes(k)
    );

    const additions: string[] = [];

    // Communication style
    const style = ctx.communicationStyle;
    if (style.tone === 'concise') {
      additions.push('USER PREFERENCE: Be brief and direct. Short answers preferred.');
    } else if (style.tone === 'detailed') {
      additions.push('USER PREFERENCE: User prefers detailed explanations with context.');
    }

    // Remembered preferences (context_memo)
    if (memoKeys.length > 0) {
      const memoLines = memoKeys
        .slice(0, 10) // Limit to 10 preferences in prompt
        .map(k => `- ${k}: ${prefs[k]}`)
        .join('\n');
      additions.push(`REMEMBERED PREFERENCES:\n${memoLines}`);
    }

    // Top contacts
    const contactData = patterns?.['topContacts'] as Array<{ email: string; name?: string }> | undefined;
    if (contactData && contactData.length > 0) {
      const contacts = contactData.slice(0, 8).map(c => c.name ? `${c.name} <${c.email}>` : c.email).join(', ');
      additions.push(`FREQUENT CONTACTS: ${contacts}`);
    }

    // Active documents
    const activeDoc = patterns?.['topDocs'] as Array<{ title: string; type: string }> | undefined;
    if (activeDoc && activeDoc.length > 0) {
      const docs = activeDoc.slice(0, 5).map(d => `"${d.title}"`).join(', ');
      additions.push(`RECENT DOCUMENTS: ${docs}`);
    }

    // Tool preferences (teach AI which tools this user uses most)
    const toolData = patterns?.['topTools'] as Array<{ name: string; count: number }> | undefined;
    if (toolData && toolData.length > 0) {
      const tools = toolData.slice(0, 5).map(t => t.name).join(', ');
      additions.push(`FREQUENTLY USED TOOLS: ${tools}`);
    }

    // Current conversation context
    if (convContext.people?.length) {
      additions.push(`PEOPLE IN THIS CONVERSATION: ${convContext.people.slice(0, 5).join(', ')}`);
    }
    if (convContext.topics?.length) {
      additions.push(`CURRENT TOPICS: ${convContext.topics.slice(0, 5).join(', ')}`);
    }
    if (convContext.files?.length) {
      const fileNames = convContext.files.slice(0, 3).map(f => `"${f.name}"`).join(', ');
      additions.push(`REFERENCED FILES: ${fileNames}`);
    }

    return additions.length > 0
      ? `\n\n--- USER CONTEXT ---\n${additions.join('\n')}\n--- END CONTEXT ---`
      : '';
  } catch {
    return '';
  }
}

/**
 * Get known contacts for autocomplete.
 */
export function getKnownContacts(userId: string): string[] {
  try {
    const ctx = getUserContext(userId);
    return ctx.getTopContacts(20).map(c => c.name ? `${c.name} <${c.email}>` : c.email);
  } catch {
    return [];
  }
}

/**
 * Explicitly set a user preference (called by context_memo tool).
 * Already handled in tool executor, but can also be called directly.
 */
export function setUserPreference(userId: string, key: string, value: string): void {
  try {
    dbSetPreference(userId, key, value);
  } catch {
    // Silent fail
  }
}
