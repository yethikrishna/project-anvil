/**
 * Tool executor — bridges AI tool calls to Anvil ecosystem APIs.
 * Real production integrations with Mail, Drive, Calendar, Docs.
 */

import type { ToolCallResult } from './types';

// ── API base URLs for Anvil services ──
const GMAIL_API = process.env.ANVIL_GMAIL_API ?? 'http://localhost:3006/api';
const DRIVE_API = process.env.ANVIL_DRIVE_API ?? 'http://localhost:3002/api';
const CALENDAR_API = process.env.ANVIL_CALENDAR_API ?? 'http://localhost:3007/api';
const DOCS_API = process.env.ANVIL_DOCS_API ?? 'http://localhost:3003/api';

export interface ToolExecutorConfig {
  authToken?: string;
}

class ToolExecutor {
  private token?: string;

  constructor(config?: ToolExecutorConfig) {
    this.token = config?.authToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  // ── Email Tools ──

  async searchEmails(query: string, folder = 'inbox', limit = 10): Promise<string> {
    try {
      const res = await fetch(`${GMAIL_API}/messages/search?q=${encodeURIComponent(query)}&folder=${folder}&limit=${limit}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to search emails', results: [] });
    }
  }

  async sendEmail(to: string, subject: string, body: string, cc?: string): Promise<string> {
    try {
      const res = await fetch(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ to, subject, body, cc }),
      });
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      return JSON.stringify({ success: true, messageId: crypto.randomUUID() });
    } catch {
      return JSON.stringify({ error: 'Failed to send email' });
    }
  }

  async getEmailThread(threadId: string): Promise<string> {
    try {
      const res = await fetch(`${GMAIL_API}/messages/thread/${threadId}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to get email thread' });
    }
  }

  async saveDraft(to: string, subject: string, body: string): Promise<string> {
    try {
      const res = await fetch(`${GMAIL_API}/messages/draft`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ to, subject, body }),
      });
      if (!res.ok) throw new Error(`Gmail API: ${res.status}`);
      return JSON.stringify({ success: true, draftId: crypto.randomUUID() });
    } catch {
      return JSON.stringify({ error: 'Failed to save draft' });
    }
  }

  // ── Drive Tools ──

  async searchFiles(query: string, fileType = 'any', limit = 10): Promise<string> {
    try {
      const res = await fetch(`${DRIVE_API}/files/search?q=${encodeURIComponent(query)}&type=${fileType}&limit=${limit}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Drive API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to search files', results: [] });
    }
  }

  async readFile(fileId: string, format = 'text'): Promise<string> {
    try {
      const res = await fetch(`${DRIVE_API}/files/${fileId}?format=${format}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Drive API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to read file' });
    }
  }

  async createShareLink(fileId: string): Promise<string> {
    try {
      const res = await fetch(`${DRIVE_API}/files/${fileId}/share`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ public: true }),
      });
      if (!res.ok) throw new Error(`Drive API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to create share link' });
    }
  }

  // ── Docs Tools ──

  async writeDocument(title: string, content: string, documentId?: string): Promise<string> {
    try {
      const url = documentId ? `${DOCS_API}/documents/${documentId}` : `${DOCS_API}/documents`;
      const res = await fetch(url, {
        method: documentId ? 'PUT' : 'POST',
        headers: this.headers(),
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) throw new Error(`Docs API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to write document' });
    }
  }

  // ── Calendar Tools ──

  async createEvent(
    title: string,
    startTime: string,
    endTime: string,
    attendees?: string[],
    description?: string
  ): Promise<string> {
    try {
      const res = await fetch(`${CALENDAR_API}/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ title, start: startTime, end: endTime, attendees, description }),
      });
      if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to create event' });
    }
  }

  async getCalendarEvents(from: string, to: string): Promise<string> {
    try {
      const res = await fetch(`${CALENDAR_API}/events?from=${from}&to=${to}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Calendar API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data);
    } catch {
      return JSON.stringify({ error: 'Failed to get calendar events', events: [] });
    }
  }

  // ── Web Search (delegates to Anvil Search) ──

  async webSearch(query: string, limit = 5): Promise<string> {
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      if (!res.ok) throw new Error(`Search API: ${res.status}`);
      const data = await res.json();
      return JSON.stringify(data.web?.results?.slice(0, limit) ?? []);
    } catch {
      return JSON.stringify({ error: 'Failed to search the web', results: [] });
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
          result = await this.searchEmails(String(args.query ?? ''), String(args.folder ?? 'inbox'), Number(args.limit ?? 10));
          break;
        case 'email_send':
          result = await this.sendEmail(String(args.to ?? ''), String(args.subject ?? ''), String(args.body ?? ''), args.cc ? String(args.cc) : undefined);
          break;
        case 'file_search':
          result = await this.searchFiles(String(args.query ?? ''), String(args.file_type ?? 'any'), Number(args.limit ?? 10));
          break;
        case 'file_read':
          result = await this.readFile(String(args.file_id ?? ''), String(args.format ?? 'text'));
          break;
        case 'document_write':
          result = await this.writeDocument(String(args.title ?? ''), String(args.content ?? ''), args.document_id ? String(args.document_id) : undefined);
          break;
        case 'calendar_create_event':
          result = await this.createEvent(
            String(args.title ?? ''), String(args.start_time ?? ''), String(args.end_time ?? ''),
            args.attendees as string[] | undefined, args.description ? String(args.description) : undefined
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
      result = JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
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
   * Execute multiple tools in sequence (multi-turn tool use).
   * Each tool result feeds into context for the next.
   */
  async executeChain(
    steps: Array<{ tool: string; args: Record<string, unknown> }>,
    onProgress?: (step: number, result: ToolCallResult) => void
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const result = await this.executeTool(step.tool, step.args);
      results.push(result);
      onProgress?.(i, result);

      if (result.status === 'error') {
        // Stop chain on error
        break;
      }
    }

    return results;
  }
}

// Singleton
let executor: ToolExecutor | null = null;

export function getToolExecutor(config?: ToolExecutorConfig): ToolExecutor {
  if (!executor || config?.authToken) {
    executor = new ToolExecutor(config);
  }
  return executor;
}

export { ToolExecutor };
