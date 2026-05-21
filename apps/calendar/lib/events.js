/**
 * Calendar event types and utilities.
 * Uses rrule.js for recurring event support.
 */

import {RRule, rrulestr} from 'rrule';

// ── Types ──

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  /** Start time (ISO 8601) */
  start: string;
  /** End time (ISO 8601) */
  end: string;
  /** All-day event */
  allDay?: boolean;
  /** Location */
  location?: string;
  /** Color for display */
  color?: string;
  /** Recurrence rule (RRULE string) */
  recurrence?: string;
  /** Attendees */
  attendees?: Attendee[];
  /** Calendar this event belongs to */
  calendarId: string;
  /** Created by */
  userId: string;
  /** Source (manual, email-extracted, ai-suggested) */
  source?: 'manual' | 'email' | 'ai' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface Attendee {
  email: string;
  name?: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  userId: string;
  isDefault?: boolean;
}

// ── Recurrence ──

export function createRecurrenceRule(options: {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  count?: number;
  until?: Date;
  byDay?: number[]; // 0=Mon, 6=Sun
}): string {
  const freqMap = {
    daily: RRule.DAILY,
    weekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
    yearly: RRule.YEARLY,
  };

  const dayMap = [
    RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU,
  ];

  const rule = new RRule({
    freq: freqMap[options.frequency],
    interval: options.interval ?? 1,
    count: options.count,
    until: options.until,
    byweekday: options.byDay?.map(d => dayMap[d]),
  });

  return rule.toString();
}

/**
 * Expand a recurring event into concrete occurrences within a date range.
 */
export function expandRecurrence(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  if (!event.recurrence) {
    // Single event — check if it falls within range
    const start = new Date(event.start);
    if (start >= rangeStart && start <= rangeEnd) {
      return [event];
    }
    return [];
  }

  // Parse RRULE and expand
  const rule = rrulestr(event.recurrence);
  const duration = new Date(event.end).getTime() - new Date(event.start).getTime();

  const occurrences = rule.between(rangeStart, rangeEnd, true);

  return occurrences.map((occStart, idx) => ({
    ...event,
    id: `${event.id}_${idx}`,
    start: occStart.toISOString(),
    end: new Date(occStart.getTime() + duration).toISOString(),
  }));
}

// ── Smart Scheduling ──

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
  reason?: string;
}

/**
 * Find available time slots across multiple calendars.
 * "Find a time when all attendees are free."
 */
export function findAvailableSlots(options: {
  existingEvents: CalendarEvent[];
  startDate: Date;
  endDate: Date;
  durationMinutes: number;
  workingHoursStart?: number; // 0-23
  workingHoursEnd?: number; // 0-23
  workingDays?: number[]; // 0=Mon, 6=Sun
}): TimeSlot[] {
  const {
    existingEvents,
    startDate,
    endDate,
    durationMinutes,
    workingHoursStart = 9,
    workingHoursEnd = 17,
    workingDays = [0, 1, 2, 3, 4], // Mon-Fri
  } = options;

  const slots: TimeSlot[] = [];
  const durationMs = durationMinutes * 60 * 1000;
  const stepMs = 30 * 60 * 1000; // 30-min slots

  const current = new Date(startDate);

  while (current < endDate) {
    const dayOfWeek = (current.getDay() + 6) % 7; // Convert to Mon=0

    if (!workingDays.includes(dayOfWeek)) {
      current.setDate(current.getDate() + 1);
      current.setHours(workingHoursStart, 0, 0, 0);
      continue;
    }

    const hour = current.getHours();

    if (hour < workingHoursStart) {
      current.setHours(workingHoursStart, 0, 0, 0);
      continue;
    }

    if (hour + durationMinutes / 60 > workingHoursEnd) {
      current.setDate(current.getDate() + 1);
      current.setHours(workingHoursStart, 0, 0, 0);
      continue;
    }

    const slotEnd = new Date(current.getTime() + durationMs);

    // Check for conflicts
    const hasConflict = existingEvents.some(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return current < eventEnd && slotEnd > eventStart;
    });

    slots.push({
      start: new Date(current),
      end: slotEnd,
      available: !hasConflict,
      reason: hasConflict ? 'Conflict with existing event' : undefined,
    });

    current.setTime(current.getTime() + stepMs);
  }

  return slots;
}

// ── Email → Calendar Event Extraction ──

export interface ExtractedEvent {
  title: string;
  start?: Date;
  end?: Date;
  location?: string;
  attendees?: string[];
  confidence: number;
}

/**
 * Extract calendar events from email text using pattern matching.
 * Examples: "Dinner Thursday?" → event, "Meeting tomorrow at 3pm" → event
 */
export function extractEventFromEmail(emailText: string): ExtractedEvent | null {
  const lower = emailText.toLowerCase();

  // Day name patterns
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const shortDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  let foundDay: Date | undefined;
  const now = new Date();

  // "next <day>"
  for (let i = 0; i < days.length; i++) {
    const regex = new RegExp(`\\b(?:next\\s+)?${days[i]}(\\s+at\\s+\\d+(?::\\d+)?(?:\\s*(?:am|pm))?)?`, 'i');
    const match = lower.match(regex);
    if (match) {
      const dayOffset = ((i + 1 - now.getDay() + 7) % 7) || 7;
      foundDay = new Date(now);
      foundDay.setDate(now.getDate() + dayOffset);

      // Extract time
      const timeMatch = match[1]?.match(/at\s+(\d+)(?::(\d+))?\s*(am|pm)?/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3]?.toLowerCase();
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        foundDay.setHours(hour, minute);
      } else {
        foundDay.setHours(12, 0); // Default noon
      }
      break;
    }
  }

  // "tomorrow"
  if (!foundDay && lower.includes('tomorrow')) {
    foundDay = new Date(now);
    foundDay.setDate(now.getDate() + 1);
    foundDay.setHours(12, 0);

    const timeMatch = lower.match(/(?:at\s+)?(\d+)(?::(\d+))?\s*(am|pm)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      foundDay.setHours(hour, minute);
    }
  }

  if (!foundDay) return null;

  // Extract title from context
  const titlePatterns = [
    /(?:let(?:'s| us)\s+(?:have|do|grab|schedule)\s+(?:a\s+)?)([\w\s]+?)(?:\s+(?:on|at|this|next|tomorrow))/i,
    /(?:how about|what about|want to)\s+(.+?)(?:\s+(?:on|at|this|next|tomorrow|\?))/i,
    /(?:dinner|lunch|coffee|meeting|call|chat|catch up|hangout)\s+(?:on|this|next|tomorrow)?/i,
  ];

  let title = 'Event';
  for (const pattern of titlePatterns) {
    const match = emailText.match(pattern);
    if (match) {
      title = match[1] ? match[1].trim() : match[0].split(/\s+(?:on|at|this|next|tomorrow)/i)[0].trim();
      title = title.charAt(0).toUpperCase() + title.slice(1);
      break;
    }
  }

  // Extract location
  let location: string | undefined;
  const locMatch = emailText.match(/(?:at|@)\s+([\w\s]+?)(?:\s+(?:on|tomorrow|next|\?|$))/i);
  if (locMatch) location = locMatch[1].trim();

  // Default 1-hour duration
  const end = new Date(foundDay.getTime() + 3600000);

  return {
    title,
    start: foundDay,
    end,
    location,
    confidence: foundDay ? 0.7 : 0.3,
  };
}

// ── Color Palette ──

export const EVENT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];
