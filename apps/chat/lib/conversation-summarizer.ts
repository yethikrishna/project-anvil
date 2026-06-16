/**
 * Conversation Summarizer — AI-powered compression for long conversations.
 *
 * When a conversation exceeds the token threshold, this summarizer:
 * 1. Identifies the "middle" messages (not recent, not first)
 * 2. Calls the AI to generate a concise summary
 * 3. Replaces the middle with a synthetic system message
 * 4. Preserves all context metadata (files, people, topics)
 *
 * This enables effectively unlimited conversation length while
 * keeping the AI context window manageable.
 */

import type { ChatMessage, Conversation } from './types';
import { getConversation, saveConversation } from './memory';

// ── Thresholds ──

const SUMMARIZE_AFTER_MESSAGES = 30;  // Trigger when > 30 messages
const KEEP_RECENT_MESSAGES = 12;       // Always keep last 12
const KEEP_FIRST_MESSAGES = 3;         // Always keep first 3 (establish context)
const MIN_MIDDLE_MESSAGES = 8;         // Don't summarize if middle is too small

// ── Summary generation (calls the chat API without tools) ──

async function generateSummary(messages: ChatMessage[]): Promise<string> {
  const transcript = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const toolSummary = m.toolCalls?.length
        ? ` [Used tools: ${m.toolCalls.map(tc => tc.tool).join(', ')}]`
        : '';
      return `${role}: ${m.content.slice(0, 150)}${toolSummary}`;
    })
    .join('\n');

  const prompt = `Summarize this conversation exchange in 3-5 bullet points. Focus on: decisions made, information retrieved, tasks completed, and any preferences expressed. Be concise.\n\n${transcript}`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'summarizer-internal',
        message: prompt,
        history: [],
        context: { files: [], people: [], topics: [], preferences: [], actions: [] },
        settings: { communicationStyle: 'concise' },
      }),
    });

    if (!res.ok || !res.body) {
      return buildFallbackSummary(messages);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let summaryText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) summaryText += data.content;
          if (data.message?.content) summaryText = data.message.content;
        } catch { /* skip */ }
      }
    }

    return summaryText.trim() || buildFallbackSummary(messages);
  } catch {
    return buildFallbackSummary(messages);
  }
}

function buildFallbackSummary(messages: ChatMessage[]): string {
  const userMsgs = messages.filter(m => m.role === 'user');
  const toolsUsed = new Set(
    messages.flatMap(m => m.toolCalls?.map(tc => tc.tool) ?? [])
  );

  const lines: string[] = [
    `- Discussed ${userMsgs.length} topics`,
  ];

  if (toolsUsed.size > 0) {
    lines.push(`- Used tools: ${Array.from(toolsUsed).join(', ')}`);
  }

  if (userMsgs.length > 0) {
    lines.push(`- Last asked: "${userMsgs[userMsgs.length - 1].content.slice(0, 80)}"`);
  }

  return lines.join('\n');
}

// ── Main export ──

/**
 * Check if a conversation needs summarization and apply it if so.
 * Returns the updated conversation (or the original if no change needed).
 */
export async function maybeAutoSummarize(
  convId: string,
  onProgress?: (status: string) => void,
): Promise<boolean> {
  const conv = await getConversation(convId);
  if (!conv) return false;

  const userMessages = conv.messages.filter(m => m.role === 'user' || m.role === 'assistant');
  if (userMessages.length < SUMMARIZE_AFTER_MESSAGES) return false;

  // Identify the middle messages to summarize
  const allMessages = conv.messages;
  const firstMessages = allMessages.slice(0, KEEP_FIRST_MESSAGES);
  const recentMessages = allMessages.slice(-KEEP_RECENT_MESSAGES);
  const middleMessages = allMessages.slice(KEEP_FIRST_MESSAGES, -KEEP_RECENT_MESSAGES);

  if (middleMessages.length < MIN_MIDDLE_MESSAGES) return false;

  onProgress?.('Compressing conversation history…');

  const summary = await generateSummary(middleMessages);

  const summaryMsg: ChatMessage = {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: `[Conversation history compressed — ${middleMessages.length} earlier messages]\n\n${summary}`,
    timestamp: middleMessages[0]?.timestamp ?? Date.now(),
  };

  conv.messages = [...firstMessages, summaryMsg, ...recentMessages];
  conv.updatedAt = Date.now();
  await saveConversation(conv);

  onProgress?.('History compressed');
  return true;
}

/**
 * Manually trigger summarization for a conversation.
 */
export async function summarizeConversation(conv: Conversation): Promise<Conversation> {
  const allMessages = conv.messages;
  if (allMessages.length < 10) return conv;

  const firstMessages = allMessages.slice(0, KEEP_FIRST_MESSAGES);
  const recentMessages = allMessages.slice(-KEEP_RECENT_MESSAGES);
  const middleMessages = allMessages.slice(KEEP_FIRST_MESSAGES, -KEEP_RECENT_MESSAGES);

  if (middleMessages.length < 4) return conv;

  const summary = await generateSummary(middleMessages);

  const summaryMsg: ChatMessage = {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: `[Conversation history compressed — ${middleMessages.length} messages]\n\n${summary}`,
    timestamp: middleMessages[0]?.timestamp ?? Date.now(),
  };

  return {
    ...conv,
    messages: [...firstMessages, summaryMsg, ...recentMessages],
    updatedAt: Date.now(),
  };
}
