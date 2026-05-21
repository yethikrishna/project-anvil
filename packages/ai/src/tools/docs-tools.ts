/**
 * @anvil/ai/tools — Docs Tools
 *
 * AI tool functions for document operations:
 * - Create new documents
 * - Search document content
 * - Insert/edit sections in existing documents
 * - Export documents to various formats
 */

import { z } from 'zod';
import type { RegisteredTool, ToolContext } from './registry.js';
import type { ToolDefinition } from '../types.js';

// ── API Configuration ──────────────────────────────────

const DOCS_API_BASE = process.env.ANVIL_DOCS_API ?? 'http://localhost:3003/api';

// ── Input Schemas ──────────────────────────────────────

const CreateDocSchema = z.object({
  title: z.string().describe('Document title'),
  content: z.string().describe('Document content in Markdown'),
  folderId: z.string().optional().describe('Parent folder ID'),
  templateId: z.string().optional().describe('Template to use'),
  tags: z.array(z.string()).optional().describe('Tags for organization'),
  collaborators: z.array(z.string()).optional().describe('Collaborator emails'),
});

const SearchDocsSchema = z.object({
  query: z.string().describe('Search query for document content or title'),
  limit: z.number().min(1).max(50).default(10),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  ownerId: z.string().optional().describe('Filter by owner'),
  modifiedAfter: z.string().optional().describe('Modified after (ISO date)'),
});

const InsertSectionSchema = z.object({
  documentId: z.string().describe('Document ID to edit'),
  content: z.string().describe('Content to insert (Markdown)'),
  sectionTitle: z.string().optional().describe('Section heading'),
  position: z.enum(['beginning', 'end', 'after-section', 'before-section']).default('end'),
  targetSection: z.string().optional().describe('Target section heading for relative positioning'),
});

const UpdateSectionSchema = z.object({
  documentId: z.string().describe('Document ID'),
  sectionTitle: z.string().describe('Section heading to update'),
  content: z.string().describe('New section content (Markdown)'),
  append: z.boolean().default(false).describe('Append to section instead of replacing'),
});

const GetDocSchema = z.object({
  documentId: z.string().describe('Document ID'),
  format: z.enum(['markdown', 'html', 'text', 'json']).default('markdown'),
  section: z.string().optional().describe('Get only a specific section'),
});

const ExportDocSchema = z.object({
  documentId: z.string().describe('Document ID'),
  format: z.enum(['pdf', 'docx', 'html', 'md', 'txt']),
  includeMetadata: z.boolean().default(true),
});

// ── Helper ─────────────────────────────────────────────

async function docsFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    context: ToolContext;
    params?: Record<string, string>;
  },
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = new URL(`${DOCS_API_BASE}${path}`);
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

// ── Tool Definitions ───────────────────────────────────

export const CREATE_DOC_DEF: ToolDefinition = {
  name: 'docs_create',
  description: 'Create a new document with title and content.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title' },
      content: { type: 'string', description: 'Content in Markdown' },
      folderId: { type: 'string', description: 'Parent folder' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      collaborators: { type: 'array', items: { type: 'string' }, description: 'Collaborator emails' },
    },
    required: ['title', 'content'],
  },
};

export const SEARCH_DOCS_DEF: ToolDefinition = {
  name: 'docs_search',
  description: 'Search documents by content or title.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
    },
    required: ['query'],
  },
};

export const INSERT_SECTION_DEF: ToolDefinition = {
  name: 'docs_insert',
  description: 'Insert a section into an existing document.',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document ID' },
      content: { type: 'string', description: 'Content to insert (Markdown)' },
      sectionTitle: { type: 'string', description: 'Section heading' },
      position: { type: 'string', enum: ['beginning', 'end', 'after-section', 'before-section'] },
      targetSection: { type: 'string', description: 'Target section for relative insert' },
    },
    required: ['documentId', 'content'],
  },
};

export const UPDATE_SECTION_DEF: ToolDefinition = {
  name: 'docs_update_section',
  description: 'Update a section in a document.',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document ID' },
      sectionTitle: { type: 'string', description: 'Section to update' },
      content: { type: 'string', description: 'New content (Markdown)' },
      append: { type: 'boolean', description: 'Append instead of replace' },
    },
    required: ['documentId', 'sectionTitle', 'content'],
  },
};

