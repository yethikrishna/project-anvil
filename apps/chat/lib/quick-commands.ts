/**
 * Quick Commands — predefined AI actions that can be triggered from UI.
 * Each command maps to a specific tool chain or AI prompt.
 */

export interface QuickCommand {
  id: string;
  icon: string;
  label: string;
  description: string;
  prompt: string;
}

export const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: 'attention',
    icon: '⚡',
    label: 'What needs my attention?',
    description: 'Priority scan of unread emails and upcoming meetings',
    prompt: 'Scan my unread emails and upcoming calendar events. Give me a priority-ranked list of what needs my attention right now.',
  },
  {
    id: 'draft-reply',
    icon: '✉️',
    label: 'Draft a reply',
    description: 'Read my latest email thread and write a reply',
    prompt: 'Find my most recent unread email. Read the thread and draft a professional reply. Save it to my drafts.',
  },
  {
    id: 'find-file',
    icon: '📄',
    label: 'Find a file',
    description: 'Search Drive for a specific document',
    prompt: 'What file are you looking for? Tell me the name or describe it and I\'ll search your Drive.',
  },
  {
    id: 'schedule',
    icon: '📅',
    label: 'Schedule a meeting',
    description: 'Check calendars and find the best time',
    prompt: '__schedule__',
  },
  {
    id: 'weekly-summary',
    icon: '📊',
    label: 'Weekly summary',
    description: 'Activity digest across all apps',
    prompt: '__weekly_summary__',
  },
  {
    id: 'share-file',
    icon: '🔗',
    label: 'Find and share',
    description: 'Find a file on Drive and create a share link',
    prompt: 'I need to share a file. What file are you looking for? I\'ll search Drive and create a share link.',
  },
  {
    id: 'compose-email',
    icon: '📝',
    label: 'Compose an email',
    description: 'Write a new email with AI assistance',
    prompt: 'I need to write an email. Who is it to and what should it say? I\'ll draft it for you.',
  },
  {
    id: 'summarize-doc',
    icon: '📋',
    label: 'Summarize a document',
    description: 'Read a Drive file and summarize key points',
    prompt: 'Which document should I summarize? Give me the name and I\'ll find it on Drive, read it, and give you the key points.',
  },
  {
    id: 'chain-goal',
    icon: '🤖',
    label: 'Autonomous task (AI chain)',
    description: 'Let AI plan and execute a multi-step goal end-to-end',
    prompt: '/chain ',
  },
];

/**
 * Multi-step tool chains for complex operations.
 */
export interface ToolChain {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    tool: string;
    args: Record<string, unknown>;
    /** Whether to use previous step's output as input */
    usePrevOutput?: boolean;
    /** Key from previous output to use */
    prevOutputKey?: string;
  }>;
}

export const TOOL_CHAINS: ToolChain[] = [
  {
    id: 'find-summarize-email',
    name: 'Find Document → Summarize → Email to Team',
    description: 'Finds a document, summarizes it, and sends the summary via email',
    steps: [
      { tool: 'file_search', args: { query: '', limit: 1 } },
      { tool: 'file_read', args: { file_id: '' }, usePrevOutput: true, prevOutputKey: 'id' },
      { tool: 'email_send', args: { to: '', subject: 'Document Summary', body: '' }, usePrevOutput: true },
    ],
  },
  {
    id: 'email-to-calendar',
    name: 'Email Thread → Extract Event → Create Calendar',
    description: 'Reads an email thread, extracts meeting details, and creates a calendar event',
    steps: [
      { tool: 'email_search', args: { query: '', folder: 'inbox', limit: 1 } },
      { tool: 'calendar_create_event', args: { title: '', start_time: '', end_time: '' }, usePrevOutput: true },
    ],
  },
  {
    id: 'search-share-email',
    name: 'Search File → Share Link → Email Link',
    description: 'Finds a file, creates a share link, and emails it',
    steps: [
      { tool: 'file_search', args: { query: '', limit: 1 } },
      { tool: 'email_send', args: { to: '', subject: 'Shared File', body: '' }, usePrevOutput: true },
    ],
  },
];
