/**
 * Enhanced Tool Executor — production-grade tool execution with:
 * - Auth forwarding from user session
 * - Retry with exponential backoff
 * - Structured error handling
 * - Tool result caching
 * - Agent runtime integration for autonomous actions
 */

import type { ToolCallResult } from './types';

// ── Configuration ──

const GMAIL_API = process.env.ANVIL_GMAIL_API ?? 'http://localhost:3006/api';
const DRIVE_API = process.env.ANVIL_DRIVE_API ?? 'http://localhost:3002/api';
const CALENDAR_API = process.env.ANVIL_CALENDAR_API ?? 'http://localhost:3007/api';
const DOCS_API = process.env.ANVIL_DOCS_API ?? 'http://localhost:3003/api';

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;
const CACHE_TTL_MS = 30_000; // 30s cache for search results

// ── Cache ──

const toolCache = new Map<string, { result: string; timestamp: number }>();

function cacheKey(tool: string, args: Record<string, unknown>): string {
  return `${tool}:${JSON.stringify(args)}`;
}

function getCached(tool: string, args: Record<string, unknown>): string | null {
  const key = cacheKey(tool, args);
  const cached = toolCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  toolCache.delete(key);
  return null;
}

function setCache(tool: string, args: Record<string, unknown>, result: string): void {
  const key = cacheKey(tool, args);
  toolCache.set(key, { result, timestamp: Date.now() });

  // Evict old entries if cache is large
  if (toolCache.size > 100) {
    const oldest = Array.from(toolCache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    for (let i = 0; i < 20; i++) {
      toolCache.delete(oldest[i][0]);
    }
  }
}

// ── HTTP helper with retry ──

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15_000), // 15s timeout
      });

      // Retry on 5xx
      if (res.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
        continue;
      }

      return res;
    } catch (err) {
      if (attempt < retries && err instanceof TypeError) {
        // Network error — retry
        await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Executor Config ──

export interface ToolExecutorConfig {
  authToken?: string;
  userId?: string;
}

// ── Tool Executor ──

class ToolExecutor {
  private token?: string;
  private userId?: string;

  constructor(config?: ToolExecutorConfig) {
    this.token = config?.authToken;
    this.userId = config?.userId;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    if (this.userId) h['X-User-Id'] = this.userId;
    return h;
  }

  // ── Email Tools ──

  async searchEmails(query: string, folder = 'inbox', limit = 10): Promise<string> {
    const cached = getCached('email_search', { query, folder, limit });
    if (cached) return cached;

    try {
      const res = await fetchWithRetry(
        `${GMAIL_API}/messages/search?q=${encodeURIComponent(query)}&folder=${folder}&limit=${limit}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      const data = await res.json();
      const result = JSON.stringify(data);
      setCache('email_search', { query, folder, limit }, result);
      return result;
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to search emails',
        message: err instanceof Error ? err.message : 'Unknown error',
        results: [],
      });
    }
  }

  async sendEmail(to: string, subject: string, body: string, cc?: string): Promise<string> {
    try {
      const res = await fetchWithRetry(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ to, subject, body, cc }),
      });
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      return JSON.stringify({ success: true, messageId: crypto.randomUUID() });
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to send email',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async getEmailThread(threadId: string): Promise<string> {
    try {
      const res = await fetchWithRetry(
        `${GMAIL_API}/messages/thread/${encodeURIComponent(threadId)}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      return JSON.stringify(await res.json());
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to get email thread',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async saveDraft(to: string, subject: string, body: string): Promise<string> {
    try {
      const res = await fetchWithRetry(`${GMAIL_API}/messages/draft`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ to, subject, body }),
      });
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      return JSON.stringify({ success: true, draftId: crypto.randomUUID() });
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to save draft',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // ── Drive Tools ──

  async searchFiles(query: string, fileType = 'any', limit = 10): Promise<string> {
    const cached = getCached('file_search', { query, fileType, limit });
    if (cached) return cached;

    try {
      const res = await fetchWithRetry(
        `${DRIVE_API}/files/search?q=${encodeURIComponent(query)}&type=${fileType}&limit=${limit}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`Drive API: ${res.status}`);
      const data = await res.json();
      const result = JSON.stringify(data);
      setCache('file_search', { query, fileType, limit }, result);
      return result;
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to search files',
        message: err instanceof Error ? err.message : 'Unknown error',
        results: [],
      });
    }
  }

  async readFile(fileId: string, format = 'text'): Promise<string> {
    try {
      const res = await fetchWithRetry(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?format=${format}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`Drive API: ${res.status}`);
      return JSON.stringify(await res.json());
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to read file',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async createShareLink(fileId: string, public_ = true): Promise<string> {
    try {
      const res = await fetchWithRetry(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/share`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ public: public_ }),
      });
      if (!res.ok) throw new Error(`Drive API: ${res.status}`);
      return JSON.stringify(await res.json());
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to create share link',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // ── Docs Tools ──

  async writeDocument(title: string, content: string, documentId?: string): Promise<string> {
    try {
      const url = documentId
        ? `${DOCS_API}/documents/${encodeURIComponent(documentId)}`
        : `${DOCS_API}/documents`;
      const res = await fetchWithRetry(url, {
        method: documentId ? 'PUT' : 'POST',
        headers: this.headers(),
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) throw new Error(`Docs API: ${res.status}`);
      return JSON.stringify(await res.json());
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to write document',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // ── Calendar Tools ──

  async createEvent(
    title: string, startTime: string, endTime: string,
    attendees?: string[], description?: string,
  ): Promise<string> {
    try {
      const res = await fetchWithRetry(`${CALENDAR_API}/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          title,
          start: startTime,
          end: endTime,
          attendees,
          description,
        }),
      });
      if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
      return JSON.stringify(await res.json());
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to create event',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async getCalendarEvents(from: string, to: string): Promise<string> {
    const cached = getCached('calendar_events', { from, to });
    if (cached) return cached;

    try {
      const res = await fetchWithRetry(
        `${CALENDAR_API}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
      const data = await res.json();
      const result = JSON.stringify(data);
      setCache('calendar_events', { from, to }, result);
      return result;
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to get calendar events',
        message: err instanceof Error ? err.message : 'Unknown error',
        events: [],
      });
    }
  }

  async checkAvailability(from: string, to: string): Promise<string> {
    try {
      const res = await fetchWithRetry(
        `${CALENDAR_API}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
      return JSON.stringify(await res.json());
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to check availability',
        message: err instanceof Error ? err.message : 'Unknown error',
        slots: [],
      });
    }
  }

  // ── Web Search ──

  async webSearch(query: string, limit = 5): Promise<string> {
    const cached = getCached('web_search', { query, limit });
    if (cached) return cached;

    try {
      const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
      const headers: Record<string, string> = {
        'Accept-Encoding': 'gzip',
        'Accept': 'application/json',
      };
      if (braveApiKey) {
        headers['X-Subscription-Token'] = braveApiKey;
      }

      const res = await fetchWithRetry(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
        { headers },
      );
      if (!res.ok) throw new Error(`Search API: ${res.status}`);
      const data = await res.json();
      const result = JSON.stringify(data.web?.results?.slice(0, limit) ?? []);
      setCache('web_search', { query, limit }, result);
      return result;
    } catch (err) {
      return JSON.stringify({
        error: 'Failed to search the web',
        message: err instanceof Error ? err.message : 'Unknown error',
        results: [],
      });
    }
  }

  // ── Unified dispatcher ──

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const startTime = Date.now();
    const id = crypto.randomUUID();
    let result: string;
    let status: 'success' | 'error' = 'success';

    try {
      switch (name) {
        case 'email_search':
          result = await this.searchEmails(
            String(args.query ?? ''), String(args.folder ?? 'inbox'), Number(args.limit ?? 10),
          );
          break;
        case 'email_send':
          result = await this.sendEmail(
            String(args.to ?? ''), String(args.subject ?? ''), String(args.body ?? ''),
            args.cc ? String(args.cc) : undefined,
          );
          break;
        case 'email_read_thread':
          result = await this.getEmailThread(String(args.thread_id ?? ''));
          break;
        case 'email_save_draft':
          result = await this.saveDraft(
            String(args.to ?? ''), String(args.subject ?? ''), String(args.body ?? ''),
          );
          break;
        case 'file_search':
          result = await this.searchFiles(
            String(args.query ?? ''), String(args.file_type ?? 'any'), Number(args.limit ?? 10),
          );
          break;
        case 'file_read':
          result = await this.readFile(String(args.file_id ?? ''), String(args.format ?? 'text'));
          break;
        case 'file_share':
          result = await this.createShareLink(String(args.file_id ?? ''));
          break;
        case 'document_write':
          result = await this.writeDocument(
            String(args.title ?? ''), String(args.content ?? ''),
            args.document_id ? String(args.document_id) : undefined,
          );
          break;
        case 'calendar_create_event':
          result = await this.createEvent(
            String(args.title ?? ''), String(args.start_time ?? ''), String(args.end_time ?? ''),
            args.attendees as string[] | undefined,
            args.description ? String(args.description) : undefined,
          );
          break;
        case 'calendar_check_availability':
          result = await this.checkAvailability(
            String(args.from ?? ''), String(args.to ?? ''),
          );
          break;
        case 'web_search':
          result = await this.webSearch(String(args.query ?? ''), Number(args.limit ?? 5));
          break;
        default:
          result = JSON.stringify({ error: `Unknown tool: ${name}` });
          status = 'error';
      }
    } catch (err) {
      result = JSON.stringify({
        error: err instanceof Error ? err.message : 'Tool execution failed',
      });
      status = 'error';
    }

    return {
      id,
      tool: name,
      args,
      result,
      status,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute multiple tools in sequence with output piping.
   */
  async executeChain(
    steps: Array<{ tool: string; args: Record<string, unknown> }>,
    onProgress?: (step: number, result: ToolCallResult) => void,
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const result = await this.executeTool(steps[i].tool, steps[i].args);
      results.push(result);
      onProgress?.(i, result);

      if (result.status === 'error') break;
    }

    return results;
  }
}

// ── Singleton ──

let executor: ToolExecutor | null = null;

export function getToolExecutor(config?: ToolExecutorConfig): ToolExecutor {
  if (!executor || config?.authToken) {
    executor = new ToolExecutor(config);
  }
  return executor;
}

export { ToolExecutor };
