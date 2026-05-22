/**
 * Core types for the Chat AI Command Center.
 */

// ── Conversation & Messages ──

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Accumulated context from tool calls across the conversation */
  context: ConversationContext;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Tool calls made by the assistant */
  toolCalls?: ToolCallResult[];
  /** If this was a voice input */
  voiceInput?: boolean;
  /** Status of streaming */
  streaming?: boolean;
}

export interface ToolCallResult {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
}

// ── Conversation Context (memory) ──

export interface ConversationContext {
  /** Files referenced in this conversation */
  files: ReferencedFile[];
  /** People mentioned */
  people: string[];
  /** Topics discussed */
  topics: string[];
  /** User preferences discovered */
  preferences: string[];
  /** App actions taken */
  actions: ActionRecord[];
}

export interface ReferencedFile {
  id: string;
  name: string;
  type: string;
  lastAccessed: number;
}

export interface ActionRecord {
  tool: string;
  action: string;
  timestamp: number;
  success: boolean;
}

// ── Tool System ──

export interface ToolAction {
  name: string;
  description: string;
  icon: string;
  category: 'mail' | 'drive' | 'calendar' | 'docs' | 'web';
}

export const TOOL_ACTIONS: ToolAction[] = [
  { name: 'email_search', description: 'Search emails', icon: 'Mail', category: 'mail' },
  { name: 'email_send', description: 'Send email', icon: 'Send', category: 'mail' },
  { name: 'email_read_thread', description: 'Read email thread', icon: 'MessageSquare', category: 'mail' },
  { name: 'email_save_draft', description: 'Save email draft', icon: 'FileEdit', category: 'mail' },
  { name: 'file_search', description: 'Search Drive files', icon: 'Search', category: 'drive' },
  { name: 'file_read', description: 'Read file contents', icon: 'FileText', category: 'drive' },
  { name: 'file_share', description: 'Share file link', icon: 'Share2', category: 'drive' },
  { name: 'document_write', description: 'Create/edit documents', icon: 'Edit', category: 'docs' },
  { name: 'calendar_create_event', description: 'Schedule events', icon: 'Calendar', category: 'calendar' },
  { name: 'calendar_check_availability', description: 'Check free time', icon: 'Clock', category: 'calendar' },
  { name: 'web_search', description: 'Search the web', icon: 'Globe', category: 'web' },
];

// ── Attention Digest ──

export interface AttentionItem {
  id: string;
  type: 'email' | 'calendar' | 'action';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  source: string;
  timestamp: string;
  actions?: SuggestedAction[];
}

export interface SuggestedAction {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

// ── Priority definitions ──

export const PRIORITY_CONFIG = {
  urgent: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950', label: 'Urgent' },
  high: { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950', label: 'High' },
  medium: { color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950', label: 'Medium' },
  low: { color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900', label: 'Low' },
} as const;

// ── Draft Reply ──

export interface DraftReply {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  tone: 'professional' | 'friendly' | 'concise' | 'formal' | 'casual';
}

// ── Meeting ──

export interface MeetingProposal {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description?: string;
}

// ── Cross-App Workflows ──

export interface WorkflowStep {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  extract?: Record<string, { fromStep: number; path: string }>;
}

export interface WorkflowResult {
  success: boolean;
  steps: Array<{ name: string; success: boolean; result: string; duration: number }>;
  summary: string;
  totalDurationMs: number;
}

// ── Weekly Summary ──

export interface WeeklySummary {
  weekRange: string;
  emailsProcessed: number;
  docsCreated: number;
  meetingsAttended: number;
  filesShared: number;
  topTopics: string[];
  actionItems: string[];
  highlights: string[];
  productivity?: {
    avgResponseTimeHours: number;
    meetingsPerDay: number;
    emailsPerDay: number;
  };
  recommendations?: string[];
  unreadEmails?: number;
  meetingsUpcoming?: number;
}
