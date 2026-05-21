/**
 * @anvil/ai/tools — Drive Tools
 *
 * AI tool functions for file/drive operations:
 * - Search files by name, type, content
 * - Read file contents with format conversion
 * - Summarize documents
 * - Share files / create links
 */

import { z } from 'zod';
import type { RegisteredTool, ToolResult, ToolContext } from './registry.js';
import type { ToolDefinition } from '../types.js';

// ── API Configuration ──────────────────────────────────

const DRIVE_API_BASE = process.env.ANVIL_DRIVE_API ?? 'http://localhost:3002/api';

// ── Input Schemas ──────────────────────────────────────

const SearchFilesSchema = z.object({
  query: z.string().describe('Search query — file name, content keywords'),
  fileType: z.enum(['document', 'spreadsheet', 'presentation', 'image', 'pdf', 'video', 'audio', 'folder', 'any']).default('any'),
  limit: z.number().min(1).max(50).default(10),
  ownerId: z.string().optional().describe('Filter by file owner'),
  modifiedAfter: z.string().optional().describe('ISO date — modified after'),
  modifiedBefore: z.string().optional().describe('ISO date — modified before'),
  folder: z.string().optional().describe('Limit to folder ID'),
});

const ReadFileSchema = z.object({
  fileId: z.string().describe('File ID to read'),
  format: z.enum(['text', 'markdown', 'json', 'html']).default('text'),
  maxLength: z.number().min(100).max(50000).default(10000).describe('Max content length'),
  page: z.number().optional().describe('Page number for paginated content'),
});

const SummarizeFileSchema = z.object({
  fileId: z.string().describe('File ID to summarize'),
  maxLength: z.number().min(50).max(2000).default(500),
  focus: z.enum(['overview', 'key-points', 'action-items', 'detailed']).default('overview'),
});

const ShareFileSchema = z.object({
  fileId: z.string().describe('File ID to share'),
  public: z.boolean().default(false).describe('Make publicly accessible'),
  expiryHours: z.number().optional().describe('Link expiry in hours'),
  recipients: z.array(z.string()).optional().describe('Email addresses to share with'),
  role: z.enum(['viewer', 'editor', 'commenter']).default('viewer'),
});

const CreateFolderSchema = z.object({
  name: z.string().describe('Folder name'),
  parentId: z.string().optional().describe('Parent folder ID'),
});

const MoveFilesSchema = z.object({
  fileIds: z.array(z.string()).min(1).describe('File IDs to move'),
  destinationFolderId: z.string().describe('Destination folder ID'),
});

// ── Helper ─────────────────────────────────────────────

