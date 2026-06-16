/**
 * Suggestions Engine — AI-powered contextual next-message suggestions.
 *
 * Generates 3-5 smart follow-up prompts based on:
 * - The last assistant message
 * - Current conversation context (topics, people, files)
 * - User patterns (frequent actions, preferences)
 * - Active tool results
 *
 * Suggestions are fast (non-blocking), cached by message ID,
 * and designed to feel like the assistant is anticipating needs.
 */

import type { ChatMessage, ConversationContext } from './types';

export interface Suggestion {
  id: string;
  text: string;
  icon: string;
  category: 'action' | 'follow-up' | 'explore' | 'quick';
}

// ── Local suggestion cache (message ID → suggestions) ──

const suggestionsCache = new Map<string, Suggestion[]>();

// ── Rule-based suggestions (fast, no API) ──

function getRuleBasedSuggestions(
  lastMessage: ChatMessage,
  context: ConversationContext,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const text = lastMessage.content.toLowerCase();
  const toolCalls = lastMessage.toolCalls ?? [];

  // After email search
  if (toolCalls.some(tc => tc.tool === 'email_search')) {
    suggestions.push(
      { id: 'draft-reply', text: 'Draft a reply to the most relevant one', icon: '✉️', category: 'action' },
      { id: 'summarize-thread', text: 'Summarize the full thread', icon: '📋', category: 'action' },
    );
  }

  // After file search
  if (toolCalls.some(tc => tc.tool === 'file_search')) {
    suggestions.push(
      { id: 'read-file', text: 'Read the file contents', icon: '📖', category: 'action' },
      { id: 'share-file', text: 'Create a share link', icon: '🔗', category: 'action' },
    );
  }

  // After calendar check
  if (toolCalls.some(tc => tc.tool === 'calendar_check_availability')) {
    suggestions.push(
      { id: 'book-slot', text: 'Book the earliest available slot', icon: '📅', category: 'action' },
    );
  }

  // After document write
  if (toolCalls.some(tc => tc.tool === 'document_write')) {
    suggestions.push(
      { id: 'share-doc', text: 'Share this document with the team', icon: '👥', category: 'action' },
      { id: 'email-doc', text: 'Email a link to someone', icon: '📧', category: 'action' },
    );
  }

  // After email send or draft
  if (toolCalls.some(tc => tc.tool === 'email_send' || tc.tool === 'email_save_draft')) {
    suggestions.push(
      { id: 'follow-up', text: 'Set a follow-up reminder', icon: '🔔', category: 'action' },
    );
  }

  // Content-based suggestions
  if (text.includes('meeting') || text.includes('schedule')) {
    suggestions.push(
      { id: 'add-agenda', text: 'Add an agenda to the event', icon: '📝', category: 'follow-up' },
    );
  }

  if (text.includes('summary') || text.includes('summarize')) {
    suggestions.push(
      { id: 'save-summary', text: 'Save this summary to Docs', icon: '💾', category: 'action' },
    );
  }

  if (text.includes('deadline') || text.includes('due')) {
    suggestions.push(
      { id: 'add-reminder', text: 'Add this deadline to my calendar', icon: '📅', category: 'action' },
    );
  }

  // Context-based suggestions
  if (context.people.length > 0) {
    const person = context.people[context.people.length - 1];
    suggestions.push(
      { id: 'email-person', text: `Email ${person}`, icon: '📧', category: 'quick' },
    );
  }

  // Always add exploration suggestions
  if (suggestions.length < 3) {
    suggestions.push(
      { id: 'weekly-summary', text: 'What needs my attention today?', icon: '⚡', category: 'explore' },
      { id: 'find-file', text: 'Find a specific file', icon: '🔍', category: 'explore' },
    );
  }

  return suggestions.slice(0, 4);
}

