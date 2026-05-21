/**
 * @anvil/ai/tools — Mail Tools
 *
 * AI tool functions for email operations:
 * - Search emails by query, sender, date
 * - Draft replies with configurable tone
 * - Categorize emails (important, newsletter, social, promo)
 * - Thread summarization
 */

import { z } from 'zod';
import type { RegisteredTool, ToolResult, ToolContext } from './registry.js';
import type { ToolDefinition } from '../types.js';

// ── API Configuration ──────────────────────────────────

const GMAIL_API_BASE = process.env.ANVIL_GMAIL_API ?? 'http://localhost:3006/api';

// ── Input Schemas ──────────────────────────────────────

const SearchMailSchema = z.object({
  query: z.string().describe('Search query for subject, sender, or content'),
  folder: z.enum(['inbox', 'sent', 'drafts', 'spam', 'trash', 'all']).default('inbox'),
  limit: z.number().min(1).max(50).default(10),
  dateFrom: z.string().optional().describe('ISO date string for start of range'),
  dateTo: z.string().optional().describe('ISO date string for end of range'),
  sender: z.string().optional().describe('Filter by sender email or name'),
  hasAttachment: z.boolean().optional(),
  unreadOnly: z.boolean().optional().default(false),
});

const DraftReplySchema = z.object({
  messageId: z.string().describe('ID of the message to reply to'),
  body: z.string().describe('Reply body content'),
  tone: z.enum(['professional', 'friendly', 'concise', 'formal']).default('professional'),
  cc: z.string().optional().describe('CC recipients'),
  bcc: z.string().optional().describe('BCC recipients'),
  attachments: z.array(z.string()).optional().describe('File IDs to attach'),
});

const CategorizeMailSchema = z.object({
  messageIds: z.array(z.string()).min(1).max(100).describe('Email message IDs to categorize'),
  categories: z.array(z.string()).default(['important', 'newsletter', 'social', 'promotion', 'transaction', 'notification']).describe('Categories to classify into'),
});

const SummarizeThreadSchema = z.object({
  threadId: z.string().describe('Email thread ID to summarize'),
  maxLength: z.number().min(50).max(2000).default(500).describe('Max summary length in characters'),
});

