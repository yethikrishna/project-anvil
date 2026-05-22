/**
 * @anvil/ai/tools — Calendar Tools
 *
 * AI tool functions for calendar operations:
 * - Check schedule / find free time
 * - Create events with attendees
 * - Update / cancel events
 * - Find meeting times with availability
 */

import { z } from 'zod';
import type { RegisteredTool, ToolContext } from './registry.js';
import type { ToolDefinition } from '../types.js';

// ── API Configuration ──────────────────────────────────

const CALENDAR_API_BASE = process.env.ANVIL_CALENDAR_API ?? 'http://localhost:3007/api';

// ── Input Schemas ──────────────────────────────────────

const CheckScheduleSchema = z.object({
  date: z.string().describe('Date to check (YYYY-MM-DD or "today", "tomorrow")'),
  includePrivate: z.boolean().default(false).describe('Include private events'),
});

const CreateEventSchema = z.object({
  title: z.string().describe('Event title'),
  startTime: z.string().describe('Start time (ISO 8601)'),
  endTime: z.string().describe('End time (ISO 8601)'),
  description: z.string().optional().describe('Event description'),
  location: z.string().optional().describe('Event location or video call URL'),
  attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
  isAllDay: z.boolean().default(false),
  reminders: z.array(z.object({
    minutesBefore: z.number(),
    method: z.enum(['email', 'popup']),
  })).optional(),
  recurrence: z.string().optional().describe('RRULE recurrence pattern'),
  color: z.string().optional().describe('Event color ID'),
});

const UpdateEventSchema = z.object({
  eventId: z.string().describe('Event ID to update'),
  title: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

const CancelEventSchema = z.object({
  eventId: z.string().describe('Event ID to cancel'),
  notifyAttendees: z.boolean().default(true).describe('Send cancellation to attendees'),
  reason: z.string().optional().describe('Cancellation reason'),
});

const FindFreeTimeSchema = z.object({
  dateFrom: z.string().describe('Start of date range (ISO)'),
  dateTo: z.string().describe('End of date range (ISO)'),
  durationMinutes: z.number().min(15).max(480).default(60).describe('Meeting duration'),
  workingHoursOnly: z.boolean().default(true).describe('Only suggest working hours'),
  attendees: z.array(z.string()).optional().describe('Check availability of these emails'),
  timeZone: z.string().default('UTC').describe('Time zone for results'),
});

const GetUpcomingSchema = z.object({
  days: z.number().min(1).max(30).default(7).describe('Number of days ahead'),
  limit: z.number().min(1).max(50).default(20),
});

// ── Helper ─────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;

async function calendarFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    context: ToolContext;
    params?: Record<string, string>;
  },
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = new URL(`${CALENDAR_API_BASE}${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.context.authToken) headers['Authorization'] = `Bearer ${options.context.authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await resp.json();
    return { ok: resp.ok, data, status: resp.status };
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, data: { error: 'Request timed out' }, status: 408 };
    }
    return { ok: false, data: { error: err instanceof Error ? err.message : 'Network error' }, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve relative date expressions to YYYY-MM-DD.
 */
function resolveDate(date: string): string {
  const lower = date.toLowerCase().trim();
  if (lower === 'today') return new Date().toISOString().split('T')[0];
  if (lower === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (lower === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  // Already a date string
  return date;
}

// ── Tool Definitions ───────────────────────────────────

export const CHECK_SCHEDULE_DEF: ToolDefinition = {
  name: 'calendar_check',
  description: 'Check the user\'s schedule for a given date. Returns events with times, titles, and locations.',
  parameters: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date to check (YYYY-MM-DD, "today", or "tomorrow")' },
    },
    required: ['date'],
  },
};

export const CREATE_EVENT_DEF: ToolDefinition = {
  name: 'calendar_create',
  description: 'Create a calendar event with title, time, optional attendees, and location.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title' },
      startTime: { type: 'string', description: 'Start time (ISO 8601)' },
      endTime: { type: 'string', description: 'End time (ISO 8601)' },
      description: { type: 'string', description: 'Event description' },
      location: { type: 'string', description: 'Location or meeting URL' },
      attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
      isAllDay: { type: 'boolean', description: 'All-day event' },
    },
    required: ['title', 'startTime', 'endTime'],
  },
};

export const UPDATE_EVENT_DEF: ToolDefinition = {
  name: 'calendar_update',
  description: 'Update an existing calendar event.',
  parameters: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Event ID to update' },
      title: { type: 'string', description: 'New title' },
      startTime: { type: 'string', description: 'New start time' },
      endTime: { type: 'string', description: 'New end time' },
      description: { type: 'string', description: 'New description' },
      location: { type: 'string', description: 'New location' },
    },
    required: ['eventId'],
  },
};

export const CANCEL_EVENT_DEF: ToolDefinition = {
  name: 'calendar_cancel',
  description: 'Cancel a calendar event and notify attendees.',
  parameters: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Event ID to cancel' },
      reason: { type: 'string', description: 'Cancellation reason' },
      notifyAttendees: { type: 'boolean', description: 'Notify attendees (default: true)' },
    },
    required: ['eventId'],
  },
};

