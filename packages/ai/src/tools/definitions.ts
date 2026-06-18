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

export const EMAIL_ARCHIVE_TOOL: ToolDefinition = {
  name: 'email_archive',
  description: 'Archive an email thread to remove it from the inbox without deleting it.',
  parameters: {
    type: 'object',
    properties: {
      thread_id: {
        type: 'string',
        description: 'The thread ID to archive',
      },
    },
    required: ['thread_id'],
  },
};

/**
 * All built-in Anvil tools.
 */
export const CROSS_REFERENCE_TOOL: ToolDefinition = {
  name: 'cross_reference',
  description: 'Search across Mail, Calendar, and Drive simultaneously for a topic, person, project, or keyword. Use when the user wants to find everything related to something — emails, events, and files in one result set.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — can be a person name, project name, topic, or keyword',
      },
      limit: {
        type: 'number',
        description: 'Max results per source (default 5)',
      },
    },
    required: ['query'],
  },
};

export const CALENDAR_GET_EVENTS_TOOL: ToolDefinition = {
  name: 'calendar_get_events',
  description: 'Fetch calendar events for a given time range. Returns meetings, appointments, and events with times, attendees, and descriptions.',
  parameters: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Start of time range in ISO 8601 format. Default: now.',
      },
      to: {
        type: 'string',
        description: 'End of time range in ISO 8601 format. Default: 7 days from now.',
      },
    },
    required: [],
  },
};

export const CONTEXT_MEMO_TOOL: ToolDefinition = {
  name: 'context_memo',
  description: 'Save a user preference, fact, or instruction to remember for future conversations. Use when the user expresses a preference like "always CC me", "I prefer morning meetings", or shares important context.',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Short identifier for this preference (e.g. "email_cc", "meeting_time", "tone_preference")',
      },
      value: {
        type: 'string',
        description: 'The preference or fact to remember',
      },
    },
    required: ['key', 'value'],
  },
};

export const CONTEXT_RECALL_TOOL: ToolDefinition = {
  name: 'context_recall',
  description: 'Recall a previously saved user preference or fact. Use when you need to remember something the user told you in a past conversation.',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The preference key to look up, or a topic to search for',
      },
    },
    required: ['key'],
  },
};

export const TASKS_CREATE_TOOL: ToolDefinition = {
  name: 'tasks_create',
  description: 'Create one or more tasks in the Anvil Tasks app. Use when the user asks to create a task, to-do, or action item, or when extracting action items from emails/meetings.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Task title',
      },
      description: {
        type: 'string',
        description: 'Detailed description or notes',
      },
      due_date: {
        type: 'string',
        description: 'Due date in ISO 8601 format',
      },
      priority: {
        type: 'string',
        description: 'Task priority',
        enum: ['urgent', 'high', 'medium', 'low'],
      },
      related_email_id: {
        type: 'string',
        description: 'Email ID this task was created from (for context linking)',
      },
    },
    required: ['title'],
  },
};

export const EMAIL_BULK_ACTION_TOOL: ToolDefinition = {
  name: 'email_bulk_action',
  description: 'Perform batch actions on multiple emails at once: archive, delete, label, mark read/unread, or move. Use for inbox zero workflows or bulk cleanup.',
  parameters: {
    type: 'object',
    properties: {
      message_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of email message IDs to act on',
      },
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['archive', 'delete', 'mark_read', 'mark_unread', 'label', 'move_to_folder'],
      },
      label: {
        type: 'string',
        description: 'Label name (required for action=label)',
      },
      folder: {
        type: 'string',
        description: 'Target folder (required for action=move_to_folder)',
      },
    },
    required: ['message_ids', 'action'],
  },
};

export const FILE_EXTRACT_STRUCTURED_TOOL: ToolDefinition = {
  name: 'file_extract_structured',
  description: 'Extract structured data from a document in Drive — action items, key facts, dates, people, decisions. Returns clean JSON. Use when the user wants to process or analyze a document.',
  parameters: {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'Drive file ID to analyze',
      },
      extract: {
        type: 'array',
        items: { type: 'string' },
        description: 'Types of data to extract',
        enum: ['action_items', 'key_facts', 'dates', 'people', 'decisions', 'risks', 'summary'],
      },
    },
    required: ['file_id', 'extract'],
  },
};

