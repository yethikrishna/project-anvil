/**
 * Docs AI API — Unified endpoint for all AI-powered document features.
 *
 * POST /api/ai
 * Body: { action: string, payload: any }
 *
 * Actions:
 *   rewrite     — Rewrite selected text (shorter/formal/casual/fix-grammar)
 *   draft       — Generate document from description
 *   research    — Query workspace docs, return results with citations
 *   suggest     — Get inline suggestion for current position
 *   title       — Auto-generate document title
 *   summary     — Auto-generate document summary
 *   translate   — Translate text to target language
 *   template    — Generate smart template content
 *   continue    — Continue writing from cursor position
 *   explain     — Explain selected text in plain language
 *   improve     — Improve clarity and flow of selected text
 *   assistant   — Document-aware AI assistant Q&A
 *   toc         — Generate table of contents from document
 */

import {createAI} from '@anvil/ai';

// ── AI Setup ──

function getAI() {
  return createAI({
    provider: (process.env.AI_PROVIDER as 'openai' | 'ollama') || 'ollama',
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3',
  });
}

// ── Request / Response Types ──

interface AIRequest {
  action: 'rewrite' | 'draft' | 'research' | 'suggest' | 'title' | 'summary' | 'translate' | 'template' | 'continue' | 'explain' | 'improve' | 'assistant' | 'toc' | 'version-diff';
  payload: Record<string, unknown>;
}

// ── Action Handlers ──

async function handleRewrite(ai: ReturnType<typeof getAI>, payload: {
  text: string;
  mode: 'shorter' | 'formal' | 'casual' | 'fix-grammar' | 'longer' | 'bullet-points';
  context?: string;
}): Promise<{ text: string }> {
  const modeInstructions: Record<string, string> = {
    'shorter': 'Make the following text more concise while preserving all key information. Reduce word count by ~40%.',
    'formal': 'Rewrite the following text in a formal, professional tone suitable for business communication.',
    'casual': 'Rewrite the following text in a casual, friendly tone. Keep it natural and conversational.',
    'fix-grammar': 'Fix any grammar, spelling, punctuation, or style errors in the following text. Preserve the original meaning and tone.',
    'longer': 'Expand the following text with more detail, examples, and explanation. Add ~50% more content while staying relevant.',
    'bullet-points': 'Convert the following text into clear, well-structured bullet points.',
  };

  const instruction = modeInstructions[payload.mode] || modeInstructions['fix-grammar'];
  const contextPrompt = payload.context ? `\n\nDocument context for reference:\n${payload.context.slice(0, 1000)}` : '';

  const result = await ai.generate([
    {role: 'system', content: 'You are an expert writing assistant. Follow instructions precisely. Output ONLY the rewritten text with no commentary, explanations, or markdown formatting around it.'},
    {role: 'user', content: `${instruction}${contextPrompt}\n\nText to rewrite:\n${payload.text}`},
  ], {temperature: 0.3, maxTokens: 2000});

  return {text: result.text.trim()};
}

async function handleDraft(ai: ReturnType<typeof getAI>, payload: {
  description: string;
  documentType?: string;
  tone?: string;
  context?: string;
}): Promise<{ html: string }> {
  const docType = payload.documentType || 'general';
  const tone = payload.tone || 'professional';

  const result = await ai.generate([
    {role: 'system', content: `You are an expert document writer. Generate well-structured HTML content.
Rules:
- Output valid HTML (h1-h3, p, ul, ol, li, strong, em, blockquote, code)
- Match the requested tone: ${tone}
- Be substantive — real content, not placeholders
- Use proper headings and formatting
- No CSS, no body/html tags, just the content HTML`},
    {role: 'user', content: `Write a ${docType} document based on this description:\n\n${payload.description}${payload.context ? `\n\nAdditional context:\n${payload.context.slice(0, 2000)}` : ''}`},
  ], {temperature: 0.5, maxTokens: 4000});

  return {html: result.text.trim()};
}

