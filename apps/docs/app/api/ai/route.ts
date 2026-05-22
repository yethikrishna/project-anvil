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
  action: 'rewrite' | 'draft' | 'research' | 'suggest' | 'title' | 'summary' | 'translate' | 'template' | 'continue' | 'explain' | 'improve' | 'assistant' | 'toc' | 'version-diff' | 'smart-template' | 'grammar-check' | 'writing-coach' | 'semantic-find' | 'generate-outline';
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
}): Promise<{ results: Array<{text: string; source: string; citation: string; relevance: number}>; synthesis?: string }> {
  // Try RAG index first, fall back to simple scoring
  const docs = payload.workspaceDocs || [];
  const query = payload.query.toLowerCase();

  // Simple relevance scoring with TF-IDF style weighting
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'for', 'and', 'but', 'or', 'not', 'in', 'on', 'at', 'to', 'from', 'of', 'with', 'this', 'that', 'it']);
  const queryTerms = query.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t));

  const scored = docs.map(doc => {
    const content = `${doc.title} ${doc.content}`.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = content.match(regex);
      if (matches) score += matches.length;
      if (doc.title.toLowerCase().includes(term)) score += 5;
    }
    // Normalize by doc length to avoid bias toward long docs
    const wordCount = content.split(/\s+/).length;
    const normalizedScore = score / Math.log(Math.max(wordCount, 10));
    return {...doc, score: normalizedScore, rawScore: score};
  }).filter(d => d.rawScore > 0).sort((a, b) => b.score - a.score).slice(0, 5);

  if (scored.length === 0) {
    // Use AI to generate a helpful response when no docs match
    const result = await ai.generate([
      {role: 'system', content: 'You are a research assistant. Provide a concise, factual answer to the query with specific, citable points. Format as structured text with numbered findings.'},
      {role: 'user', content: `Research query: ${query}`},
    ], {temperature: 0.3, maxTokens: 1500});

    return {
      results: [{
        text: result.text.trim(),
        source: 'AI Knowledge Base',
        citation: 'AI-generated synthesis',
        relevance: 0.5,
      }],
      synthesis: result.text.trim(),
    };
  }

  // Use AI to synthesize findings from matched docs with citation awareness
  const contextBlock = scored.map((d, i) => `[Source ${i + 1}: "${d.title}"]\n${d.content.slice(0, 800)}`).join('\n\n');

  const result = await ai.generate([
    {role: 'system', content: `Synthesize research from these workspace documents.
Cite sources as [1], [2], etc.
Provide:
1. A brief synthesis paragraph
2. Key findings with citations
3. Any gaps or areas for further research
Be specific and factual. Don't hallucinate facts not in the sources.`},
    {role: 'user', content: `Query: ${query}\n\nWorkspace sources:\n${contextBlock}`},
  ], {temperature: 0.2, maxTokens: 2000});

  return {
    results: scored.map((d, i) => ({
      text: d.content.slice(0, 400),
      source: d.title,
      citation: `[${i + 1}] ${d.title}`,
      relevance: Math.min(d.rawScore / 10, 1),
    })),
    synthesis: result.text.trim(),
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

async function handleGrammarCheck(ai: ReturnType<typeof getAI>, payload: {text: string}): Promise<{issues: Array<{from: number; to: number; type: string; severity: string; message: string; replacement: string | null}>}> {
  const result = await ai.generate([
    {role: 'system', content: `You are a grammar and style checker. Analyze the text and return a JSON array of issues.
Each issue: {"from": number, "to": number, "type": "spelling|grammar|punctuation|style|clarity", "severity": "error|warning|info", "message": "description", "replacement": "fixed text or null"}
Rules:
- Only flag real issues, not stylistic preferences
- Provide replacements when obvious
- Use character offsets relative to the start of the text
- Return ONLY the JSON array, no markdown fences`},
    {role: 'user', content: payload.text.slice(0, 5000)},
  ], {temperature: 0.1, maxTokens: 2000});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return {issues: JSON.parse(cleaned)};
  } catch {
    return {issues: []};
  }
}

