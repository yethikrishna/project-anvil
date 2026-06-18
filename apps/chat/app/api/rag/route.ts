/**
 * /api/rag — RAG (Retrieval-Augmented Generation) endpoint.
 *
 * Supports:
 *   POST /api/rag?action=index   — Index documents (emails, files, calendar events)
 *   POST /api/rag?action=search  — Hybrid semantic+BM25 search
 *   POST /api/rag?action=query   — RAG-augmented answer generation
 *   POST /api/rag?action=ingest  — Auto-ingest from Gmail/Drive (background)
 *   GET  /api/rag?action=stats   — Index statistics
 *   DELETE /api/rag              — Clear index
 *
 * This powers:
 * - "What did we decide about X?" → searches conversation history
 * - "Find emails about Y" → semantic email search
 * - "Summarize the Q3 documents" → RAG over indexed Drive files
 * - The memory_search_semantic tool in the AI's tool registry
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  indexDocuments,
  search,
  ragQuery,
  getIndexStats,
  clearIndex,
  type IndexableDoc,
} from '@/lib/rag-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── Action: stats ──

async function handleStats(): Promise<NextResponse> {
  const stats = getIndexStats();
  return NextResponse.json({ ok: true, stats });
}

// ── Action: index ──

async function handleIndex(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as {
    documents?: IndexableDoc[];
    userId?: string;
  };

  const docs = body.documents ?? [];
  if (docs.length === 0) {
    return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
  }

  const result = await indexDocuments(docs);
  return NextResponse.json({ ok: true, ...result });
}

// ── Action: search ──

async function handleSearch(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as {
    query: string;
    topK?: number;
    sourceFilter?: string;
    minScore?: number;
  };

  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const results = await search(body.query, {
    topK: body.topK ?? 8,
    sourceFilter: body.sourceFilter,
    minScore: body.minScore,
  });

  return NextResponse.json({ ok: true, query: body.query, results, count: results.length });
}

// ── Action: query (RAG-augmented generation) ──

async function handleQuery(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as {
    query: string;
    topK?: number;
    sourceFilter?: string;
    model?: string;
    maxTokens?: number;
    systemPromptExtra?: string;
  };

  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const answer = await ragQuery(body.query, {
    topK: body.topK,
    sourceFilter: body.sourceFilter,
    model: body.model,
    maxTokens: body.maxTokens,
    systemPromptExtra: body.systemPromptExtra,
  });

  return NextResponse.json({ ok: true, ...answer });
}

// ── Action: ingest (auto-pull from Gmail/Drive) ──

async function handleIngest(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as {
    userId?: string;
    sources?: Array<'gmail' | 'drive' | 'calendar'>;
    limit?: number;
  };

  const userId = body.userId ?? 'default';
  const sources = body.sources ?? ['gmail', 'drive'];
  const limit = body.limit ?? 20;

  const executor = getToolExecutor({ userId });
  const docsToIndex: IndexableDoc[] = [];

  // ── Ingest Gmail ──
  if (sources.includes('gmail')) {
    try {
      const rawMail = await executor.searchEmails('newer_than:7d', 'inbox', limit);
      let emails: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(rawMail);
        emails = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.emails) ? parsed.emails
          : Array.isArray(parsed?.messages) ? parsed.messages
          : [];
      } catch { /* skip */ }

      for (const email of emails.slice(0, limit)) {
        const id = String(email.id ?? email.messageId ?? `mail-${Date.now()}-${Math.random()}`);
        const subject = String(email.subject ?? '(no subject)');
        const from = String(email.from ?? email.sender ?? '');
        const snippet = String(email.snippet ?? email.body ?? email.content ?? '');
        const timestamp = email.date || email.receivedAt || email.timestamp;
        const ts = timestamp ? new Date(String(timestamp)).getTime() : Date.now();

        if (snippet.length < 20) continue;

        docsToIndex.push({
          id: `gmail:${id}`,
          title: subject,
          content: `From: ${from}\nSubject: ${subject}\n\n${snippet}`,
          source: 'gmail',
          author: from,
          timestamp: ts,
          metadata: { emailId: id, from, subject },
        });
      }
    } catch (err) {
      console.warn('[RAG ingest] Gmail fetch failed:', err);
    }
  }

  // ── Ingest Drive ──
  if (sources.includes('drive')) {
    try {
      const rawFiles = await executor.searchFiles('', 'any', limit);
      let files: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(rawFiles);
        files = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.files) ? parsed.files
          : [];
      } catch { /* skip */ }

      for (const file of files.slice(0, Math.min(limit, 10))) {
        const id = String(file.id ?? `drive-${Date.now()}`);
        const name = String(file.name ?? file.title ?? 'Untitled');
        const mimeType = String(file.mimeType ?? '');
        const modifiedAt = file.modifiedAt || file.modifiedTime;
        const ts = modifiedAt ? new Date(String(modifiedAt)).getTime() : Date.now();

        // Only index text-based files
        if (
          mimeType.includes('spreadsheet') ||
          mimeType.includes('video') ||
          mimeType.includes('image') ||
          mimeType.includes('audio')
        ) continue;

        // Try to read the file content
        let content = `File: ${name}`;
        try {
          const readResult = await executor.executeTool('file_read', { fileId: id, maxChars: 2000 });
          if (readResult.status === 'success') {
            const parsed = JSON.parse(readResult.result);
            const text = parsed.content ?? parsed.text ?? '';
            if (text.length > 50) content = `${name}\n\n${text}`;
          }
        } catch { /* skip if not readable */ }

        docsToIndex.push({
          id: `drive:${id}`,
          title: name,
          content,
          source: 'drive',
          timestamp: ts,
          metadata: { fileId: id, mimeType },
        });
      }
    } catch (err) {
      console.warn('[RAG ingest] Drive fetch failed:', err);
    }
  }

  // ── Ingest Calendar ──
  if (sources.includes('calendar')) {
    try {
      const today = new Date();
      const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const rawEvents = await executor.executeTool('calendar_get_events', {
        startDate: today.toISOString().slice(0, 10),
        endDate: nextMonth.toISOString().slice(0, 10),
        maxResults: 20,
      });

      let events: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(rawEvents.result);
        events = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.events) ? parsed.events
          : [];
      } catch { /* skip */ }

      for (const evt of events) {
        const id = String(evt.id ?? `cal-${Date.now()}`);
        const title = String(evt.title ?? evt.summary ?? 'Event');
        const startStr = String(evt.start ?? evt.startTime ?? '');
        const ts = startStr ? new Date(startStr).getTime() : Date.now();
        const attendees = Array.isArray(evt.attendees)
          ? evt.attendees.map((a: unknown) => typeof a === 'string' ? a : (a as Record<string, string>).email ?? '').join(', ')
          : '';
        const description = String(evt.description ?? evt.notes ?? '');

        docsToIndex.push({
          id: `cal:${id}`,
          title,
          content: `Event: ${title}\nDate: ${startStr}\nAttendees: ${attendees}\n${description}`,
          source: 'calendar',
          timestamp: ts,
          metadata: { eventId: id, startTime: startStr },
        });
      }
    } catch (err) {
      console.warn('[RAG ingest] Calendar fetch failed:', err);
    }
  }

  if (docsToIndex.length === 0) {
    return NextResponse.json({ ok: true, indexed: 0, chunks: 0, message: 'No content available to index' });
  }

  const result = await indexDocuments(docsToIndex);
  return NextResponse.json({
    ok: true,
    ...result,
    sources: sources.filter(s => docsToIndex.some(d => d.source === s)),
    message: `Indexed ${result.indexed} documents (${result.chunks} chunks) from ${sources.join(', ')}`,
  });
}

// ── Router ──

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'stats';

  if (action === 'stats') return handleStats();
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'search';

  switch (action) {
    case 'index':  return handleIndex(req);
    case 'search': return handleSearch(req);
    case 'query':  return handleQuery(req);
    case 'ingest': return handleIngest(req);
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  clearIndex();
  return NextResponse.json({ ok: true, message: 'Index cleared' });
}