async function handleResearch(ai: ReturnType<typeof getAI>, payload: {
  query: string;
  workspaceDocs?: Array<{id: string; title: string; content: string}>;
}): Promise<{ results: Array<{text: string; source: string; citation: string; relevance: number}> }> {
  // Search workspace docs
  const docs = payload.workspaceDocs || [];
  const query = payload.query.toLowerCase();

  // Simple relevance scoring
  const scored = docs.map(doc => {
    const content = `${doc.title} ${doc.content}`.toLowerCase();
    const queryTerms = query.split(/\s+/).filter(t => t.length > 2);
    let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = content.match(regex);
      if (matches) score += matches.length;
      if (doc.title.toLowerCase().includes(term)) score += 3;
    }
    return {...doc, score};
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

  if (scored.length === 0) {
    // Use AI to generate a helpful response when no docs match
    const result = await ai.generate([
      {role: 'system', content: 'You are a research assistant. Provide a concise, factual answer to the query. Include key points that could be cited. Format as structured text.'},
      {role: 'user', content: `Research query: ${query}`},
    ], {temperature: 0.3, maxTokens: 1500});

    return {
      results: [{
        text: result.text.trim(),
        source: 'AI Knowledge',
        citation: 'AI-generated response',
        relevance: 0.5,
      }],
    };
  }

  // Use AI to synthesize findings from matched docs
  const contextBlock = scored.map((d, i) => `[Source ${i + 1}: "${d.title}"]\n${d.content.slice(0, 500)}`).join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: 'Synthesize research results. For each finding, cite the source number. Be concise and factual.'},
    {role: 'user', content: `Query: ${query}\n\nSources:\n${contextBlock}`},
  ], {temperature: 0.2, maxTokens: 2000});

  return {
    results: scored.map((d, i) => ({
      text: d.content.slice(0, 300),
      source: d.title,
      citation: `[${i + 1}] ${d.title}`,
      relevance: Math.min(d.score / 10, 1),
    })),
  };
}

async function handleSuggest(ai: ReturnType<typeof getAI>, payload: {
  textBefore: string;
  textAfter: string;
  documentContext?: string;
}): Promise<{ suggestion: string }> {
  const context = payload.documentContext?.slice(-500) || '';
  const before = payload.textBefore.slice(-200);
  const after = payload.textAfter.slice(0, 200);

  const result = await ai.generate([
    {role: 'system', content: `You are an intelligent writing assistant. Given the text before and after the cursor position, suggest what should come next.
Rules:
- Output ONLY the suggested continuation text
- Keep suggestions to 1-3 sentences maximum
- Match the tone and style of surrounding text
- Be natural and contextually appropriate
- Do not repeat text that already exists`},
    {role: 'user', content: `Document context: ${context}\n\nText before cursor: "${before}"\nText after cursor: "${after}"`},
  ], {temperature: 0.4, maxTokens: 200});

  return {suggestion: result.text.trim()};
}

async function handleTitle(ai: ReturnType<typeof getAI>, payload: {
  content: string;
  currentTitle?: string;
}): Promise<{ title: string; summary: string }> {
  const contentPreview = payload.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);

  const result = await ai.generate([
    {role: 'system', content: `Generate a document title and a one-sentence summary.
Output as JSON: {"title": "...", "summary": "..."}
- Title: concise, descriptive, 3-8 words, no quotes
- Summary: one sentence, captures the key topic`},
    {role: 'user', content: `Document content:\n${contentPreview}${payload.currentTitle ? `\n\nCurrent title (improve if needed): ${payload.currentTitle}` : ''}`},
  ], {temperature: 0.3, maxTokens: 200});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: try to extract from text
    const lines = result.text.split('\n').filter(l => l.trim());
    return {
      title: lines[0]?.replace(/^["']/, '').replace(/["']$/, '') || 'Untitled Document',
      summary: lines.slice(1).join(' ').slice(0, 150) || 'No summary available',
    };
  }
}

async function handleSummary(ai: ReturnType<typeof getAI>, payload: {
  content: string;
}): Promise<{ summary: string }> {
  const text = payload.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);

  const result = await ai.generate([
    {role: 'system', content: 'Summarize the following document in 2-3 concise sentences. Focus on the main topic, key points, and any conclusions or action items.'},
    {role: 'user', content: text},
  ], {temperature: 0.2, maxTokens: 300});

  return {summary: result.text.trim()};
}

async function handleTranslate(ai: ReturnType<typeof getAI>, payload: {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  preserveFormatting?: boolean;
}): Promise<{ translatedText: string }> {
  const source = payload.sourceLanguage ? ` from ${payload.sourceLanguage}` : '';
  const fmtNote = payload.preserveFormatting ? ' Preserve all HTML formatting tags exactly as they are.' : '';

  const result = await ai.generate([
    {role: 'system', content: `You are a professional translator. Translate the following text${source} into ${payload.targetLanguage}.${fmtNote}\nOutput ONLY the translated text, no commentary.`},
    {role: 'user', content: payload.text},
  ], {temperature: 0.2, maxTokens: 4000});

  return {translatedText: result.text.trim()};
}