async function handleSmartTemplate(ai: ReturnType<typeof getAI>, payload: {
  type: string;
  description: string;
  tone?: string;
  language?: string;
  length?: string;
  context?: string;
}): Promise<{html: string; suggestedTitle: string; suggestedTags: string[]; estimatedReadTime: number; wordCount: number}> {
  const lengthGuide = payload.length === 'brief' ? 'Keep it concise (200-400 words)' :
    payload.length === 'detailed' ? 'Be comprehensive (800-1500 words)' :
    'Moderate length (400-800 words)';

  const tone = payload.tone || 'professional';
  const language = payload.language || 'English';
  const context = payload.context ? `\nAdditional context: ${payload.context.slice(0, 500)}` : '';

  const templatePrompts: Record<string, string> = {
    'proposal': 'a comprehensive project proposal with executive summary, objectives, methodology, timeline, budget, expected outcomes, and success metrics',
    'meeting-notes': 'structured meeting notes with attendees, agenda, discussion points, decisions, and action items with owners and deadlines',
    'weekly-report': 'a weekly status report with completed items, in-progress work, blockers, next week plans, and key metrics',
    'blog-post': 'an engaging blog post with a hook intro, well-structured body with subheadings, examples, and a compelling conclusion',
    'letter': 'a formal business letter with proper salutation, body paragraphs, and closing',
    'memo': 'a professional memo with clear purpose, background context, key points, and call to action',
    'research-paper': 'a research paper outline with abstract, introduction, literature review, methodology, results, discussion, and conclusion sections',
    'presentation': 'presentation speaker notes with slide-by-slide breakdown including talking points and transitions',
    'swot-analysis': 'a SWOT analysis with Strengths, Weaknesses, Opportunities, and Threats organized in a structured format with actionable insights',
    'project-charter': 'a project charter with purpose, scope, objectives, stakeholders, milestones, risks, and governance structure',
    'sop': 'a standard operating procedure with purpose, scope, prerequisites, step-by-step instructions, and quality checks',
    'custom': 'a custom document',
  };

  const templateDesc = templatePrompts[payload.type] || templatePrompts['custom'];

  const result = await ai.generate([
    {role: 'system', content: `Generate ${templateDesc} based on the user's description.
Tone: ${tone}. Language: ${language}. ${lengthGuide}.
Rules:
- Valid HTML only: h1-h3, p, ul, ol, li, strong, em, blockquote, table, th, td, tr, hr
- Be specific and substantive — real content, not placeholder text like [Enter details here]
- Include realistic data, examples, and specifics
- Proper formatting and logical structure
- First line MUST be a comment with the suggested title: <!-- TITLE: Your Title Here -->
- Second line MUST be a comment with suggested tags: <!-- TAGS: tag1, tag2, tag3 -->`},
    {role: 'user', content: `Generate ${templateDesc}.\nUser's description: ${payload.description}${context}`},
  ], {temperature: 0.5, maxTokens: 4000});

  // Extract metadata from comments
  const titleMatch = result.text.match(/<!-- TITLE: (.+?) -->/);
  const tagsMatch = result.text.match(/<!-- TAGS: (.+?) -->/);
  const html = result.text
    .replace(/<!-- TITLE: .+? -->\n?/, '')
    .replace(/<!-- TAGS: .+? -->\n?/, '')
    .trim();

  const wordCount = html.replace(/<[^>]+>/g, '').split(/\s+/).filter(w => w.length > 0).length;

  return {
    html,
    suggestedTitle: titleMatch?.[1] || `${payload.type.charAt(0).toUpperCase() + payload.type.slice(1)} Document`,
    suggestedTags: tagsMatch?.[1]?.split(',').map(t => t.trim()) || [],
    estimatedReadTime: Math.ceil(wordCount / 200),
    wordCount,
  };
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

// ── Generate Outline ──

async function handleGenerateOutline(ai: ReturnType<typeof getAI>, payload: {
  text: string;
  docType: string;
  currentHeadings: string;
}): Promise<{outline: any[]; suggestedTitle?: string; missingSections: string[]}> {
  const result = await ai.generate([
    {role: 'system', content: `You are a document structure expert. Given document text and its type, create an optimal outline.
Output JSON: {"outline": [{"level": 1|2|3, "title": "string"}], "suggestedTitle": "string", "missingSections": ["string"]}
Guidelines: 5-12 sections, proper heading hierarchy, actionable section titles, identify 1-3 missing important sections.`},
    {role: 'user', content: `Document type: ${payload.docType}\n\nCurrent headings:\n${payload.currentHeadings || '(none)'}\n\nContent (excerpt):\n${payload.text.slice(0, 2500)}`},
  ], {temperature: 0.4, maxTokens: 800});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {outline: [], missingSections: []};
  }
}

