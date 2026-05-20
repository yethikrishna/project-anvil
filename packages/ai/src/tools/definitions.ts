/**
 * Built-in tool definitions for the Anvil AI copilot.
 *
 * These tools let the AI assistant interact with the Anvil ecosystem:
 * - Search files in Drive
 * - Read/write documents
 * - Search emails
 * - Create calendar events
 * - Search the web
 */

import type {ToolDefinition} from '../types.js';

export const FILE_SEARCH_TOOL: ToolDefinition = {
  name: 'file_search',
  description: 'Search for files in the user\'s Anvil Drive by name, type, or content keywords.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — file name, type, or content keywords',
      },
      file_type: {
        type: 'string',
        description: 'Filter by file type',
        enum: ['document', 'spreadsheet', 'presentation', 'image', 'pdf', 'video', 'any'],
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 10)',
      },
    },
    required: ['query'],
  },
};

export const FILE_READ_TOOL: ToolDefinition = {
  name: 'file_read',
  description: 'Read the contents of a file from the user\'s Anvil Drive.',
  parameters: {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'The file ID to read',
      },
      format: {
        type: 'string',
        description: 'Output format',
        enum: ['text', 'markdown', 'json'],
      },
    },
    required: ['file_id'],
  },
};

export const DOCUMENT_WRITE_TOOL: ToolDefinition = {
  name: 'document_write',
  description: 'Create or update a document in Anvil Docs.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Document title',
      },
      content: {
        type: 'string',
        description: 'Document content in Markdown or HTML',
      },
      document_id: {
        type: 'string',
        description: 'Existing document ID to update (omit to create new)',
      },
    },
    required: ['title', 'content'],
  },
};

export const EMAIL_SEARCH_TOOL: ToolDefinition = {
  name: 'email_search',
  description: 'Search the user\'s Gmail inbox by subject, sender, or content.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — subject, sender, or keyword',
      },
      folder: {
        type: 'string',
        description: 'Folder to search in',
        enum: ['inbox', 'sent', 'drafts', 'spam', 'trash', 'all'],
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 10)',
      },
    },
    required: ['query'],
  },
};

export const EMAIL_SEND_TOOL: ToolDefinition = {
  name: 'email_send',
  description: 'Send an email on behalf of the user.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
      },
      body: {
        type: 'string',
        description: 'Email body content',
      },
      cc: {
        type: 'string',
        description: 'CC recipients (comma-separated)',
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

export const WEB_SEARCH_TOOL: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for current information.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 5)',
      },
    },
    required: ['query'],
  },
};

export const CALENDAR_CREATE_TOOL: ToolDefinition = {
  name: 'calendar_create_event',
  description: 'Create a calendar event.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Event title',
      },
      start_time: {
        type: 'string',
        description: 'Start time in ISO 8601 format',
      },
      end_time: {
        type: 'string',
        description: 'End time in ISO 8601 format',
      },
      description: {
        type: 'string',
        description: 'Event description',
      },
      attendees: {
        type: 'array',
        items: {type: 'string'},
        description: 'Attendee email addresses',
      },
    },
    required: ['title', 'start_time', 'end_time'],
  },
};

/**
 * All built-in Anvil tools.
 */
export const ANVIL_TOOLS: ToolDefinition[] = [
  FILE_SEARCH_TOOL,
  FILE_READ_TOOL,
  DOCUMENT_WRITE_TOOL,
  EMAIL_SEARCH_TOOL,
  EMAIL_SEND_TOOL,
  WEB_SEARCH_TOOL,
  CALENDAR_CREATE_TOOL,
];