export const RUN_WORKFLOW_TOOL: ToolDefinition = {
  name: 'run_workflow',
  description: 'Execute a multi-step AI workflow. Available workflows: inbox_zero (triage all email), deal_room (find everything about a project), weekly_brief (generate weekly summary), meeting_prep (prep for upcoming meeting). Use when the user asks for a complex task that requires multiple steps.',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: {
        type: 'string',
        description: 'Workflow identifier',
        enum: ['inbox_zero', 'deal_room', 'weekly_brief', 'meeting_prep'],
      },
      inputs: {
        type: 'object',
        description: 'Input parameters for the workflow (e.g. { topic: "Project Alpha" } for deal_room)',
      },
    },
    required: ['workflow_id'],
  },
};

export const AGENT_RUN_TOOL: ToolDefinition = {
  name: 'agent_run',
  description: 'Launch an autonomous agent to complete a complex multi-step goal. The agent plans, executes actions across Mail/Drive/Calendar, and pauses for human approval on high-risk actions (email sends, event creation). Use for tasks like "triage my inbox", "organize my Drive project folder", "find all emails about X and summarize them", or any goal requiring 3+ coordinated actions.',
  parameters: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'Clear natural-language description of what the agent should accomplish',
      },
      context: {
        type: 'object',
        description: 'Optional context like project name, date range, or specific people',
      },
    },
    required: ['goal'],
  },
};

export const IMAGE_ANALYZE_TOOL: ToolDefinition = {
  name: 'image_analyze',
  description: 'Analyze an image attached to the conversation. Describe contents, extract text (OCR), identify objects, read charts/graphs, or answer questions about the image. The image must be attached to the current message.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'What to analyze or extract from the image (e.g. "describe this screenshot", "extract the table data", "what does this chart show?")',
      },
      image_index: {
        type: 'number',
        description: 'Index of the attached image to analyze (0-based, default: 0)',
      },
    },
    required: ['question'],
  },
};

export const NOTES_CREATE_TOOL: ToolDefinition = {
  name: 'notes_create',
  description: 'Create a quick note or memo that persists in the conversation memory. Use for capturing key facts, decisions, action items, or reminders the user wants to save.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short title for the note',
      },
      content: {
        type: 'string',
        description: 'Full note content (supports Markdown)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
    },
    required: ['title', 'content'],
  },
};

export const SMART_SUMMARIZE_TOOL: ToolDefinition = {
  name: 'smart_summarize',
  description: 'Generate a structured summary of a long text or document with key points, action items, decisions, and sentiment. Use when asked to summarize emails, documents, or meeting notes.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to summarize',
      },
      format: {
        type: 'string',
        enum: ['bullets', 'prose', 'action_items', 'exec_brief'],
        description: 'Output format (default: bullets)',
      },
      max_points: {
        type: 'number',
        description: 'Maximum number of bullet points (default: 5)',
      },
    },
    required: ['text'],
  },
};

export const GOAL_PLAN_TOOL: ToolDefinition = {
  name: 'goal_plan',
  description: 'Break a complex goal into a step-by-step execution plan with dependencies. Use before starting multi-step tasks to show the user exactly what actions will be taken and in what order.',
  parameters: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'The complex goal to plan',
      },
      show_to_user: {
        type: 'boolean',
        description: 'Whether to display the plan to the user before executing (default: true)',
      },
    },
    required: ['goal'],
  },
};

// ── ANVIL_TOOLS must come LAST to avoid forward-reference TDZ errors ──
export const ANVIL_TOOLS: ToolDefinition[] = [
  FILE_SEARCH_TOOL,
  FILE_READ_TOOL,
  FILE_SHARE_TOOL,
  DOCUMENT_WRITE_TOOL,
  EMAIL_SEARCH_TOOL,
  EMAIL_SEND_TOOL,
  EMAIL_READ_THREAD_TOOL,
  EMAIL_SAVE_DRAFT_TOOL,
  EMAIL_ARCHIVE_TOOL,
  WEB_SEARCH_TOOL,
  CALENDAR_CREATE_TOOL,
  CALENDAR_GET_EVENTS_TOOL,
  CALENDAR_CHECK_AVAILABILITY_TOOL,
  CONTEXT_MEMO_TOOL,
  CONTEXT_RECALL_TOOL,
  CROSS_REFERENCE_TOOL,
  TASKS_CREATE_TOOL,
  EMAIL_BULK_ACTION_TOOL,
  FILE_EXTRACT_STRUCTURED_TOOL,
  RUN_WORKFLOW_TOOL,
  AGENT_RUN_TOOL,
  IMAGE_ANALYZE_TOOL,
  NOTES_CREATE_TOOL,
  SMART_SUMMARIZE_TOOL,
  GOAL_PLAN_TOOL,
];