const SendMailSchema = z.object({
  to: z.string().describe('Recipient email'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body'),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  replyToMessageId: z.string().optional().describe('Message ID to reply to'),
});

// ── Helper Functions ───────────────────────────────────

async function gmailFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    context: ToolContext;
    params?: Record<string, string>;
  },
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = new URL(`${GMAIL_API_BASE}${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.context.authToken) {
    headers['Authorization'] = `Bearer ${options.context.authToken}`;
  }

  try {
    const resp = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await resp.json();
    return { ok: resp.ok, data, status: resp.status };
  } catch (err) {
    return {
      ok: false,
      data: { error: err instanceof Error ? err.message : 'Network error' },
      status: 0,
    };
  }
}

/**
 * Simple email categorization based on sender patterns and headers.
 */
function categorizeEmail(email: {
  from?: string;
  subject?: string;
  headers?: Record<string, string>;
}): string {
  const from = (email.from ?? '').toLowerCase();
  const subject = (email.subject ?? '').toLowerCase();

  // Newsletter patterns
  if (
    from.includes('newsletter') ||
    from.includes('noreply') ||
    subject.startsWith('[newsletter]') ||
    subject.includes('unsubscribe')
  ) {
    return 'newsletter';
  }

  // Social
  if (
    from.includes('facebook') || from.includes('twitter') || from.includes('linkedin') ||
    from.includes('instagram') || from.includes('slack') || from.includes('discord')
  ) {
    return 'social';
  }

  // Promotion
  if (
    subject.includes('% off') || subject.includes('deal') || subject.includes('sale') ||
    subject.includes('offer') || subject.includes('discount') || subject.includes('coupon') ||
    from.includes('promo') || from.includes('marketing')
  ) {
    return 'promotion';
  }

  // Transaction
  if (
    subject.includes('receipt') || subject.includes('invoice') || subject.includes('order') ||
    subject.includes('payment') || subject.includes('confirmation') || subject.includes('shipped')
  ) {
    return 'transaction';
  }

  // Notification
  if (
    from.includes('notification') || from.includes('alert') || from.includes('noreply') ||
    subject.includes('notification') || subject.includes('alert')
  ) {
    return 'notification';
  }

  return 'important';
}

// ── Tool Definitions ───────────────────────────────────

export const SEARCH_MAIL_DEF: ToolDefinition = {
  name: 'mail_search',
  description: 'Search the user\'s email inbox by query, sender, date range, or content keywords. Returns matching email summaries.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query for subject, sender, or content' },
      folder: { type: 'string', enum: ['inbox', 'sent', 'drafts', 'spam', 'trash', 'all'], description: 'Mailbox folder (default: inbox)' },
      limit: { type: 'number', description: 'Max results (default: 10, max: 50)' },
      dateFrom: { type: 'string', description: 'Start date (ISO format)' },
      dateTo: { type: 'string', description: 'End date (ISO format)' },
      sender: { type: 'string', description: 'Filter by sender' },
      unreadOnly: { type: 'boolean', description: 'Only unread emails' },
    },
    required: ['query'],
  },
};

export const DRAFT_REPLY_DEF: ToolDefinition = {
  name: 'mail_draft_reply',
  description: 'Draft a reply to an email with configurable tone. The draft is saved but not sent.',
  parameters: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'ID of the message to reply to' },
      body: { type: 'string', description: 'Reply body content' },
      tone: { type: 'string', enum: ['professional', 'friendly', 'concise', 'formal'], description: 'Reply tone' },
      cc: { type: 'string', description: 'CC recipients' },
    },
    required: ['messageId', 'body'],
  },
};

export const CATEGORIZE_MAIL_DEF: ToolDefinition = {
  name: 'mail_categorize',
  description: 'Categorize emails into types: important, newsletter, social, promotion, transaction, notification.',
  parameters: {
    type: 'object',
    properties: {
      messageIds: { type: 'array', items: { type: 'string' }, description: 'Email IDs to categorize' },
      categories: { type: 'array', items: { type: 'string' }, description: 'Category labels to use' },
    },
    required: ['messageIds'],
  },
};

export const SUMMARIZE_THREAD_DEF: ToolDefinition = {
  name: 'mail_summarize_thread',
  description: 'Summarize an email thread into key points and action items.',
  parameters: {
    type: 'object',
    properties: {
      threadId: { type: 'string', description: 'Thread ID to summarize' },
      maxLength: { type: 'number', description: 'Max summary length in characters' },
    },
    required: ['threadId'],
  },
};

export const SEND_MAIL_DEF: ToolDefinition = {
  name: 'mail_send',
  description: 'Send an email. Requires confirmation before sending.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Email body' },
      cc: { type: 'string', description: 'CC recipients' },
      replyToMessageId: { type: 'string', description: 'Message ID being replied to' },
    },
    required: ['to', 'subject', 'body'],
  },
};

// ── Registered Tools ───────────────────────────────────

export const mailSearchTool: RegisteredTool = {
  name: 'mail_search',
  definition: SEARCH_MAIL_DEF,
  category: 'mail',
  risk: 'low',
  description: 'Search emails by query, sender, or date',
  inputSchema: SearchMailSchema,
  execute: async (params, context) => {
    const { query, folder, limit, dateFrom, dateTo, sender, unreadOnly } = params;
    const startTime = Date.now();

    const searchParams: Record<string, string> = {
      q: query,
      folder,
      limit: String(limit),
    };
    if (dateFrom) searchParams.dateFrom = dateFrom;
    if (dateTo) searchParams.dateTo = dateTo;
    if (sender) searchParams.sender = sender;
    if (unreadOnly) searchParams.unreadOnly = 'true';

    const { ok, data } = await gmailFetch('/messages/search', { context, params: searchParams });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : `Gmail search failed`,
      durationMs: Date.now() - startTime,
    };
  },
};

export const mailDraftReplyTool: RegisteredTool = {
  name: 'mail_draft_reply',
  definition: DRAFT_REPLY_DEF,
  category: 'mail',
  risk: 'medium',
  description: 'Draft a reply to an email (saved, not sent)',
  inputSchema: DraftReplySchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await gmailFetch('/messages/draft', {
      method: 'POST',
      context,
      body: {
        replyToId: params.messageId,
        body: params.body,
        tone: params.tone,
        cc: params.cc,
        bcc: params.bcc,
      },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to save draft',
      durationMs: Date.now() - startTime,
    };
  },
};

export const mailCategorizeTool: RegisteredTool = {
  name: 'mail_categorize',
  definition: CATEGORIZE_MAIL_DEF,
  category: 'mail',
  risk: 'low',
  description: 'Categorize emails by type',
  inputSchema: CategorizeMailSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    // Fetch email metadata
    const results: Record<string, string> = {};

    for (const id of params.messageIds) {
      const { ok, data } = await gmailFetch(`/messages/${id}`, { context });
      if (ok && data && typeof data === 'object') {
        const email = data as { from?: string; subject?: string };
        results[id] = categorizeEmail(email);
      } else {
        results[id] = 'unknown';
      }
    }

    return {
      success: true,
      data: JSON.stringify(results),
      durationMs: Date.now() - startTime,
    };
  },
};

export const mailSummarizeThreadTool: RegisteredTool = {
  name: 'mail_summarize_thread',
  definition: SUMMARIZE_THREAD_DEF,
  category: 'mail',
  risk: 'low',
  description: 'Summarize an email thread',
  inputSchema: SummarizeThreadSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await gmailFetch(`/messages/thread/${params.threadId}`, { context });

    if (!ok) {
      return {
        success: false,
        data: '',
        error: 'Failed to fetch thread',
        durationMs: Date.now() - startTime,
      };
    }

    // Extract thread messages and create a simple summary
    const thread = data as { messages?: Array<{ from: string; date: string; snippet: string }> };
    const messages = thread.messages ?? [];

    if (messages.length === 0) {
      return {
        success: true,
        data: 'Empty thread — no messages found.',
        durationMs: Date.now() - startTime,
      };
    }

    const summary = `Thread with ${messages.length} message(s):\n` +
      messages.map((m, i) => `${i + 1}. From: ${m.from} — ${m.snippet.slice(0, 100)}`).join('\n');

    return {
      success: true,
      data: summary.slice(0, params.maxLength),
      durationMs: Date.now() - startTime,
    };
  },
};

export const mailSendTool: RegisteredTool = {
  name: 'mail_send',
  definition: SEND_MAIL_DEF,
  category: 'mail',
  risk: 'high',
  description: 'Send an email (requires confirmation)',
  inputSchema: SendMailSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await gmailFetch('/messages/send', {
      method: 'POST',
      context,
      body: {
        to: params.to,
        subject: params.subject,
        body: params.body,
        cc: params.cc,
        bcc: params.bcc,
        replyToId: params.replyToMessageId,
      },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to send email',
      durationMs: Date.now() - startTime,
    };
  },
  authorize: (context) => {
    // Only authenticated users can send emails
    return !!context.authToken;
  },
};

/**
 * All mail tools for registration.
 */
export const MAIL_TOOLS: RegisteredTool[] = [
  mailSearchTool,
  mailDraftReplyTool,
  mailCategorizeTool,
  mailSummarizeThreadTool,
  mailSendTool,
];
