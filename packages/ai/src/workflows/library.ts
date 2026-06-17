/**
 * @anvil/ai/workflows — Built-in Workflow Library
 *
 * Pre-built workflows for common AI command center operations:
 *
 * 1. inbox_zero       — Categorize, prioritize, and batch-archive inbox
 * 2. weekly_brief     — Aggregate mail + calendar + docs → AI summary doc
 * 3. deal_room        — Find everything about a deal/project → briefing
 * 4. meeting_prep     — Auto-prep for next meeting (context + agenda)
 * 5. email_campaign   — Draft email series based on a goal
 * 6. smart_cleanup    — Archive old emails by category
 */

import type { WorkflowDefinition } from './types.js';

// ── 1. Inbox Zero ───────────────────────────────────────

export const INBOX_ZERO_WORKFLOW: WorkflowDefinition = {
  id: 'inbox_zero',
  name: 'Inbox Zero',
  description: 'Categorize all unread emails, identify what needs action, archive the rest, and draft replies to high-priority threads.',
  icon: 'MailCheck',
  estimatedDuration: 45,
  tags: ['email', 'productivity', 'triage'],
  inputSchema: {
    maxEmails: {
      type: 'number',
      description: 'Max emails to process (default: 50)',
      required: false,
      default: 50,
    },
    autoArchive: {
      type: 'boolean',
      description: 'Automatically archive newsletters and promotions',
      required: false,
      default: true,
    },
  },
  steps: [
    {
      id: 'fetch_unread',
      name: 'Fetch Unread Emails',
      description: 'Loading your unread messages…',
      type: 'tool_call',
      tool: 'email_search',
      inputs: {
        query: '',
        folder: 'inbox',
        limit: '$inputs.maxEmails',
        unreadOnly: true,
      },
    },
    {
      id: 'categorize',
      name: 'Categorize Emails',
      description: 'Sorting by importance and category…',
      type: 'ai_generate',
      prompt: `You are an email triage assistant. Analyze these emails and categorize each one.

EMAILS:
{{fetch_unread}}

For each email, output a JSON array with this structure:
[{
  "id": "<email_id>",
  "subject": "<subject>",
  "sender": "<sender>",
  "category": "action_required" | "reply_needed" | "fyi" | "newsletter" | "promotion" | "notification" | "spam",
  "priority": "urgent" | "high" | "medium" | "low",
  "summary": "<one sentence summary>",
  "suggestedAction": "reply" | "archive" | "delete" | "read" | "schedule" | "forward",
  "deadline": "<ISO date if there's a deadline, else null>"
}]

Focus on:
- action_required: needs my personal response or decision
- reply_needed: direct question or request
- fyi: informational, no action
- newsletter/promotion: bulk content

Output ONLY valid JSON, no commentary.`,
      outputTransform: (output, _ctx) => {
        try {
          const text = String(output);
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch { /* fall through */ }
        return [];
      },
    },
    {
      id: 'identify_urgent',
      name: 'Identify Priority Actions',
      description: 'Finding what needs your attention…',
      type: 'transform',
      inputs: { categorized: '$outputs.categorize' },
      outputTransform: (_inputs, ctx) => {
        const categorized = ctx.outputs['categorize'] as Array<Record<string, unknown>>;
        if (!Array.isArray(categorized)) return { urgent: [], replyNeeded: [], toArchive: [] };

        return {
          urgent: categorized.filter(
            (e) => e['priority'] === 'urgent' || e['category'] === 'action_required',
          ),
          replyNeeded: categorized.filter((e) => e['category'] === 'reply_needed'),
          toArchive: categorized.filter(
            (e) =>
              ['newsletter', 'promotion', 'notification'].includes(String(e['category'])) &&
              e['suggestedAction'] === 'archive',
          ),
          all: categorized,
        };
      },
    },
    {
      id: 'draft_urgent_replies',
      name: 'Draft Urgent Replies',
      description: 'Drafting replies to your most urgent emails…',
      type: 'ai_generate',
      prompt: `Draft concise, professional replies for these high-priority emails:

URGENT EMAILS:
{{identify_urgent}}

For each email that needs a reply, output a JSON array:
[{
  "emailId": "<id>",
  "subject": "Re: <original subject>",
  "draftBody": "<full email body>",
  "tone": "professional" | "friendly" | "urgent"
}]

Keep replies brief, actionable, and appropriately toned. Output ONLY valid JSON.`,
      continueOnError: true,
      outputTransform: (output, _ctx) => {
        try {
          const text = String(output);
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch { /* fall through */ }
        return [];
      },
    },
    {
      id: 'archive_gate',
      name: 'Approve Auto-Archive',
      type: 'approval_gate',
      approvalMessage: 'Ready to archive {{identify_urgent.toArchive.length}} newsletters and promotions. Approve?',
      continueOnError: true,
    },
    {
      id: 'summary',
      name: 'Generate Inbox Summary',
      description: 'Creating your inbox zero report…',
      type: 'ai_generate',
      prompt: `Create a clean, actionable inbox summary.

CATEGORIZED EMAILS:
{{identify_urgent}}

DRAFTED REPLIES:
{{draft_urgent_replies}}

Format as markdown with these sections:
## 🚨 Urgent (needs action today)
## 💬 Reply Needed
## 📋 FYI / To Read
## ✅ Auto-Archived

For each urgent item: bold subject, sender, one-line summary, suggested action.
Keep it scannable. Total should be under 400 words.`,
    },
  ],
};

// ── 2. Deal Room ────────────────────────────────────────

export const DEAL_ROOM_WORKFLOW: WorkflowDefinition = {
  id: 'deal_room',
  name: 'Deal Room',
  description: 'Find every email, document, and meeting about a deal or project, then synthesize a comprehensive briefing.',
  icon: 'Briefcase',
  estimatedDuration: 60,
  tags: ['research', 'email', 'drive', 'calendar'],
  inputSchema: {
    topic: {
      type: 'string',
      description: 'Deal name, project, client, or topic to research',
      required: true,
    },
    createDoc: {
      type: 'boolean',
      description: 'Save briefing as a document in Drive',
      required: false,
      default: false,
    },
  },
  steps: [
    {
      id: 'cross_search',
      name: 'Search All Sources',
      description: 'Searching mail, calendar, and drive for {{topic}}…',
      type: 'tool_call',
      tool: 'cross_reference',
      inputs: {
        query: '$inputs.topic',
        limit: 10,
      },
    },
    {
      id: 'synthesize',
      name: 'Synthesize Briefing',
      description: 'Creating comprehensive briefing…',
      type: 'ai_generate',
      prompt: `You are building a deal/project briefing.

TOPIC: {{topic}}

ALL RELATED CONTENT (emails, meetings, documents):
{{cross_search}}

Create a comprehensive briefing document in markdown with:

## Executive Summary
(2-3 sentences: what is this, where does it stand)

## Key People
(Names, roles, last contact date)

## Timeline
(Chronological history of key events/milestones)

## Open Items
(Unresolved questions, pending actions, upcoming deadlines)

## Risk Flags
(Red flags, blockers, concerns)

## Next Steps
(Specific recommended actions)

Be specific. Use real names, dates, and details from the sources.`,
    },
    {
      id: 'save_to_docs',
      name: 'Save to Docs',
      description: 'Saving briefing to Drive…',
      type: 'tool_call',
      tool: 'document_write',
      inputs: {
        title: 'Deal Brief: {{topic}}',
        content: '$outputs.synthesize',
      },
      continueOnError: true,
    },
  ],
};

// ── 3. Weekly Intelligence Brief ────────────────────────

export const WEEKLY_BRIEF_WORKFLOW: WorkflowDefinition = {
  id: 'weekly_brief',
  name: 'Weekly Intelligence Brief',
  description: 'Aggregate your week\'s email, calendar, and document activity into an AI-generated executive summary.',
  icon: 'BarChart3',
  estimatedDuration: 90,
  tags: ['email', 'calendar', 'docs', 'report'],
  inputSchema: {
    weekOffset: {
      type: 'number',
      description: 'Weeks back (0 = this week, 1 = last week)',
      required: false,
      default: 0,
    },
  },
  steps: [
    {
      id: 'fetch_mail',
      name: 'Fetch This Week\'s Email',
      description: 'Loading emails…',
      type: 'tool_call',
      tool: 'email_search',
      inputs: { query: '', folder: 'inbox', limit: 100, unreadOnly: false },
    },
    {
      id: 'fetch_calendar',
      name: 'Fetch Calendar Events',
      description: 'Loading meetings…',
      type: 'tool_call',
      tool: 'calendar_get_events',
      inputs: {},
    },
    {
      id: 'fetch_docs',
      name: 'Fetch Recent Documents',
      description: 'Loading recent files…',
      type: 'tool_call',
      tool: 'file_search',
      inputs: { query: 'modified:this week', file_type: 'any', limit: 20 },
      continueOnError: true,
    },
    {
      id: 'synthesize_week',
      name: 'Generate Weekly Brief',
      description: 'Synthesizing your week…',
      type: 'ai_generate',
      prompt: `Generate a crisp, insightful Weekly Intelligence Brief.

## EMAIL DATA:
{{fetch_mail}}

## MEETINGS & CALENDAR:
{{fetch_calendar}}

## DOCUMENTS TOUCHED:
{{fetch_docs}}

Create a Weekly Brief with these sections (markdown):

# Weekly Brief — [Date Range]

## 📊 By the Numbers
- Emails received/sent/unread
- Meetings attended + total hours
- Docs created/edited

## 🏆 Top Wins This Week
(What went well, completed, shipped)

## 🔥 Active Fronts
(Key threads, ongoing projects, active decisions)

## 🚧 Blockers & Risks
(What's stuck, needs attention, overdue)

## 📅 Coming Up Next Week
(Key meetings, deadlines from calendar)

## 💡 AI Observations
(Patterns I noticed: communication patterns, recurring topics, unusual volume)

Be specific with names and topics. Make it feel like a COO briefing memo.`,
    },
    {
      id: 'save_brief',
      name: 'Save Weekly Brief',
      description: 'Saving to your Drive…',
      type: 'tool_call',
      tool: 'document_write',
      inputs: {
        title: 'Weekly Brief',
        content: '$outputs.synthesize_week',
      },
      continueOnError: true,
    },
  ],
};

// ── 4. Smart Meeting Prep ───────────────────────────────

export const MEETING_PREP_WORKFLOW: WorkflowDefinition = {
  id: 'meeting_prep',
  name: 'Smart Meeting Prep',
  description: 'Auto-prepare for your next meeting: find related emails and docs, identify open items, suggest agenda.',
  icon: 'CalendarClock',
  estimatedDuration: 30,
  tags: ['calendar', 'email', 'drive', 'meeting'],
  inputSchema: {
    meetingTitle: {
      type: 'string',
      description: 'Meeting title or topic to prep for',
      required: false,
    },
  },
  steps: [
    {
      id: 'next_meeting',
      name: 'Find Next Meeting',
      description: 'Checking your calendar…',
      type: 'tool_call',
      tool: 'calendar_get_events',
      inputs: {},
    },
    {
      id: 'find_context',
      name: 'Gather Context',
      description: 'Finding related content…',
      type: 'tool_call',
      tool: 'cross_reference',
      inputs: {
        query: '$inputs.meetingTitle',
        limit: 8,
      },
    },
    {
      id: 'prep_brief',
      name: 'Generate Prep Brief',
      description: 'Building your meeting brief…',
      type: 'ai_generate',
      prompt: `Generate a concise meeting prep brief.

NEXT MEETING:
{{next_meeting}}

RELATED CONTEXT (emails, docs, past meetings):
{{find_context}}

Create a prep brief with:

## Meeting: [Title] — [Time]
**Attendees:** [list]
**Duration:** [length]

## Why This Meeting
(Purpose, what needs to be decided)

## Background Context
(Relevant recent emails, doc links, past decisions)

## Open Questions Going In
(Unresolved items, things to clarify)

## Suggested Agenda
1. [Item] — [X min]
2. ...

## Your Action Items Before the Meeting
- [ ] [Specific prep tasks]

Keep it to one page. Be direct and actionable.`,
    },
  ],
};

// ── Registry ────────────────────────────────────────────

export const BUILT_IN_WORKFLOWS: WorkflowDefinition[] = [
  INBOX_ZERO_WORKFLOW,
  DEAL_ROOM_WORKFLOW,
  WEEKLY_BRIEF_WORKFLOW,
  MEETING_PREP_WORKFLOW,
];

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return BUILT_IN_WORKFLOWS.find((w) => w.id === id);
}

export function searchWorkflows(query: string): WorkflowDefinition[] {
  const q = query.toLowerCase();
  return BUILT_IN_WORKFLOWS.filter(
    (w) =>
      w.name.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.tags?.some((t) => t.includes(q)),
  );
}
