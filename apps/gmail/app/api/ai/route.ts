/**
 * Mail AI API — Server-side AI operations for email.
 *
 * POST /api/ai
 * Actions:
 *   summarize-thread  — Generate AI thread summary
 *   compose            — AI compose with thread context + writing style
 *   digest             — Summarize all unread mail
 *   semantic-search    — AI-powered email search
 *   classify           — LLM-powered inbox categorization
 *   embed-emails       — Generate embeddings for email content
 *   extract-deadlines  — Extract deadlines, meetings, action items from emails
 *   learn-behavior     — Learn from user actions for smart filters
 *   generate-rules     — Generate smart filter rules from learned behavior
 *   match-style        — Analyze and return writing style profile
 */

import {createAI} from '@anvil/ai';

function getAI() {
  return createAI({
    provider: (process.env.AI_PROVIDER as 'openai' | 'ollama') || 'ollama',
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3',
  });
}

// ── Thread Summary ──

async function handleThreadSummary(ai: ReturnType<typeof getAI>, payload: {
  messages: Array<{from: string; body: string; date: string}>;
  subject: string;
}): Promise<{summary: string; keyPoints: string[]; actionItems: string[]; sentiment: string; deadlines: string[]; decisions: string[]}> {
  const threadText = payload.messages
    .map((m, i) => `[Message ${i + 1}] From: ${m.from} (${m.date})\n${m.body}`)
    .join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Analyze this email thread and provide:
1. A 2-3 sentence summary of the thread
2. Key discussion points (as a JSON array of strings)
3. Action items or to-dos mentioned (as a JSON array)
4. Overall sentiment: positive, neutral, negative, or urgent
5. Any deadlines or due dates mentioned (as a JSON array of strings)
6. Decisions that were made (as a JSON array of strings)

Output as JSON:
{
  "summary": "...",
  "keyPoints": ["..."],
  "actionItems": ["..."],
  "sentiment": "positive|neutral|negative|urgent",
  "deadlines": ["..."],
  "decisions": ["..."]
}`},
    {role: 'user', content: `Thread subject: ${payload.subject}\n\n${threadText}`},
  ], {temperature: 0.2, maxTokens: 1000});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      summary: result.text.slice(0, 300),
      keyPoints: [],
      actionItems: [],
      sentiment: 'neutral',
      deadlines: [],
      decisions: [],
    };
  }
}

// ── AI Compose ──

async function handleCompose(ai: ReturnType<typeof getAI>, payload: {
  threadMessages: Array<{from: string; body: string; date: string}>;
  subject: string;
  intent: 'reply' | 'new' | 'forward';
  writingStyle?: string;
  tone?: 'professional' | 'friendly' | 'casual' | 'direct' | 'empathetic';
  length?: 'brief' | 'medium' | 'detailed';
}): Promise<{draft: string; subjectSuggestion?: string}> {
  const threadContext = payload.threadMessages
    .slice(-5)
    .map((m, i) => `[${m.from}]: ${m.body}`)
    .join('\n');

  const tone = payload.tone || 'professional';
  const length = payload.length || 'medium';
  const styleHint = payload.writingStyle ? `\nMatch the user's writing style: ${payload.writingStyle}` : '';

  const lengthGuide = length === 'brief' ? '2-3 sentences' :
    length === 'detailed' ? '5-8 sentences with detail' : '3-5 sentences';

  const result = await ai.generate([
    {role: 'system', content: `You are composing a ${tone} email reply.
Thread context (for reference, do NOT quote directly):
${threadContext}
${styleHint}

Rules:
- Write ${lengthGuide}
- Be natural and specific
- Address the key points from the thread
- Include a proper greeting and sign-off matching the ${tone} tone
- Output the email body as plain text (no HTML)
- If the subject needs a Re: prefix, suggest it on the first line as: Subject: Re: ...`},
    {role: 'user', content: `Subject: ${payload.subject}\nIntent: ${payload.intent}\nCompose the email.`},
  ], {temperature: 0.4, maxTokens: 600});

  // Extract subject suggestion if present
  const subjectMatch = result.text.match(/^Subject: (.+?)$/m);
  const body = subjectMatch ? result.text.replace(/^Subject: .+?\n/, '').trim() : result.text.trim();

  return {
    draft: body,
    subjectSuggestion: subjectMatch?.[1],
  };
}

