/**
 * Unit tests for calendar event utilities
 */

import {describe, it, expect} from 'vitest';
import {expandRecurrence, findAvailableSlots, extractEventFromEmail} from '@anvil/calendar/lib/events.js';
import type {CalendarEvent} from '@anvil/calendar/lib/events.js';

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'test',
    title: 'Test Event',
    start: new Date(Date.now() + 86400000).toISOString(),
    end: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    calendarId: 'work',
    userId: 'u1',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('expandRecurrence', () => {
  it('returns single event when no recurrence', () => {
    const event = makeEvent({});
    const results = expandRecurrence(event, new Date(0), new Date(Date.now() + 7 * 86400000));
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('skips events outside range', () => {
    const event = makeEvent({start: new Date('2020-01-01').toISOString(), end: new Date('2020-01-01T01:00:00').toISOString()});
    const results = expandRecurrence(event, new Date('2026-01-01'), new Date('2026-12-31'));
    expect(results).toHaveLength(0);
  });
});

describe('findAvailableSlots', () => {
  it('finds slots when no events exist', () => {
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(9, 0, 0, 0);

    const dayEnd = new Date(tomorrow);
    dayEnd.setHours(17, 0, 0, 0);

    const slots = findAvailableSlots({
      existingEvents: [],
      startDate: tomorrow,
      endDate: dayEnd,
      durationMinutes: 60,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every(s => s.available)).toBe(true);
  });

  it('marks conflicting slots as unavailable', () => {
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(9, 0, 0, 0);

    const dayEnd = new Date(tomorrow);
    dayEnd.setHours(17, 0, 0, 0);

    const blockingEvent = makeEvent({
      start: new Date(tomorrow.getTime() + 3600000).toISOString(), // 10:00
      end: new Date(tomorrow.getTime() + 7200000).toISOString(), // 11:00
    });

    const slots = findAvailableSlots({
      existingEvents: [blockingEvent],
      startDate: tomorrow,
      endDate: dayEnd,
      durationMinutes: 60,
    });

    const tenOclockSlot = slots.find(s => s.start.getHours() === 10);
    expect(tenOclockSlot?.available).toBe(false);
  });
});

describe('extractEventFromEmail', () => {
  it('extracts "Dinner Thursday?"', () => {
    const result = extractEventFromEmail('Hey, want to grab dinner Thursday?');
    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('extracts "Meeting tomorrow at 3pm"', () => {
    const result = extractEventFromEmail('Let\'s have a meeting tomorrow at 3pm');
    expect(result).not.toBeNull();
    expect(result!.start).toBeTruthy();
    expect(result!.start!.getHours()).toBe(15); // 3pm
  });

  it('returns null for non-event emails', () => {
    const result = extractEventFromEmail('Here is the report you asked for. Please review and let me know.');
    expect(result).toBeNull();
  });

  it('extracts "coffee next Tuesday"', () => {
    const result = extractEventFromEmail('How about coffee next Tuesday?');
    expect(result).not.toBeNull();
    expect(result!.start).toBeTruthy();
  });
});
