/**
 * POST /api/tasks/extract — AI-powered task extraction from emails + conversations.
 *
 * Given a source (email thread, conversation messages, or raw text),
 * uses the LLM to extract actionable tasks with:
 * - Priority scoring (1-5)
 * - Due date inference
 * - Assignee detection
 * - Category tagging
 * - Dependency detection
 *
 * Returns structured task list ready for display or calendar injection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';

export interface ExtractedTask {
  id: string;
  title: string;
  description?: string;
  priority: 1 | 2 | 3 | 4 | 5;   // 5 = urgent
  dueDate?: string;                  // ISO 8601 or natural language
  dueDateConfidence: 'explicit' | 'inferred' | 'none';
  assignee?: string;                 // email or name
  source: 'email' | 'conversation' | 'document' | 'calendar';
  sourceRef?: string;                // threadId, convId, fileId, eventId
  category: 'communication' | 'meeting' | 'document' | 'research' | 'decision' | 'other';
  dependencies?: string[];           // other task IDs this depends on
  blocking?: boolean;                // blocks other work
  context: string;                   // why this matters, brief
}

interface ExtractRequest {
  source: 'email_thread' | 'conversation' | 'raw_text';
  threadId?: string;       // for email_thread
  messages?: Array<{ role: string; content: string }>; // for conversation
  text?: string;           // for raw_text
  userId?: string;
  limit?: number;          // max tasks to extract (default 10)
}

const EXTRACT_SYSTEM_PROMPT = `You are an expert at extracting actionable tasks from communications.

Extract ONLY concrete, actionable items — not vague mentions or hypotheticals.

PRIORITY SCALE:
5 = Urgent/blocking (deadline today or tomorrow, someone waiting on this)
4 = High (deadline this week, or explicitly flagged as important)
3 = Medium (deadline next 2 weeks, or clearly needed but not urgent)
2 = Low (nice to have, no clear deadline)
1 = Someday/maybe (mentioned in passing, no clear owner or timeline)

For each task, also:
- Infer due dates from phrases like "by end of week", "ASAP", "by Monday", "Q3"
- Detect assignees from "you need to", "can you", "I'll", "team should"
- Categorize: communication (emails/replies), meeting (scheduling/attending), document (writing/reviewing), research (finding/analyzing), decision (choosing/approving), other
- Flag dependencies: "after you review", "once we have X"
- Flag blocking items: anything prefaced with "we can't proceed until", "blocked by"

Return a JSON array. Each item:
{
  "title": "short imperative verb phrase (max 60 chars)",
  "description": "why it matters, 1 sentence",
  "priority": 1-5,
  "dueDate": "ISO date string or null",
  "dueDateConfidence": "explicit|inferred|none",
  "assignee": "email or name or null",
  "category": "communication|meeting|document|research|decision|other",
  "dependencies": [],
  "blocking": false,
  "context": "1 sentence why this matters"
}

Return ONLY the JSON array. No markdown, no explanations.`;

export async function POST(req: NextRequest) {
  const body = await req.json() as ExtractRequest;
  const { source, threadId, messages, text, userId = 'default', limit = 10 } = body;

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  let inputText = '';

  if (source === 'email_thread' && threadId) {
    const tools = getToolExecutor({ userId });
    inputText = await tools.getEmailThread(threadId);
  } else if (source === 'conversation' && messages?.length) {
    inputText = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
      .join('\n\n');
  } else if (source === 'raw_text' && text) {
    inputText = text;
  } else {
    return NextResponse.json({ error: 'Invalid source or missing content' }, { status: 400 });
  }

  if (!inputText.trim()) {
    return NextResponse.json({ tasks: [] });
  }

  const raw = await engine.quickGenerate(
    EXTRACT_SYSTEM_PROMPT + `\n\nExtract at most ${limit} tasks, prioritized by importance.`,
    `CONTENT TO ANALYZE:\n\n${inputText.slice(0, 12000)}`,
  );

  let tasks: ExtractedTask[] = [];
  try {
    const parsed = JSON.parse(raw.trim());
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    tasks = arr.slice(0, limit).map((t, i) => ({
      id: crypto.randomUUID(),
      title: String(t.title ?? 'Untitled task').slice(0, 80),
      description: t.description ? String(t.description).slice(0, 200) : undefined,
      priority: [1, 2, 3, 4, 5].includes(Number(t.priority)) ? Number(t.priority) as 1|2|3|4|5 : 3,
      dueDate: t.dueDate ?? undefined,
      dueDateConfidence: (['explicit', 'inferred', 'none'].includes(t.dueDateConfidence)
        ? t.dueDateConfidence : 'none') as ExtractedTask['dueDateConfidence'],
      assignee: t.assignee ?? undefined,
      source: (source === 'email_thread' ? 'email' : source === 'raw_text' ? 'document' : 'conversation') as ExtractedTask['source'],
      sourceRef: threadId,
      category: (['communication','meeting','document','research','decision','other'].includes(t.category)
        ? t.category : 'other') as ExtractedTask['category'],
      dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
      blocking: Boolean(t.blocking),
      context: String(t.context ?? '').slice(0, 200),
    }));
  } catch {
    // If JSON parse fails, try to extract array from text
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        tasks = arr.slice(0, limit).map((t: Record<string, unknown>, _i: number) => ({
          id: crypto.randomUUID(),
          title: String(t.title ?? 'Untitled task'),
          priority: 3 as const,
          dueDate: undefined,
          dueDateConfidence: 'none' as const,
          source,
          category: 'other' as const,
          dependencies: [],
          blocking: false,
          context: String(t.context ?? ''),
        }));
      } catch { /* return empty */ }
    }
  }

  // Sort by priority desc, then blocking first
  tasks.sort((a, b) => {
    if (a.blocking && !b.blocking) return -1;
    if (!a.blocking && b.blocking) return 1;
    return b.priority - a.priority;
  });

  return NextResponse.json({ tasks, sourceLength: inputText.length });
}