// ── Unread Digest ──

async function handleDigest(ai: ReturnType<typeof getAI>, payload: {
  unreadEmails: Array<{from: string; subject: string; body: string; date: string}>;
}): Promise<{
  digest: string;
  priorities: string[];
  actionItems: string[];
  deadlines: string[];
  categories: Record<string, string[]>;
}> {
  const emailList = payload.unreadEmails
    .slice(0, 30) // Limit to avoid context overflow
    .map((e, i) => `[${i + 1}] From: ${e.from}\nSubject: ${e.subject}\n${e.body.slice(0, 200)}`)
    .join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Analyze these unread emails and provide:
1. A 3-4 sentence digest summarizing the most important items
2. Priority list: the top 3-5 most important emails (by number reference)
3. Action items extracted from the emails
4. Deadlines or due dates mentioned
5. Categorize emails into: urgent, work, personal, newsletters, follow-up-needed

Output as JSON:
{
  "digest": "...",
  "priorities": ["[N] Subject — reason"],
  "actionItems": ["..."],
  "deadlines": ["..."],
  "categories": {
    "urgent": ["[N] Subject"],
    "work": ["[N] Subject"],
    "personal": ["[N] Subject"],
    "newsletters": ["[N] Subject"],
    "follow-up-needed": ["[N] Subject"]
  }
}`},
    {role: 'user', content: `Unread emails:\n\n${emailList}`},
  ], {temperature: 0.2, maxTokens: 1500});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      digest: result.text.slice(0, 500),
      priorities: [],
      actionItems: [],
      deadlines: [],
      categories: {},
    };
  }
}

// ── Semantic Search ──

async function handleSemanticSearch(ai: ReturnType<typeof getAI>, payload: {
  query: string;
  emails: Array<{id: string; from: string; subject: string; body: string}>;
}): Promise<{results: Array<{id: string; relevance: number; reason: string; snippet: string}>}> {
  const emailBlock = payload.emails
    .slice(0, 50)
    .map((e, i) => `[${i}] ID:${e.id} From:${e.from} Subject:${e.subject}\n${e.body.slice(0, 300)}`)
    .join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Search these emails for the query. Return matching emails with relevance scores.
Output JSON array: [{"id": "...", "relevance": 0.0-1.0, "reason": "why it matches", "snippet": "relevant excerpt"}]
Sort by relevance, max 10 results.`},
    {role: 'user', content: `Query: ${payload.query}\n\nEmails:\n${emailBlock}`},
  ], {temperature: 0.1, maxTokens: 2000});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {results: Array.isArray(parsed) ? parsed : parsed.results || []};
  } catch {
    return {results: []};
  }
}

// ── Classify Email ──

async function handleClassify(ai: ReturnType<typeof getAI>, payload: {
  emails: Array<{subject: string; from: string; body: string}>;
}): Promise<Array<{category: string; confidence: number; reasoning: string; priority: string}>> {
  const emailList = payload.emails
    .map((e, i) => `[${i}] From: ${e.from}\nSubject: ${e.subject}\n${e.body.slice(0, 300)}`)
    .join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Classify each email into one of: primary, updates, action-needed, fyi
Also assign priority: low, medium, high, urgent

Output JSON array: [{"category": "primary|updates|action-needed|fyi", "confidence": 0.0-1.0, "reasoning": "...", "priority": "low|medium|high|urgent"}]
Order matches input order.`},
    {role: 'user', content: emailList},
  ], {temperature: 0.1, maxTokens: 1000});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return payload.emails.map(() => ({
      category: 'primary',
      confidence: 0.5,
      reasoning: 'Classification failed',
      priority: 'medium',
    }));
  }
}

// ── Extract Deadlines & Events ──

async function handleExtractDeadlines(ai: ReturnType<typeof getAI>, payload: {
  emails: Array<{subject: string; from: string; body: string; date: string}>;
}): Promise<Array<{
  emailSubject: string;
  from: string;
  deadlines: string[];
  events: string[];
  actionItems: string[];
}>> {
  const emailBlock = payload.emails
    .map((e, i) => `[${i}] From: ${e.from} (${e.date})\nSubject: ${e.subject}\n${e.body.slice(0, 500)}`)
    .join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Extract deadlines, events, and action items from these emails.
Output JSON array, one per email:
[{
  "emailSubject": "...",
  "from": "...",
  "deadlines": ["deadline description with date"],
  "events": ["event with date/time"],
  "actionItems": ["action item description"]
}]
If nothing found for a category, use empty array.`},
    {role: 'user', content: emailBlock},
  ], {temperature: 0.1, maxTokens: 1500});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ── Learn Behavior ──

