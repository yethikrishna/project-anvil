/**
 * Conversation Intelligence — extracts structured signal from AI turns.
 *
 * After each chat turn, this module analyzes the conversation and extracts:
 * - Action items / tasks created or mentioned
 * - Decisions made in the conversation
 * - Commitments / promises ("I will", "let me", "I'll send")
 * - Key facts stated or confirmed
 * - Follow-up reminders needed
 *
 * Extracted items are stored in SQLite and surfaced in:
 * - The sidebar "Action Items" panel
 * - Weekly summary
 * - Proactive reminders
 *
 * This is the "Anthropic killer" feature: the AI doesn't just answer —
 * it tracks what was agreed and ensures things get done.
 */

import { ChatEngine } from './chat-engine';
import { dbSetPreference, dbGetPreferences } from './db';
import type { ChatMessage } from './types';

// ── Types ──

export interface ExtractedTask {
  id: string;
  text: string;
  source: 'ai_said' | 'user_said' | 'implicit';
  assignee: 'ai' | 'user' | 'unknown';
  dueHint?: string;  // e.g. "by Friday", "end of week"
  status: 'pending' | 'done' | 'cancelled';
  conversationId: string;
  messageId?: string;
  createdAt: number;
}

export interface ExtractedDecision {
  id: string;
  text: string;
  context: string;
  conversationId: string;
  createdAt: number;
}

export interface ExtractedCommitment {
  id: string;
  text: string;
  who: 'ai' | 'user';
  conversationId: string;
  createdAt: number;
  dueHint?: string;
}

export interface ConversationIntelligence {
  tasks: ExtractedTask[];
  decisions: ExtractedDecision[];
  commitments: ExtractedCommitment[];
  keyFacts: string[];
  followUps: string[];
}

// ── Storage keys ──

const TASKS_KEY = 'intelligence:tasks';
const DECISIONS_KEY = 'intelligence:decisions';
const COMMITMENTS_KEY = 'intelligence:commitments';

// ── Extraction patterns (fast, no AI needed) ──

const AI_COMMITMENT_PATTERNS = [
  /\bI'(?:ve|ll) (?:sent|send|scheduled|created|drafted|saved|emailed|updated|added)\b/gi,
  /\bI (?:have |)(?:saved|sent|created|scheduled|drafted|emailed|updated|added)\b/gi,
  /\bDone[.!]/gi,
  /\bCompleted[.!]/gi,
  /\bI'll (?:follow up|remind|check|look into|get back)\b/gi,
];

const USER_TASK_PATTERNS = [
  /\bI (?:need to|have to|should|must|will|want to)\s+([^.!?\n]{10,80})/gi,
  /\bRemind me to\s+([^.!?\n]{5,60})/gi,
  /\bDon't forget to\s+([^.!?\n]{5,60})/gi,
  /\bTODO[:\s]+([^.!?\n]{5,80})/gi,
];

const DECISION_PATTERNS = [
  /\b(?:We|I) (?:decided?|agreed?|chose?|settled on|went with)\s+([^.!?\n]{5,80})/gi,
  /\bDecision[:\s]+([^.!?\n]{5,80})/gi,
  /\bFinal (?:answer|choice|decision)[:\s]+([^.!?\n]{5,80})/gi,
];

function extractWithPatterns(
  text: string,
  patterns: RegExp[],
): string[] {
  const results: string[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const captured = match[1] ?? match[0];
      const clean = captured.trim().replace(/\s+/g, ' ');
      if (clean.length >= 5 && clean.length <= 200) {
        results.push(clean);
      }
    }
  }
  return results;
}

// ── AI-powered deep extraction ──