// ── Static fallback suggestions ──

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { id: 'attention', text: 'What needs my attention?', icon: '⚡', category: 'quick' },
  { id: 'draft', text: 'Draft a reply to a recent email', icon: '✉️', category: 'quick' },
  { id: 'find', text: 'Find a file in Drive', icon: '🔍', category: 'quick' },
  { id: 'schedule', text: 'Schedule a meeting', icon: '📅', category: 'quick' },
];

// ── Main export ──

export function getCachedSuggestions(messageId: string): Suggestion[] | null {
  return suggestionsCache.get(messageId) ?? null;
}

export function generateSuggestions(
  lastMessage: ChatMessage,
  context: ConversationContext,
): Suggestion[] {
  const cached = suggestionsCache.get(lastMessage.id);
  if (cached) return cached;

  const hasTools = (lastMessage.toolCalls ?? []).length > 0;
  const hasContent = lastMessage.content.length > 20;

  if (!hasContent && !hasTools) return FALLBACK_SUGGESTIONS;

  const suggestions = getRuleBasedSuggestions(lastMessage, context);
  const result = suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS;

  // Cache result
  suggestionsCache.set(lastMessage.id, result);

  // Trim cache if too large
  if (suggestionsCache.size > 50) {
    const first = suggestionsCache.keys().next().value;
    if (first) suggestionsCache.delete(first);
  }

  return result;
}

/**
 * Fetch AI-powered suggestions from the server.
 * Uses /api/chat with a special "suggest" prompt.
 * Non-blocking — returns cached results immediately while fetching.
 */
export async function fetchAISuggestions(
  lastMessage: ChatMessage,
  context: ConversationContext,
  abortSignal?: AbortSignal,
): Promise<Suggestion[]> {
  // Return cached if available
  const cached = suggestionsCache.get(lastMessage.id);
  if (cached) return cached;

  // Build a prompt to generate suggestions
  const contextHints = [
    context.topics.length > 0 ? `Topics: ${context.topics.slice(-4).join(', ')}` : '',
    context.people.length > 0 ? `People: ${context.people.slice(-4).join(', ')}` : '',
    context.files.length > 0 ? `Files: ${context.files.slice(-3).map(f => f.name).join(', ')}` : '',
    (lastMessage.toolCalls ?? []).length > 0
      ? `Tools used: ${lastMessage.toolCalls!.map(tc => tc.tool).join(', ')}`
      : '',
  ].filter(Boolean).join('. ');

  const prompt = `Given this AI response and context, suggest 3-4 natural follow-up actions the user might want to take next. Return ONLY a JSON array of objects with: text (short action label, max 8 words), icon (single emoji), category (action|follow-up|explore|quick).

AI response (first 200 chars): ${lastMessage.content.slice(0, 200)}
Context: ${contextHints || 'general'}

Response format: [{"text":"...","icon":"...","category":"..."}]`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({
        conversationId: 'suggestions-' + lastMessage.id,
        message: prompt,
        history: [],
        context: { files: [], people: [], topics: [], preferences: [], actions: [] },
        settings: { communicationStyle: 'concise' },
      }),
    });

    if (!res.ok || !res.body) {
      return generateSuggestions(lastMessage, context);
    }

    // Parse the stream to get the final text
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          if (data.content) fullText += data.content;
          if (data.message?.content) fullText = data.message.content;
        } catch { /* skip */ }
      }
    }

    // Extract JSON from the response
    const match = fullText.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as Array<{ text: string; icon: string; category: string }>;
      const suggestions: Suggestion[] = parsed.slice(0, 4).map((s, i) => ({
        id: `ai-${i}-${lastMessage.id}`,
        text: s.text ?? 'Follow up',
        icon: s.icon ?? '💡',
        category: (s.category as Suggestion['category']) ?? 'follow-up',
      }));
      suggestionsCache.set(lastMessage.id, suggestions);
      return suggestions;
    }
  } catch {
    // Silent fail — use rule-based
  }

  return generateSuggestions(lastMessage, context);
}