export const GET_DOC_DEF: ToolDefinition = {
  name: 'docs_get',
  description: 'Retrieve a document\'s content.',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document ID' },
      format: { type: 'string', enum: ['markdown', 'html', 'text', 'json'] },
      section: { type: 'string', description: 'Get only a specific section' },
    },
    required: ['documentId'],
  },
};

export const EXPORT_DOC_DEF: ToolDefinition = {
  name: 'docs_export',
  description: 'Export a document to PDF, DOCX, HTML, or plain text.',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Document ID' },
      format: { type: 'string', enum: ['pdf', 'docx', 'html', 'md', 'txt'] },
    },
    required: ['documentId', 'format'],
  },
};

// ── Registered Tools ───────────────────────────────────

export const docsCreateTool: RegisteredTool = {
  name: 'docs_create',
  definition: CREATE_DOC_DEF,
  category: 'docs',
  risk: 'low',
  description: 'Create a new document',
  inputSchema: CreateDocSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await docsFetch('/documents', {
      method: 'POST',
      context,
      body: {
        title: params.title,
        content: params.content,
        folderId: params.folderId,
        templateId: params.templateId,
        tags: params.tags,
        collaborators: params.collaborators,
      },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to create document',
      durationMs: Date.now() - startTime,
    };
  },
};

export const docsSearchTool: RegisteredTool = {
  name: 'docs_search',
  definition: SEARCH_DOCS_DEF,
  category: 'docs',
  risk: 'low',
  description: 'Search documents by content or title',
  inputSchema: SearchDocsSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const searchParams: Record<string, string> = { q: params.query, limit: String(params.limit) };
    if (params.tags?.length) searchParams.tags = params.tags.join(',');
    if (params.modifiedAfter) searchParams.modifiedAfter = params.modifiedAfter;

    const { ok, data } = await docsFetch('/documents/search', { context, params: searchParams });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to search documents',
      durationMs: Date.now() - startTime,
    };
  },
};

export const docsInsertTool: RegisteredTool = {
  name: 'docs_insert',
  definition: INSERT_SECTION_DEF,
  category: 'docs',
  risk: 'medium',
  description: 'Insert a section into a document',
  inputSchema: InsertSectionSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await docsFetch(`/documents/${params.documentId}/sections`, {
      method: 'POST',
      context,
      body: {
        content: params.content,
        title: params.sectionTitle,
        position: params.position,
        targetSection: params.targetSection,
      },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to insert section',
      durationMs: Date.now() - startTime,
    };
  },
};

export const docsUpdateSectionTool: RegisteredTool = {
  name: 'docs_update_section',
  definition: UPDATE_SECTION_DEF,
  category: 'docs',
  risk: 'medium',
  description: 'Update a section in a document',
  inputSchema: UpdateSectionSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await docsFetch(`/documents/${params.documentId}/sections/${encodeURIComponent(params.sectionTitle)}`, {
      method: 'PATCH',
      context,
      body: { content: params.content, append: params.append },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to update section',
      durationMs: Date.now() - startTime,
    };
  },
};

export const docsGetTool: RegisteredTool = {
  name: 'docs_get',
  definition: GET_DOC_DEF,
  category: 'docs',
  risk: 'low',
  description: 'Get document content',
  inputSchema: GetDocSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const fetchParams: Record<string, string> = { format: params.format };
    if (params.section) fetchParams.section = params.section;

    const { ok, data } = await docsFetch(`/documents/${params.documentId}`, {
      context,
      params: fetchParams,
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to get document',
      durationMs: Date.now() - startTime,
    };
  },
};

export const docsExportTool: RegisteredTool = {
  name: 'docs_export',
  definition: EXPORT_DOC_DEF,
  category: 'docs',
  risk: 'low',
  description: 'Export a document to various formats',
  inputSchema: ExportDocSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await docsFetch(`/documents/${params.documentId}/export`, {
      context,
      params: { format: params.format, includeMetadata: String(params.includeMetadata) },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to export document',
      durationMs: Date.now() - startTime,
    };
  },
};

/**
 * All Docs tools.
 */
export const DOCS_TOOLS: RegisteredTool[] = [
  docsCreateTool,
  docsSearchTool,
  docsInsertTool,
  docsUpdateSectionTool,
  docsGetTool,
  docsExportTool,
];