async function extractWithAI(
  userMessage: string,
  aiResponse: string,
  convId: string,
): Promise<ConversationIntelligence> {
  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions';

  const prompt = `Analyze this conversation exchange and extract structured information.

USER: ${userMessage.slice(0, 1000)}

AI: ${aiResponse.slice(0, 2000)}

Return a JSON object with EXACTLY this structure (arrays may be empty):
{
  "tasks": [
    {
      "text": "specific task text",
      "assignee": "ai" or "user",
      "dueHint": "by Friday" or null
    }
  ],
  "decisions": ["decision made", ...],
  "commitments": [
    {
      "text": "what was committed",
      "who": "ai" or "user",
      "dueHint": null or "timeframe"
    }
  ],
  "keyFacts": ["important fact stated", ...],
  "followUps": ["follow-up needed", ...]
}

Rules:
- Only extract concrete, actionable items
- Tasks: things that need to be DONE (not already done)
- Decisions: things that were CHOSEN or AGREED
- Commitments: explicit promises made
- KeyFacts: user shared important personal info (name, role, preferences)
- FollowUps: things that should be revisited
- If nothing to extract in a category, use empty array
- Return ONLY the JSON, no markdown`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Fast + cheap for extraction
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`AI extraction failed: ${res.status}`);

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    const parsed = JSON.parse(content);
    const now = Date.now();

    return {
      tasks: (parsed.tasks ?? []).map((t: { text: string; assignee: string; dueHint?: string }) => ({
        id: crypto.randomUUID(),
        text: t.text,
        source: t.assignee === 'ai' ? 'ai_said' as const : 'user_said' as const,
        assignee: (['ai', 'user', 'unknown'].includes(t.assignee) ? t.assignee : 'unknown') as 'ai' | 'user' | 'unknown',
        dueHint: t.dueHint ?? undefined,
        status: 'pending' as const,
        conversationId: convId,
        createdAt: now,
      })),
      decisions: (parsed.decisions ?? []).map((d: string) => ({
        id: crypto.randomUUID(),
        text: d,
        context: userMessage.slice(0, 100),
        conversationId: convId,
        createdAt: now,
      })),
      commitments: (parsed.commitments ?? []).map((c: { text: string; who: string; dueHint?: string }) => ({
        id: crypto.randomUUID(),
        text: c.text,
        who: (['ai', 'user'].includes(c.who) ? c.who : 'ai') as 'ai' | 'user',
        conversationId: convId,
        createdAt: now,
        dueHint: c.dueHint ?? undefined,
      })),
      keyFacts: parsed.keyFacts ?? [],
      followUps: parsed.followUps ?? [],
    };
  } catch {
    // Fallback to pattern matching
    return extractWithPatternFallback(userMessage, aiResponse, convId);
  }
}

function extractWithPatternFallback(
  userMessage: string,
  aiResponse: string,
  convId: string,
): ConversationIntelligence {
  const now = Date.now();

  const aiCommitmentTexts = extractWithPatterns(aiResponse, AI_COMMITMENT_PATTERNS);
  const userTaskTexts = extractWithPatterns(userMessage, USER_TASK_PATTERNS);
  const decisionTexts = [
    ...extractWithPatterns(userMessage, DECISION_PATTERNS),
    ...extractWithPatterns(aiResponse, DECISION_PATTERNS),
  ];

  return {
    tasks: userTaskTexts.map(text => ({
      id: crypto.randomUUID(),
      text,
      source: 'user_said' as const,
      assignee: 'user' as const,
      status: 'pending' as const,
      conversationId: convId,
      createdAt: now,
    })),
    decisions: decisionTexts.map(text => ({
      id: crypto.randomUUID(),
      text,
      context: '',
      conversationId: convId,
      createdAt: now,
    })),
    commitments: aiCommitmentTexts.map(text => ({
      id: crypto.randomUUID(),
      text,
      who: 'ai' as const,
      conversationId: convId,
      createdAt: now,
    })),
    keyFacts: [],
    followUps: [],
  };
}

// ── Persistence helpers ──