async function driveFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    context: ToolContext;
    params?: Record<string, string>;
  },
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = new URL(`${DRIVE_API_BASE}${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.context.authToken) headers['Authorization'] = `Bearer ${options.context.authToken}`;

  try {
    const resp = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await resp.json();
    return { ok: resp.ok, data, status: resp.status };
  } catch (err) {
    return { ok: false, data: { error: err instanceof Error ? err.message : 'Network error' }, status: 0 };
  }
}

/**
 * Extractive summarization of text content.
 */
function extractiveSummary(text: string, maxLen: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  if (sentences.length <= 3) return text.slice(0, maxLen);

  // Score sentences by word frequency
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const maxFreq = Math.max(...freq.values(), 1);

  const scored = sentences.map((sentence, idx) => {
    const sentWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    let score = sentWords.reduce((sum, w) => sum + (freq.get(w) ?? 0) / maxFreq, 0) / Math.max(sentWords.length, 1);
    if (idx === 0) score *= 1.5; // First sentence bonus
    return { sentence, score };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, 5);
  const summary = top.map(s => s.sentence).join(' ');
  return summary.slice(0, maxLen);
}

// ── Tool Definitions ───────────────────────────────────

export const SEARCH_FILES_DEF: ToolDefinition = {
  name: 'drive_search',
  description: 'Search for files in the user\'s Drive by name, type, content, or date.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      fileType: { type: 'string', enum: ['document', 'spreadsheet', 'presentation', 'image', 'pdf', 'video', 'audio', 'folder', 'any'] },
      limit: { type: 'number', description: 'Max results (default: 10)' },
      modifiedAfter: { type: 'string', description: 'Modified after date (ISO)' },
      folder: { type: 'string', description: 'Limit to folder' },
    },
    required: ['query'],
  },
};

export const READ_FILE_DEF: ToolDefinition = {
  name: 'drive_read_file',
  description: 'Read the contents of a file from the user\'s Drive.',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'File ID to read' },
      format: { type: 'string', enum: ['text', 'markdown', 'json', 'html'] },
      maxLength: { type: 'number', description: 'Max content length' },
    },
    required: ['fileId'],
  },
};

export const SUMMARIZE_FILE_DEF: ToolDefinition = {
  name: 'drive_summarize',
  description: 'Summarize the contents of a file from Drive.',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'File ID' },
      maxLength: { type: 'number', description: 'Max summary length' },
      focus: { type: 'string', enum: ['overview', 'key-points', 'action-items', 'detailed'] },
    },
    required: ['fileId'],
  },
};

export const SHARE_FILE_DEF: ToolDefinition = {
  name: 'drive_share',
  description: 'Share a file or create a share link.',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'File ID' },
      public: { type: 'boolean', description: 'Make public' },
      recipients: { type: 'array', items: { type: 'string' }, description: 'Share with emails' },
      role: { type: 'string', enum: ['viewer', 'editor', 'commenter'] },
    },
    required: ['fileId'],
  },
};

export const CREATE_FOLDER_DEF: ToolDefinition = {
  name: 'drive_create_folder',
  description: 'Create a new folder in Drive.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Folder name' },
      parentId: { type: 'string', description: 'Parent folder ID' },
    },
    required: ['name'],
  },
};

// ── Registered Tools ───────────────────────────────────

export const driveSearchTool: RegisteredTool = {
  name: 'drive_search',
  definition: SEARCH_FILES_DEF,
  category: 'drive',
  risk: 'low',
  description: 'Search files in Drive',
  inputSchema: SearchFilesSchema,
  execute: async (params, context) => {
    const startTime = Date.now();
    const searchParams: Record<string, string> = { q: params.query, type: params.fileType, limit: String(params.limit) };
    if (params.modifiedAfter) searchParams.modifiedAfter = params.modifiedAfter;
    if (params.modifiedBefore) searchParams.modifiedBefore = params.modifiedBefore;
    if (params.folder) searchParams.folder = params.folder;

    const { ok, data } = await driveFetch('/files/search', { context, params: searchParams });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Drive search failed',
      durationMs: Date.now() - startTime,
    };
  },
};

export const driveReadTool: RegisteredTool = {
  name: 'drive_read_file',
  definition: READ_FILE_DEF,
  category: 'drive',
  risk: 'low',
  description: 'Read file contents from Drive',
  inputSchema: ReadFileSchema,
  execute: async (params, context) => {
    const startTime = Date.now();
    const { ok, data } = await driveFetch(`/files/${params.fileId}`, {
      context,
      params: { format: params.format },
    });

    if (!ok) {
      return { success: false, data: '', error: 'Failed to read file', durationMs: Date.now() - startTime };
    }

    // Truncate if needed
    const fileData = data as { content?: string };
    const content = fileData.content ?? JSON.stringify(data);
    return {
      success: true,
      data: content.slice(0, params.maxLength),
      durationMs: Date.now() - startTime,
      warnings: content.length > params.maxLength ? ['Content truncated'] : undefined,
    };
  },
};

export const driveSummarizeTool: RegisteredTool = {
  name: 'drive_summarize',
  definition: SUMMARIZE_FILE_DEF,
  category: 'drive',
  risk: 'low',
  description: 'Summarize a file from Drive',
  inputSchema: SummarizeFileSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    // First read the file
    const { ok, data } = await driveFetch(`/files/${params.fileId}`, {
      context,
      params: { format: 'text' },
    });

    if (!ok) {
      return { success: false, data: '', error: 'Failed to read file for summarization', durationMs: Date.now() - startTime };
    }

    const fileData = data as { content?: string; name?: string };
    const content = fileData.content ?? '';

    if (!content) {
      return { success: true, data: `File "${fileData.name}" appears to be empty or binary.`, durationMs: Date.now() - startTime };
    }

    const summary = extractiveSummary(content, params.maxLength);
    return {
      success: true,
      data: summary,
      durationMs: Date.now() - startTime,
    };
  },
};

export const driveShareTool: RegisteredTool = {
  name: 'drive_share',
  definition: SHARE_FILE_DEF,
  category: 'drive',
  risk: 'medium',
  description: 'Share a file or create share link',
  inputSchema: ShareFileSchema,
  execute: async (params, context) => {
    const startTime = Date.now();
    const { ok, data } = await driveFetch(`/files/${params.fileId}/share`, {
      method: 'POST',
      context,
      body: { public: params.public, recipients: params.recipients, role: params.role, expiryHours: params.expiryHours },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to share file',
      durationMs: Date.now() - startTime,
    };
  },
};

export const driveCreateFolderTool: RegisteredTool = {
  name: 'drive_create_folder',
  definition: CREATE_FOLDER_DEF,
  category: 'drive',
  risk: 'low',
  description: 'Create a new folder in Drive',
  inputSchema: CreateFolderSchema,
  execute: async (params, context) => {
    const startTime = Date.now();
    const { ok, data } = await driveFetch('/files/folder', {
      method: 'POST',
      context,
      body: { name: params.name, parentId: params.parentId },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to create folder',
      durationMs: Date.now() - startTime,
    };
  },
};

/**
 * All Drive tools.
 */
export const DRIVE_TOOLS: RegisteredTool[] = [
  driveSearchTool,
  driveReadTool,
  driveSummarizeTool,
  driveShareTool,
  driveCreateFolderTool,
];