async function handleLearnBehavior(ai: ReturnType<typeof getAI>, payload: {
  actions: Array<{
    emailFrom: string;
    emailSubject: string;
    action: 'archive' | 'label' | 'star' | 'delete' | 'reply' | 'forward' | 'mark-read' | 'snooze';
    label?: string;
    timestamp: number;
  }>;
}): Promise<{
  patterns: Array<{
    description: string;
    fromPattern: string;
    suggestedAction: string;
    suggestedLabel?: string;
    confidence: number;
    supportingActions: number;
  }>;
}> {
  const actionLog = payload.actions
    .slice(-50)
    .map(a => `[${new Date(a.timestamp).toISOString()}] ${a.action} ${a.label ? `(${a.label})` : ''} — From: ${a.emailFrom}, Subject: ${a.emailSubject}`)
    .join('\n');

  const result = await ai.generate([
    {role: 'system', content: `Analyze these email actions and find behavioral patterns.
Output JSON: {"patterns": [{"description": "what the pattern is", "fromPattern": "email or domain pattern", "suggestedAction": "action", "suggestedLabel": "label or null", "confidence": 0.0-1.0, "supportingActions": N}]}
Find patterns like: always archives newsletters, labels work emails, stars from boss, etc.`},
    {role: 'user', content: actionLog},
  ], {temperature: 0.2, maxTokens: 800});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {patterns: []};
  }
}

// ── Generate Rules from Behavior ──

async function handleGenerateRules(ai: ReturnType<typeof getAI>, payload: {
  patterns: Array<{description: string; fromPattern: string; suggestedAction: string; suggestedLabel?: string; confidence: number}>;
  existingRules: Array<{name: string; conditions: string[]}>;
}): Promise<{
  rules: Array<{
    name: string;
    description: string;
    conditions: Array<{field: string; operator: string; value: string}>;
    actions: Array<{type: string; value?: string}>;
    confidence: number;
  }>;
}> {
  const patternDesc = payload.patterns.map(p =>
    `- ${p.description} (from: ${p.fromPattern}, action: ${p.suggestedAction}, confidence: ${p.confidence})`
  ).join('\n');

  const existingDesc = payload.existingRules.map(r =>
    `- ${r.name}: ${r.conditions.join(' AND ')}`
  ).join('\n') || 'No existing rules';

  const result = await ai.generate([
    {role: 'system', content: `Generate email filter rules based on learned behavioral patterns.
Avoid duplicating existing rules.

Output JSON: {"rules": [{"name": "short name", "description": "what it does", "conditions": [{"field": "from|subject|body", "operator": "contains|equals|starts-with", "value": "..."}], "actions": [{"type": "label|archive|star|mark-read|categorize", "value": "..."}], "confidence": 0.0-1.0}]}`},
    {role: 'user', content: `Behavioral patterns:\n${patternDesc}\n\nExisting rules:\n${existingDesc}`},
  ], {temperature: 0.2, maxTokens: 1000});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {rules: []};
  }
}

// ── Match Writing Style ──