async function handleTemplate(ai: ReturnType<typeof getAI>, payload: {
  type: string;
  description?: string;
  context?: string;
}): Promise<{ html: string; suggestedTitle: string }> {
  const templatePrompts: Record<string, string> = {
    'proposal': 'a comprehensive project proposal with executive summary, objectives, methodology, timeline, budget, and expected outcomes',
    'meeting-notes': 'structured meeting notes with attendees, agenda, discussion points, decisions made, and action items with owners',
    'report': 'a detailed analytical report with executive summary, findings, data analysis, recommendations, and conclusion',
    'memo': 'a professional business memo with clear purpose, background, main points, and call to action',
    'blog-post': 'an engaging blog post with catchy intro, well-structured body with subheadings, and compelling conclusion',
    'letter': 'a formal business letter with proper formatting',
    'presentation-notes': 'speaker notes for a presentation with slide-by-slide breakdown',
  };

  const templateDesc = templatePrompts[payload.type] || `a professional ${payload.type} document`;
  const userDesc = payload.description ? `\n\nSpecific requirements: ${payload.description}` : '';
  const ctx = payload.context ? `\n\nContext: ${payload.context.slice(0, 1000)}` : '';

  const result = await ai.generate([
    {role: 'system', content: `Generate ${templateDesc} as well-structured HTML.
Rules:
- Valid HTML only: h1-h3, p, ul, ol, li, strong, em, blockquote, table, th, td, tr
- Be specific and substantive — real content, not placeholders
- Include realistic data where appropriate
- Proper formatting and sections
- Also suggest a document title on the first line as: <!-- TITLE: Your Title Here -->`},
    {role: 'user', content: `Generate ${templateDesc}.${userDesc}${ctx}`},
  ], {temperature: 0.5, maxTokens: 4000});

  // Extract title from comment
  const titleMatch = result.text.match(/<!-- TITLE: (.+?) -->/);
  const html = result.text.replace(/<!-- TITLE: .+? -->\n?/, '').trim();
  const suggestedTitle = titleMatch?.[1] || `${payload.type.charAt(0).toUpperCase() + payload.type.slice(1)}`;

  return {html, suggestedTitle};
}

async function handleContinue(ai: ReturnType<typeof getAI>, payload: {
  textBefore: string;
  documentContext?: string;
}): Promise<{text: string}> {
  const context = payload.documentContext?.slice(-500) || '';
  const before = payload.textBefore.slice(-400);

  const result = await ai.generate([
    {role: 'system', content: `You are a writing assistant. Continue the text naturally from where it left off.
Rules:
- Output ONLY the continuation text
- Match the writing style, tone, and voice of the existing text
- Continue for 2-4 sentences
- Do not repeat what was already written
- Be contextually appropriate given the document topic`},
    {role: 'user', content: `Document context: ${context}\n\nText so far (continue from here): "${before}"`},
  ], {temperature: 0.4, maxTokens: 400});

  return {text: result.text.trim()};
}

async function handleExplain(ai: ReturnType<typeof getAI>, payload: {
  text: string;
  context?: string;
}): Promise<{explanation: string}> {
  const ctx = payload.context ? `\n\nDocument context: ${payload.context.slice(0, 1000)}` : '';

  const result = await ai.generate([
    {role: 'system', content: 'Explain the following text in simple, clear language that anyone can understand. Use analogies where helpful. Keep it concise — 2-4 sentences.'},
    {role: 'user', content: `Explain this text:${ctx}\n\n"${payload.text}"`},
  ], {temperature: 0.3, maxTokens: 500});

  return {explanation: result.text.trim()};
}

async function handleImprove(ai: ReturnType<typeof getAI>, payload: {
  text: string;
  context?: string;
}): Promise<{text: string}> {
  const contextPrompt = payload.context ? `\n\nDocument context for reference:\n${payload.context.slice(0, 1000)}` : '';

  const result = await ai.generate([
    {role: 'system', content: `You are an expert writing editor. Improve the following text by:
- Enhancing clarity and readability
- Improving sentence structure and flow
- Strengthening word choice
- Removing redundancy
- Maintaining the original meaning and tone
Output ONLY the improved text with no commentary.`},
    {role: 'user', content: `Improve this text:${contextPrompt}\n\n${payload.text}`},
  ], {temperature: 0.3, maxTokens: 2000});

  return {text: result.text.trim()};
}

