/**
 * Smart Tool Router — interprets user intent and routes to optimal tool chain.
 *
 * Instead of requiring the AI to figure out tools on every call,
 * this pre-analyzes the message to detect common patterns and
 * optimizes the tool selection.
 *
 * Patterns:
 * - "what needs attention" → attention digest
 * - "find X and share with Y" → file_search + file_share + email_send
 * - "schedule meeting with X" → calendar_check + calendar_create
 * - "summarize X" → file_read or email_search + summarize
 * - "draft reply" → email_read_thread + email_save_draft
 * - "weekly summary" → multi-source aggregation
 */

export type IntentCategory =
  | 'attention_scan'
  | 'file_search'
  | 'file_share'
  | 'email_search'
  | 'email_reply'
  | 'email_compose'
  | 'calendar_schedule'
  | 'calendar_check'
  | 'document_create'
  | 'document_summarize'
  | 'web_search'
  | 'weekly_summary'
  | 'multi_step'
  | 'general_chat';

export interface DetectedIntent {
  category: IntentCategory;
  confidence: number;
  entities: Record<string, string>;
  suggestedTools: string[];
  isMultiStep: boolean;
  requiresApproval: boolean;
}

// ── Pattern Matchers ──

const PATTERNS: Array<{
  pattern: RegExp;
  category: IntentCategory;
  tools: string[];
  entities: (match: RegExpMatchArray) => Record<string, string>;
  needsApproval: boolean;
}> = [
  {
    pattern: /\b(what('?s| needs) (my )?attention|urgent|priority|important (emails?|messages?))\b/i,
    category: 'attention_scan',
    tools: ['email_search', 'calendar_check_availability'],
    entities: () => ({}),
    needsApproval: false,
  },
  {
    pattern: /\b(find|search|locate|look (for|up))\b.+\b(file|document|doc|drive)\b/i,
    category: 'file_search',
    tools: ['file_search'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(find|get|search|share)\b.+\b(share|send|link)\b/i,
    category: 'file_share',
    tools: ['file_search', 'file_share'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(find|search|locate)\b.+\b(email|mail|inbox)\b/i,
    category: 'email_search',
    tools: ['email_search'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(draft|write|reply|respond)\b.+\b(reply|response|email|mail)\b/i,
    category: 'email_reply',
    tools: ['email_read_thread', 'email_save_draft'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(compose|write|send|create)\b.+\b(email|mail|message)\b/i,
    category: 'email_compose',
    tools: ['email_send'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: true,
  },
  {
    pattern: /\b(schedule|book|set up|arrange|plan)\b.+\b(meeting|call|event|appointment)\b/i,
    category: 'calendar_schedule',
    tools: ['calendar_check_availability', 'calendar_create_event'],
    entities: (m) => ({ title: m[0] }),
    needsApproval: true,
  },
  {
    pattern: /\b(check|show|what('?s| is) (on |my )?)\b.+\b(calendar|schedule|agenda|availability)\b/i,
    category: 'calendar_check',
    tools: ['calendar_check_availability'],
    entities: () => ({}),
    needsApproval: false,
  },
  {
    pattern: /\b(create|write|new|start)\b.+\b(document|doc|note)\b/i,
    category: 'document_create',
    tools: ['document_write'],
    entities: (m) => ({ title: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(summarize|summarise|summary|digest|tldr|key points)\b/i,
    category: 'document_summarize',
    tools: ['file_search', 'file_read'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(search|look up|find|google)\b.+\b(web|internet|online)\b/i,
    category: 'web_search',
    tools: ['web_search'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: false,
  },
  {
    pattern: /\b(weekly|week|weekly )?(summary|digest|report|overview|recap)\b/i,
    category: 'weekly_summary',
    tools: ['email_search', 'file_search', 'calendar_check_availability'],
    entities: () => ({}),
    needsApproval: false,
  },
  {
    pattern: /\b(find|search)\b.+\b(and|then)\b.+\b(email|send|share|summarize|schedule)\b/i,
    category: 'multi_step',
    tools: ['file_search', 'file_read', 'email_send'],
    entities: (m) => ({ query: m[0] }),
    needsApproval: true,
  },
];

/**
 * Detect the user's intent from their message.
 */
export function detectIntent(message: string): DetectedIntent {
  let bestMatch: DetectedIntent | null = null;
  let bestConfidence = 0;

  for (const pattern of PATTERNS) {
    const match = message.match(pattern.pattern);
    if (match) {
      // Confidence based on match length relative to message
      const confidence = Math.min(match[0].length / message.length * 2, 1);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          category: pattern.category,
          confidence,
          entities: pattern.entities(match),
          suggestedTools: pattern.tools,
          isMultiStep: pattern.tools.length > 1,
          requiresApproval: pattern.needsApproval,
        };
      }
    }
  }

  // Default to general chat
  if (!bestMatch || bestConfidence < 0.1) {
    return {
      category: 'general_chat',
      confidence: 0,
      entities: {},
      suggestedTools: [],
      isMultiStep: false,
      requiresApproval: false,
    };
  }

  return bestMatch;
}

/**
 * Build an optimized system prompt based on detected intent.
 * Adds intent-specific instructions to the base system prompt.
 */
export function getIntentPrompt(intent: DetectedIntent): string {
  const extras: string[] = [];

  switch (intent.category) {
    case 'attention_scan':
      extras.push('Focus on urgency. Check unread emails from the last 24 hours and upcoming calendar events within 48 hours. Rank by priority.');
      break;
    case 'email_reply':
      extras.push('Read the full thread carefully. Match the existing tone. Address all points raised. Be concise.');
      break;
    case 'calendar_schedule':
      extras.push('Check availability first. Propose specific times. Ask for confirmation before creating the event.');
      break;
    case 'document_summarize':
      extras.push('Find the document, read it completely, then provide key points in bullet format. Include any action items.');
      break;
    case 'weekly_summary':
      extras.push('Aggregate data from Mail, Calendar, and Drive. Focus on accomplishments, pending items, and next week priorities.');
      break;
    case 'multi_step':
      extras.push('This requires multiple tool calls. Execute them in order, showing results after each step.');
      break;
  }

  return extras.join('\n');
}