export const FIND_FREE_TIME_DEF: ToolDefinition = {
  name: 'calendar_find_free',
  description: 'Find available time slots for a meeting within a date range.',
  parameters: {
    type: 'object',
    properties: {
      dateFrom: { type: 'string', description: 'Range start (ISO)' },
      dateTo: { type: 'string', description: 'Range end (ISO)' },
      durationMinutes: { type: 'number', description: 'Meeting duration in minutes' },
      attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails to check' },
      workingHoursOnly: { type: 'boolean', description: 'Only show working hours' },
    },
    required: ['dateFrom', 'dateTo'],
  },
};

export const GET_UPCOMING_DEF: ToolDefinition = {
  name: 'calendar_upcoming',
  description: 'Get upcoming events for the next N days.',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Days ahead (default: 7)' },
      limit: { type: 'number', description: 'Max events (default: 20)' },
    },
  },
};

// ── Registered Tools ───────────────────────────────────

export const calendarCheckTool: RegisteredTool = {
  name: 'calendar_check',
  definition: CHECK_SCHEDULE_DEF,
  category: 'calendar',
  risk: 'low',
  description: 'Check schedule for a date',
  inputSchema: CheckScheduleSchema,
  execute: async (params, context) => {
    const startTime = Date.now();
    const date = resolveDate(params.date);

    const { ok, data } = await calendarFetch(`/events?from=${date}&to=${date}`, { context });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to fetch schedule',
      durationMs: Date.now() - startTime,
    };
  },
};

export const calendarCreateTool: RegisteredTool = {
  name: 'calendar_create',
  definition: CREATE_EVENT_DEF,
  category: 'calendar',
  risk: 'medium',
  description: 'Create a calendar event',
  inputSchema: CreateEventSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await calendarFetch('/events', {
      method: 'POST',
      context,
      body: {
        title: params.title,
        start: params.startTime,
        end: params.endTime,
        description: params.description,
        location: params.location,
        attendees: params.attendees,
        isAllDay: params.isAllDay,
        reminders: params.reminders,
        recurrence: params.recurrence,
      },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to create event',
      durationMs: Date.now() - startTime,
    };
  },
};

export const calendarUpdateTool: RegisteredTool = {
  name: 'calendar_update',
  definition: UPDATE_EVENT_DEF,
  category: 'calendar',
  risk: 'medium',
  description: 'Update a calendar event',
  inputSchema: UpdateEventSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const body: Record<string, unknown> = {};
    if (params.title !== undefined) body.title = params.title;
    if (params.startTime !== undefined) body.start = params.startTime;
    if (params.endTime !== undefined) body.end = params.endTime;
    if (params.description !== undefined) body.description = params.description;
    if (params.location !== undefined) body.location = params.location;
    if (params.attendees !== undefined) body.attendees = params.attendees;

    const { ok, data } = await calendarFetch(`/events/${params.eventId}`, {
      method: 'PATCH',
      context,
      body,
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to update event',
      durationMs: Date.now() - startTime,
    };
  },
};

export const calendarCancelTool: RegisteredTool = {
  name: 'calendar_cancel',
  definition: CANCEL_EVENT_DEF,
  category: 'calendar',
  risk: 'high',
  description: 'Cancel a calendar event',
  inputSchema: CancelEventSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const { ok, data } = await calendarFetch(`/events/${params.eventId}`, {
      method: 'DELETE',
      context,
      body: { notifyAttendees: params.notifyAttendees, reason: params.reason },
    });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to cancel event',
      durationMs: Date.now() - startTime,
    };
  },
};

export const calendarFindFreeTool: RegisteredTool = {
  name: 'calendar_find_free',
  definition: FIND_FREE_TIME_DEF,
  category: 'calendar',
  risk: 'low',
  description: 'Find free time slots for a meeting',
  inputSchema: FindFreeTimeSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const searchParams: Record<string, string> = {
      from: params.dateFrom,
      to: params.dateTo,
      duration: String(params.durationMinutes),
      workingHours: String(params.workingHoursOnly),
      timeZone: params.timeZone,
    };

    const { ok, data } = await calendarFetch('/availability', { context, params: searchParams });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to find free time',
      durationMs: Date.now() - startTime,
    };
  },
};

export const calendarUpcomingTool: RegisteredTool = {
  name: 'calendar_upcoming',
  definition: GET_UPCOMING_DEF,
  category: 'calendar',
  risk: 'low',
  description: 'Get upcoming events',
  inputSchema: GetUpcomingSchema,
  execute: async (params, context) => {
    const startTime = Date.now();

    const from = new Date().toISOString().split('T')[0];
    const toDate = new Date(Date.now() + params.days * 86400000).toISOString().split('T')[0];

    const { ok, data } = await calendarFetch(`/events?from=${from}&to=${toDate}&limit=${params.limit}`, { context });

    return {
      success: ok,
      data: JSON.stringify(data),
      error: ok ? undefined : 'Failed to fetch upcoming events',
      durationMs: Date.now() - startTime,
    };
  },
};

/**
 * All Calendar tools.
 */
export const CALENDAR_TOOLS: RegisteredTool[] = [
  calendarCheckTool,
  calendarCreateTool,
  calendarUpdateTool,
  calendarCancelTool,
  calendarFindFreeTool,
  calendarUpcomingTool,
];