async function handleTOC(ai: ReturnType<typeof getAI>, payload: {
  content: string;
}): Promise<{html: string}> {
  const text = payload.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const result = await ai.generate([
    {role: 'system', content: `Generate a table of contents for this document.
Rules:
- Output as an HTML ordered list: <ol><li><a href="#section-id">Section Title</a></li></ol>
- Use proper nesting for subsections with <ol> inside <li>
- Include a heading: <h2>Table of Contents</h2>
- Only include major sections (h2 and h3 level)`},
    {role: 'user', content: text.slice(0, 4000)},
  ], {temperature: 0.1, maxTokens: 500});

  return {html: result.text.trim()};
}

async function handleVersionDiff(ai: ReturnType<typeof getAI>, payload: {
  fromSummary: string;
  toSummary: string;
  fromWordCount: number;
  toWordCount: number;
  fromChanges?: string[];
  toChanges?: string[];
}): Promise<{summary: string; additions: number; deletions: number; sectionChanges: Array<{sectionTitle: string; type: string; description: string}>}> {
  const result = await ai.generate([
    {role: 'system', content: `Compare two document versions and summarize the changes.
Output JSON: {"summary": "human-readable summary", "additions": N, "deletions": N, "sectionChanges": [{"sectionTitle": "...", "type": "added|modified|removed", "description": "..."}]}
Keep the summary concise (2-3 sentences). Focus on what actually changed, not just word counts.`},
    {role: 'user', content: `Version A (${payload.fromWordCount} words): ${payload.fromSummary}\nChanges: ${(payload.fromChanges || []).join(', ') || 'initial version'}\n\nVersion B (${payload.toWordCount} words): ${payload.toSummary}\nChanges: ${(payload.toChanges || []).join(', ')}`},
  ], {temperature: 0.2, maxTokens: 400});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const diff = payload.toWordCount - payload.fromWordCount;
    return {
      summary: `Document updated. ${diff > 0 ? `Added ${diff} words` : diff < 0 ? `Removed ${Math.abs(diff)} words` : 'Word count unchanged'}.`,
      additions: Math.max(0, diff),
      deletions: Math.max(0, -diff),
      sectionChanges: [],
    };
  }
}

async function handleAssistant(ai: ReturnType<typeof getAI>, payload: {
  question: string;
  documentContent: string;
  conversationHistory?: Array<{role: string; content: string}>;
}): Promise<{response: string; actions?: Array<{label: string; type: string; payload: Record<string, unknown>}>}> {
  const history = payload.conversationHistory || [];
  const systemPrompt = `You are an intelligent document assistant. You help the user with their document by answering questions, making suggestions, and offering actions.

Current document content:
"""
${payload.documentContent.slice(0, 3000)}
"""

Rules:
- Be concise and specific to the document
- If you suggest an edit, describe it clearly
- If the user asks about the document, reference specific sections
- Offer actionable suggestions when possible
- Keep responses under 200 words`;

  const messages: Array<{role: string; content: string}> = [
    {role: 'system', content: systemPrompt},
    ...history.slice(-4).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.content})),
    {role: 'user', content: payload.question},
  ];

  const result = await ai.generate(messages as any, {temperature: 0.3, maxTokens: 500});

  return {response: result.text.trim()};
}

// ── Route Handler ──

export async function POST(request: Request) {
  try {
    const body = await request.json() as AIRequest;
    const ai = getAI();

    switch (body.action) {
      case 'rewrite':
        return Response.json(await handleRewrite(ai, body.payload as any));
      case 'draft':
        return Response.json(await handleDraft(ai, body.payload as any));
      case 'research':
        return Response.json(await handleResearch(ai, body.payload as any));
      case 'suggest':
        return Response.json(await handleSuggest(ai, body.payload as any));
      case 'title':
        return Response.json(await handleTitle(ai, body.payload as any));
      case 'summary':
        return Response.json(await handleSummary(ai, body.payload as any));
      case 'translate':
        return Response.json(await handleTranslate(ai, body.payload as any));
      case 'template':
        return Response.json(await handleTemplate(ai, body.payload as any));
      case 'continue':
        return Response.json(await handleContinue(ai, body.payload as any));
      case 'explain':
        return Response.json(await handleExplain(ai, body.payload as any));
      case 'improve':
        return Response.json(await handleImprove(ai, body.payload as any));
      case 'assistant':
        return Response.json(await handleAssistant(ai, body.payload as any));
      case 'toc':
        return Response.json(await handleTOC(ai, body.payload as any));
      case 'version-diff':
        return Response.json(await handleVersionDiff(ai, body.payload as any));
      default:
        return Response.json({error: `Unknown action: ${body.action}`}, {status: 400});
    }
  } catch (error) {
    console.error('Docs AI error:', error);
    const message = error instanceof Error ? error.message : 'AI processing failed';
    return Response.json({error: message}, {status: 500});
  }
}
