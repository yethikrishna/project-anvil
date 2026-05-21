/**
 * JMAP Calendar/Contacts Client Tests
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock fetch for JMAP tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── JMAP Client Construction ──

describe('JMAPClient Construction', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates client with required config', async () => {
    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });
    expect(client).toBeDefined();
  });

  it('getSession calls correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        username: 'test@anvil.local',
        accounts: {},
        primaryAccounts: {},
        capabilities: {},
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const session = await client.getSession();
    expect(session.username).toBe('test@anvil.local');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8082/.well-known/jmap',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    );
  });

  it('getSession throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'bad-token',
    });

    await expect(client.getSession()).rejects.toThrow('JMAP session discovery failed: 401');
  });
});

// ── JMAP Calendar Operations ──

describe('JMAP Calendar Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getCalendars returns calendars from session', async () => {
    // Session discovery
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        username: 'test@anvil.local',
        accounts: {
          'acc-1': {
            name: 'Test Account',
            isPersonal: true,
            isReadOnly: false,
            accountCapabilities: {
              'urn:ietf:params:jmap:calendars': {},
            },
          },
        },
        primaryAccounts: {},
        capabilities: {},
      }),
    });

    // Calendar/get response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        methodResponses: [
          ['Calendar/get', {
            accountId: 'acc-1',
            list: [
              {id: 'cal-1', name: 'Personal', color: '#4285F4'},
              {id: 'cal-2', name: 'Work', color: '#34A853'},
            ],
          }, 'c0'],
        ],
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const calendars = await client.getCalendars();
    expect(calendars).toHaveLength(2);
    expect(calendars[0].name).toBe('Personal');
    expect(calendars[1].color).toBe('#34A853');
  });

  it('createCalendarEvent sends correct JMAP set call', async () => {
    // Session
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accounts: {'acc-1': {accountCapabilities: {'urn:ietf:params:jmap:calendars': {}}}},
        primaryAccounts: {},
      }),
    });

    // CalendarEvent/set response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        methodResponses: [
          ['CalendarEvent/set', {
            created: {
              'new-event': {id: 'evt-123', title: 'Test Event', start: '2026-05-21T09:00:00'},
            },
          }, 'c0'],
        ],
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const event = await client.createCalendarEvent({
      title: 'Test Event',
      start: '2026-05-21T09:00:00',
      duration: 'PT1H',
      calendarId: 'cal-1',
    });

    expect(event).not.toBeNull();
    expect(event!.title).toBe('Test Event');
  });

  it('deleteCalendarEvent sends destroy command', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accounts: {'acc-1': {accountCapabilities: {'urn:ietf:params:jmap:calendars': {}}}},
        primaryAccounts: {},
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        methodResponses: [
          ['CalendarEvent/set', {
            destroyed: ['evt-123'],
          }, 'c0'],
        ],
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const result = await client.deleteCalendarEvent('evt-123');
    expect(result).toBe(true);
  });
});

// ── JMAP Contact Operations ──

describe('JMAP Contact Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getContacts returns contacts from JMAP', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accounts: {'acc-1': {accountCapabilities: {'urn:ietf:params:jmap:contacts': {}}}},
        primaryAccounts: {},
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        methodResponses: [
          ['Contact/get', {
            list: [
              {id: 'con-1', firstName: 'Sarah', lastName: 'Chen', emails: [{email: 'sarah@test.com'}]},
              {id: 'con-2', firstName: 'Alex', lastName: 'Rivera'},
            ],
          }, 'c0'],
        ],
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const contacts = await client.getContacts();
    expect(contacts).toHaveLength(2);
    expect(contacts[0].firstName).toBe('Sarah');
  });

  it('createContact sends correct JSCalendar set call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accounts: {'acc-1': {accountCapabilities: {'urn:ietf:params:jmap:contacts': {}}}},
        primaryAccounts: {},
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        methodResponses: [
          ['Contact/set', {
            created: {
              'new-contact': {id: 'con-new', firstName: 'Test', lastName: 'User'},
            },
          }, 'c0'],
        ],
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const contact = await client.createContact({
      firstName: 'Test',
      lastName: 'User',
      emails: [{'@type': 'EmailAddress', email: 'test@test.com', contexts: ['work']}],
    });

    expect(contact).not.toBeNull();
    expect(contact!.firstName).toBe('Test');
  });

  it('getCalendars returns empty when no calendar capability', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accounts: {'acc-1': {accountCapabilities: {}}},
        primaryAccounts: {},
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const calendars = await client.getCalendars();
    expect(calendars).toEqual([]);
  });
});

// ── Free/Busy ──

describe('JMAP Free/Busy', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getFreeBusy returns busy periods', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accounts: {'acc-1': {accountCapabilities: {'urn:ietf:params:jmap:calendars': {}}}},
        primaryAccounts: {},
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        methodResponses: [
          ['CalendarEvent/freeBusy', {
            busy: [
              {calendarId: 'cal-1', start: '2026-05-21T09:00:00', end: '2026-05-21T10:00:00', busyType: 'busy'},
            ],
          }, 'c0'],
        ],
      }),
    });

    const {JMAPClient} = await import('../../apps/gmail/app/lib/jmap-calendar-contacts');
    const client = new JMAPClient({
      baseUrl: 'http://localhost:8082',
      accessToken: 'test-token',
    });

    const freebusy = await client.getFreeBusy(['cal-1'], new Date('2026-05-21'), new Date('2026-05-22'));
    expect(freebusy).toHaveLength(1);
    expect(freebusy[0].busyType).toBe('busy');
  });
});
