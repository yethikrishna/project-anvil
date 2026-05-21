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

export const EMAIL_READ_THREAD_TOOL: ToolDefinition = {
  name: 'email_read_thread',
  description: 'Read the full email thread by thread ID. Returns all messages in the thread with sender, date, and content.',
  parameters: {
    type: 'object',
    properties: {
      thread_id: {
        type: 'string',
        description: 'Email thread ID to read',
      },
    },
    required: ['thread_id'],
  },
};

export const EMAIL_SAVE_DRAFT_TOOL: ToolDefinition = {
  name: 'email_save_draft',
  description: 'Save an email draft without sending. Use for preparing replies before user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address',
      },
      subject: {
        type: 'string',
        description: 'Draft subject line',
      },
      body: {
        type: 'string',
        description: 'Draft body content',
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

export const FILE_SHARE_TOOL: ToolDefinition = {
  name: 'file_share',
  description: 'Create a shareable link for a file in Drive. Returns a public URL.',
  parameters: {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'File ID to share',
      },
      public: {
        type: 'boolean',
        description: 'Make link publicly accessible (default: true)',
      },
    },
    required: ['file_id'],
  },
};

export const CALENDAR_CREATE_TOOL: ToolDefinition = {
  name: 'calendar_create_event',
  description: 'Create a calendar event and optionally send invites to attendees.',
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

export const CALENDAR_CHECK_AVAILABILITY_TOOL: ToolDefinition = {
  name: 'calendar_check_availability',
  description: 'Check calendar availability for a given time range. Returns free/busy slots.',
  parameters: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Start of time range in ISO 8601 format',
      },
      to: {
        type: 'string',
        description: 'End of time range in ISO 8601 format',
      },
    },
    required: ['from', 'to'],
  },
};

/**
 * All built-in Anvil tools.
 */
export const ANVIL_TOOLS: ToolDefinition[] = [
  FILE_SEARCH_TOOL,
  FILE_READ_TOOL,
  FILE_SHARE_TOOL,
  DOCUMENT_WRITE_TOOL,
  EMAIL_SEARCH_TOOL,
  EMAIL_SEND_TOOL,
  EMAIL_READ_THREAD_TOOL,
  EMAIL_SAVE_DRAFT_TOOL,
  WEB_SEARCH_TOOL,
  CALENDAR_CREATE_TOOL,
  CALENDAR_CHECK_AVAILABILITY_TOOL,
];