async function handleMatchStyle(ai: ReturnType<typeof getAI>, payload: {
  sentEmails: Array<{to: string; subject: string; body: string}>;
}): Promise<{
  formalityScore: number;
  avgSentenceLength: number;
  preferredGreeting: string;
  preferredSignOff: string;
  commonPhrases: string[];
  tone: string;
  suggestions: string[];
}> {
  const emails = payload.sentEmails.slice(-20)
    .map(e => `To: ${e.to}\n${e.body}`)
    .join('\n---\n');

  const result = await ai.generate([
    {role: 'system', content: `Analyze the writing style of these sent emails.
Output JSON: {
  "formalityScore": 0.0-1.0,
  "avgSentenceLength": N,
  "preferredGreeting": "...",
  "preferredSignOff": "...",
  "commonPhrases": ["..."],
  "tone": "professional|friendly|casual|direct",
  "suggestions": ["style tip for composing"]
}`},
    {role: 'user', content: emails},
  ], {temperature: 0.1, maxTokens: 500});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      formalityScore: 0.5,
      avgSentenceLength: 15,
      preferredGreeting: 'Hi',
      preferredSignOff: 'Best',
      commonPhrases: [],
      tone: 'professional',
      suggestions: [],
    };
  }
}

// ── Attachment Summary ──

async function handleAttachmentSummary(ai: ReturnType<typeof getAI>, payload: {
  fileName: string;
  fileType: string;
  fileSize: string;
  emailContext: string;
}): Promise<{
  summary: string;
  keyPoints: string[];
  fileType: string;
  pageCount?: number;
  wordCount?: number;
  rowCount?: number;
}> {
  const ext = payload.fileName.split('.').pop()?.toUpperCase() || 'FILE';
  const isSpreadsheet = /xlsx?|csv|ods/i.test(payload.fileName);
  const isPDF = /pdf/i.test(payload.fileName);
  const isCode = /\.(js|ts|py|java|go|rs|cpp|c|cs|rb|php|sh|sql)$/i.test(payload.fileName);

  const prompt = isSpreadsheet
    ? `Summarize what this spreadsheet likely contains based on its name and the email context. Estimate row count. Output JSON: {"summary": "...", "keyPoints": ["..."], "fileType": "${ext}", "rowCount": N}`
    : isPDF
    ? `Summarize what this PDF document likely contains based on its name and email context. Estimate page count. Output JSON: {"summary": "...", "keyPoints": ["..."], "fileType": "${ext}", "pageCount": N, "wordCount": N}`
    : isCode
    ? `Summarize what this code file likely does based on its name and the email context. Output JSON: {"summary": "...", "keyPoints": ["..."], "fileType": "${ext}"}`
    : `Summarize what this file likely contains based on its name and email context. Output JSON: {"summary": "...", "keyPoints": ["..."], "fileType": "${ext}"}`;

  const result = await ai.generate([
    {role: 'system', content: prompt},
    {role: 'user', content: `File: ${payload.fileName} (${payload.fileSize})\nEmail context: ${payload.emailContext.slice(0, 500)}`},
  ], {temperature: 0.2, maxTokens: 400});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      summary: `${ext} file: ${payload.fileName} (${payload.fileSize})`,
      keyPoints: [],
      fileType: ext,
    };
  }
}

// ── Route Handler ──

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action: string;
      payload: Record<string, unknown>;
    };
    const ai = getAI();

    switch (body.action) {
      case 'summarize-thread':
        return Response.json(await handleThreadSummary(ai, body.payload as any));
      case 'compose':
        return Response.json(await handleCompose(ai, body.payload as any));
      case 'digest':
        return Response.json(await handleDigest(ai, body.payload as any));
      case 'semantic-search':
        return Response.json(await handleSemanticSearch(ai, body.payload as any));
      case 'classify':
        return Response.json(await handleClassify(ai, body.payload as any));
      case 'extract-deadlines':
        return Response.json(await handleExtractDeadlines(ai, body.payload as any));
      case 'learn-behavior':
        return Response.json(await handleLearnBehavior(ai, body.payload as any));
      case 'generate-rules':
        return Response.json(await handleGenerateRules(ai, body.payload as any));
      case 'match-style':
        return Response.json(await handleMatchStyle(ai, body.payload as any));
      case 'attachment-summary':
        return Response.json(await handleAttachmentSummary(ai, body.payload as any));
      default:
        return Response.json({error: `Unknown action: ${body.action}`}, {status: 400});
    }
  } catch (error) {
    console.error('Mail AI error:', error);
    const message = error instanceof Error ? error.message : 'AI processing failed';
    return Response.json({error: message}, {status: 500});
  }
}