// ── Semantic Find ──

async function handleSemanticFind(ai: ReturnType<typeof getAI>, payload: {
  query: string;
  sentences: string[];
}): Promise<{matches: Array<{index: number; score: number; reason: string}>}> {
  const sentenceList = payload.sentences
    .slice(0, 50)
    .map((s, i) => `${i}: ${s.trim().slice(0, 200)}`)
    .join('\n');

  const result = await ai.generate([
    {role: 'system', content: `You are a document search engine. Given a semantic query and a list of numbered sentences, return which sentences best match the query.
Output JSON: {"matches": [{"index": N, "score": 0.0-1.0, "reason": "short reason"}]}
Return up to 10 best matches sorted by score descending. Only include sentences with score >= 0.4.`},
    {role: 'user', content: `Query: "${payload.query}"\n\nSentences:\n${sentenceList}`},
  ], {temperature: 0.1, maxTokens: 600});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {matches: []};
  }
}

// ── Writing Coach (AI deep analysis) ──

async function handleWritingCoach(ai: ReturnType<typeof getAI>, payload: {
  text: string;
  docContext?: string;
}): Promise<{
  overallFeedback: string;
  strengths: string[];
  improvements: string[];
  rewriteSuggestion?: string;
}> {
  const result = await ai.generate([
    {role: 'system', content: `You are an expert writing coach. Analyze the provided text and give actionable feedback.
Output JSON:
{
  "overallFeedback": "2-3 sentence holistic assessment",
  "strengths": ["specific strength 1", "specific strength 2"],
  "improvements": ["specific improvement 1", "specific improvement 2", "specific improvement 3"],
  "rewriteSuggestion": "A rewritten version of the first sentence showing your suggestions in practice"
}`},
    {role: 'user', content: `Text to analyze:\n\n${payload.text.slice(0, 2000)}\n\n${payload.docContext ? `Document context:\n${payload.docContext.slice(0, 500)}` : ''}`},
  ], {temperature: 0.3, maxTokens: 600});

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      overallFeedback: result.text.slice(0, 300),
      strengths: [],
      improvements: [],
    };
  }
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
      case 'smart-template':
        return Response.json(await handleSmartTemplate(ai, body.payload as any));
      case 'grammar-check':
        return Response.json(await handleGrammarCheck(ai, body.payload as any));
      case 'writing-coach':
        return Response.json(await handleWritingCoach(ai, body.payload as any));
      case 'semantic-find':
        return Response.json(await handleSemanticFind(ai, body.payload as any));
      case 'generate-outline':
        return Response.json(await handleGenerateOutline(ai, body.payload as any));
      default:
        return Response.json({error: `Unknown action: ${body.action}`}, {status: 400});
    }
  } catch (error) {
    console.error('Docs AI error:', error);
    const message = error instanceof Error ? error.message : 'AI processing failed';
    return Response.json({error: message}, {status: 500});
  }
}