function loadArray<T>(userId: string, key: string): T[] {
  try {
    const prefs = dbGetPreferences(userId);
    const raw = prefs[key];
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function saveArray<T>(userId: string, key: string, items: T[]): void {
  // Keep last 200 items to avoid unbounded growth
  const trimmed = items.slice(-200);
  dbSetPreference(userId, key, JSON.stringify(trimmed));
}

// ── Public API ──

/**
 * Process a completed AI turn and extract intelligence.
 * Called from /api/chat route after each response.
 */
export async function extractTurnIntelligence(
  userId: string,
  conversationId: string,
  userMessage: string,
  aiResponse: string,
): Promise<ConversationIntelligence> {
  // Skip extraction for very short or system messages
  if (userMessage.length < 10 || aiResponse.length < 20) {
    return { tasks: [], decisions: [], commitments: [], keyFacts: [], followUps: [] };
  }

  // Use AI extraction if API key available, else pattern fallback
  const hasApiKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  const intelligence = hasApiKey
    ? await extractWithAI(userMessage, aiResponse, conversationId)
    : extractWithPatternFallback(userMessage, aiResponse, conversationId);

  // Persist extracted items
  if (intelligence.tasks.length > 0) {
    const existing = loadArray<ExtractedTask>(userId, TASKS_KEY);
    saveArray(userId, TASKS_KEY, [...existing, ...intelligence.tasks]);
  }

  if (intelligence.decisions.length > 0) {
    const existing = loadArray<ExtractedDecision>(userId, DECISIONS_KEY);
    saveArray(userId, DECISIONS_KEY, [...existing, ...intelligence.decisions]);
  }

  if (intelligence.commitments.length > 0) {
    const existing = loadArray<ExtractedCommitment>(userId, COMMITMENTS_KEY);
    saveArray(userId, COMMITMENTS_KEY, [...existing, ...intelligence.commitments]);
  }

  // Store key facts as user memories
  for (const fact of intelligence.keyFacts) {
    if (fact.length >= 10) {
      const key = `user_memory:facts:${fact.slice(0, 40).replace(/[^a-z0-9]/gi, '_')}`;
      dbSetPreference(userId, key, fact);
    }
  }

  return intelligence;
}

/**
 * Get all pending tasks for a user.
 */
export function getPendingTasks(userId: string): ExtractedTask[] {
  const all = loadArray<ExtractedTask>(userId, TASKS_KEY);
  return all.filter(t => t.status === 'pending').slice(-50);
}

/**
 * Get recent decisions for a user.
 */
export function getRecentDecisions(userId: string, limit = 20): ExtractedDecision[] {
  const all = loadArray<ExtractedDecision>(userId, DECISIONS_KEY);
  return all.slice(-limit);
}

/**
 * Get recent commitments for a user.
 */
export function getRecentCommitments(userId: string, limit = 20): ExtractedCommitment[] {
  const all = loadArray<ExtractedCommitment>(userId, COMMITMENTS_KEY);
  return all.slice(-limit);
}

/**
 * Mark a task as done or cancelled.
 */
export function updateTaskStatus(
  userId: string,
  taskId: string,
  status: 'done' | 'cancelled',
): boolean {
  const all = loadArray<ExtractedTask>(userId, TASKS_KEY);
  const idx = all.findIndex(t => t.id === taskId);
  if (idx < 0) return false;
  all[idx].status = status;
  saveArray(userId, TASKS_KEY, all);
  return true;
}

/**
 * Get full intelligence summary for a user.
 */
export function getIntelligenceSummary(userId: string): {
  pendingTasks: number;
  recentDecisions: number;
  openCommitments: number;
  tasks: ExtractedTask[];
  decisions: ExtractedDecision[];
  commitments: ExtractedCommitment[];
} {
  const tasks = getPendingTasks(userId);
  const decisions = getRecentDecisions(userId, 10);
  const commitments = getRecentCommitments(userId, 10);

  return {
    pendingTasks: tasks.length,
    recentDecisions: decisions.length,
    openCommitments: commitments.filter(c => c.who === 'ai').length,
    tasks,
    decisions,
    commitments,
  };
}
