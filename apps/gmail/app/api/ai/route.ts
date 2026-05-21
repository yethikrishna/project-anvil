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
}): Promise<{summary: string; keyPoints: string[]; actionItems: string[]; sentiment: string}> {
  const threadText = payload.messages
    .map((m, i) => `[Message ${i + 1}] From: ${m.from} (${m.date})\n${m.body}`)
    .join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Analyze this email thread and provide:
1. A 2-3 sentence summary of the thread
2. Key discussion points (as a JSON array of strings)
3. Action items or to-dos mentioned (as a JSON array)
4. Overall sentiment: positive, neutral, negative, or urgent

Output as JSON: {"summary": "...", "keyPoints": [...], "actionItems": [...], "sentiment": "..."}`},
    {role: 'user', content: `Thread subject: ${payload.subject}\n\n${threadText}`},
  ], {temperature: 0.2, maxTokens: 1000});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {summary: result.text.slice(0, 300), keyPoints: [], actionItems: [], sentiment: 'neutral'};
  }
}

// ── AI Compose ──

async function handleCompose(ai: ReturnType<typeof getAI>, payload: {
  threadMessages: Array<{from: string; body: string}>;
  subject: string;
  intent?: string;
  writingStyle?: string;
}): Promise<{draft: string; tone: string}> {
  const threadContext = payload.threadMessages
    .map(m => `${m.from}: ${m.body.slice(0, 200)}`)
    .join('\n');

  const intent = payload.intent || 'reply';
  const style = payload.writingStyle || 'professional and concise';

  const result = await ai.generate([
    {role: 'system', content: `You are an email composer. Write a ${intent} email that is ${style}.
Rules:
- Be natural and contextually appropriate
- Reference specific points from the thread when relevant
- Don't be overly formal unless the thread warrants it
- Keep it concise — aim for 3-5 sentences for replies
- Output ONLY the email body, no subject line or signature`},
    {role: 'user', content: `Thread: ${payload.subject}\n\n${threadContext}\n\nWrite a ${intent}.`},
  ], {temperature: 0.4, maxTokens: 800});

  return {draft: result.text.trim(), tone: style};
}

// ── Unread Digest ──

async function handleDigest(ai: ReturnType<typeof getAI>, payload: {
  unreadEmails: Array<{from: string; subject: string; body: string; date: string}>;
}): Promise<{digest: string; categories: Record<string, string[]>; priorities: string[]}> {
  const emailList = payload.unreadEmails
    .map(e => `- From: ${e.from} | Subject: ${e.subject} | Preview: ${e.body.slice(0, 100)}`)
    .join('\n');

  const result = await ai.generate([
    {role: 'system', content: `Create a concise email digest from these unread emails.
Output JSON:
{
  "digest": "2-3 sentence overview of what's new",
  "categories": {"Action Needed": ["subject1"], "FYI": ["subject2"], "Updates": ["subject3"]},
  "priorities": ["Most urgent subject", "Second priority"]
}`},
    {role: 'user', content: `${payload.unreadEmails.length} unread emails:\n\n${emailList}`},
  ], {temperature: 0.2, maxTokens: 1500});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {digest: result.text.slice(0, 500), categories: {}, priorities: []};
  }
}

// ── Semantic Search ──

async function handleSemanticSearch(ai: ReturnType<typeof getAI>, payload: {
  query: string;
  emails: Array<{id: string; from: string; subject: string; body: string}>;
}): Promise<{results: Array<{id: string; relevance: number; reason: string}>}> {
  // Use AI for semantic understanding
  const emailPreviews = payload.emails
    .map((e, i) => `[${i}] From: ${e.from} | ${e.subject}: ${e.body.slice(0, 150)}`)
    .join('\n');

  const result = await ai.generate([
    {role: 'system', content: `Given the query, find the most relevant emails. Output JSON array:
[{"index": 0, "relevance": 0.9, "reason": "why it matches"}]
Max 10 results. Only include emails with relevance > 0.3.`},
    {role: 'user', content: `Query: "${payload.query}"\n\nEmails:\n${emailPreviews}`},
  ], {temperature: 0.1, maxTokens: 1500});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      results: parsed.map((r: any) => ({
        id: payload.emails[r.index]?.id || '',
        relevance: r.relevance || 0.5,
        reason: r.reason || '',
      })),
    };
  } catch {
    return {results: []};
  }
}

// ── LLM Classification ──

async function handleClassify(ai: ReturnType<typeof getAI>, payload: {
  subject: string;
  from: string;
  bodyPreview: string;
  categories: string[];
}): Promise<{category: string; confidence: number; reasoning: string; subCategory?: string; priority?: string}> {
  const result = await ai.generate([
    {role: 'system', content: `Classify this email into exactly one of these categories: ${payload.categories.join(', ')}.
Also determine:
- Sub-category (dev-tools, newsletter, transaction, social, calendar, education, health, finance, travel, general)
- Priority (low, medium, high, urgent)

Output JSON: {"category": "...", "confidence": 0.9, "reasoning": "...", "subCategory": "...", "priority": "..."}`},
    {role: 'user', content: `From: ${payload.from}\nSubject: ${payload.subject}\nBody preview: ${payload.bodyPreview}`},
  ], {temperature: 0.1, maxTokens: 300});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {category: 'primary', confidence: 0.4, reasoning: 'LLM parse error, fallback'};
  }
}

// ── Email Embeddings ──

async function handleEmbedEmails(ai: ReturnType<typeof getAI>, payload: {
  emails: Array<{id: string; text: string}>;
}): Promise<{embeddings: Array<{id: string; embedding: number[]; text: string}>}> {
  const results: Array<{id: string; embedding: number[]; text: string}> = [];

  for (const email of payload.emails) {
    try {
      const emb = await ai.embed(email.text.slice(0, 500));
      results.push({
        id: email.id,
        embedding: emb.vector,
        text: email.text.slice(0, 200),
      });
    } catch {
      // Skip emails that fail to embed
    }
  }

  return {embeddings: results};
}

// ── Compose Email with Style ──

async function handleComposeEmail(ai: ReturnType<typeof getAI>, payload: {
  subject: string;
  recipientName: string;
  tone: string;
  length: string;
  threadContext?: string;
  styleProfile?: {avgSentenceLength: number; formality: string; commonGreetings: string[]; commonClosings: string[]; avgEmailLength: number};
  keyPoints?: string[];
  intent?: string;
}): Promise<{html: string; suggestedSubject?: string}> {
  const toneGuide: Record<string, string> = {
    professional: 'Professional and respectful. Use formal greetings and closings.',
    friendly: 'Warm and personable. Use first names and a conversational tone.',
    casual: 'Relaxed and informal. Short sentences, conversational.',
    direct: 'Concise and action-oriented. Get to the point quickly.',
    empathetic: 'Understanding and supportive. Acknowledge feelings.',
  };

  const lengthGuide: Record<string, string> = {
    brief: '2-3 sentences, max 75 words.',
    medium: '3-5 paragraphs, 150-250 words.',
    detailed: 'Comprehensive, 300-500 words with full context.',
  };

  const toneDesc = toneGuide[payload.tone] || toneGuide.professional;
  const lengthDesc = lengthGuide[payload.length] || lengthGuide.medium;

  let systemPrompt = `Write an email that is ${toneDesc}. Length: ${lengthDesc}.`;

  if (payload.styleProfile) {
    systemPrompt += `\nMatch this writing style:
- Average sentence length: ${payload.styleProfile.avgSentenceLength} words
- Formality level: ${payload.styleProfile.formality}
- Common greetings: ${payload.styleProfile.commonGreetings?.slice(0, 3).join(', ') || 'Hi'}
- Common closings: ${payload.styleProfile.commonClosings?.slice(0, 3).join(', ') || 'Best'}`;
  }

  systemPrompt += '\nOutput valid HTML (p, ul, ol, li, strong, em, br only). No subject line.';

  let userPrompt = `Write an email to ${payload.recipientName}.`;
  if (payload.subject) userPrompt += ` Subject: ${payload.subject}`;
  if (payload.threadContext) userPrompt += `\n\nThread context:\n${payload.threadContext}`;
  if (payload.keyPoints?.length) userPrompt += `\n\nKey points to address: ${payload.keyPoints.join('; ')}`;
  if (payload.intent) userPrompt += `\n\nIntent: ${payload.intent}`;

  const result = await ai.generate([
    {role: 'system', content: systemPrompt},
    {role: 'user', content: userPrompt},
  ], {temperature: 0.4, maxTokens: 1500});

  return {
    html: result.text.trim(),
    suggestedSubject: payload.subject ? undefined : `Re: ${payload.subject}`,
  };
}

// ── Improve Email ──

async function handleImproveEmail(ai: ReturnType<typeof getAI>, payload: {
  html: string;
  tone: string;
  styleProfile?: any;
  threadContext?: string;
}): Promise<{html: string; changes: string[]}> {
  const toneGuide: Record<string, string> = {
    professional: 'more professional and polished',
    friendly: 'warmer and more personable',
    casual: 'more relaxed and informal',
    direct: 'more concise and action-oriented',
    empathetic: 'more understanding and supportive',
  };

  const result = await ai.generate([
    {role: 'system', content: `Improve this email draft to be ${toneGuide[payload.tone] || 'better'}.
Rules:
- Fix any grammar or clarity issues
- Improve flow and readability
- Keep the same core message
- Output ONLY the improved HTML (p, ul, ol, li, strong, em, br)
- Then on a new line output: CHANGES: comma-separated list of what you changed`},
    {role: 'user', content: payload.html},
  ], {temperature: 0.3, maxTokens: 1500});

  const text = result.text.trim();
  const changesMatch = text.match(/CHANGES:\s*(.+)/);
  const html = text.replace(/CHANGES:\s*.+/, '').trim();
  const changes = changesMatch?.[1]?.split(',').map(c => c.trim()) || [];

  return {html, changes};
}

// ── Route Handler ──

export async function POST(request: Request) {
  try {
    const body = await request.json() as {action: string; payload: Record<string, unknown>};
    const ai = getAI();

    switch (body.action) {
      case 'summarize-thread':
        return Response.json(await handleThreadSummary(ai, body.payload as any));
      case 'compose':
        return Response.json(await handleCompose(ai, body.payload as any));
      case 'compose-email':
        return Response.json(await handleComposeEmail(ai, body.payload as any));
      case 'improve-email':
        return Response.json(await handleImproveEmail(ai, body.payload as any));
      case 'digest':
        return Response.json(await handleDigest(ai, body.payload as any));
      case 'semantic-search':
        return Response.json(await handleSemanticSearch(ai, body.payload as any));
      case 'classify':
        return Response.json(await handleClassify(ai, body.payload as any));
      case 'embed-emails':
        return Response.json(await handleEmbedEmails(ai, body.payload as any));
      default:
        return Response.json({error: `Unknown action: ${body.action}`}, {status: 400});
    }
  } catch (error) {
    console.error('Mail AI error:', error);
    const message = error instanceof Error ? error.message : 'AI processing failed';
    return Response.json({error: message}, {status: 500});
  }
}
