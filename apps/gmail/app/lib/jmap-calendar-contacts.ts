/**
 * JMAP Calendar + Contacts Client for Stalwart Mail Server
 *
 * Implements JMAP (RFC 8620) Calendar (JSCalendar RFC 8984)
 * and Contacts (JSContact RFC 9553) via Stalwart v0.16+ APIs.
 *
 * Used in the Gmail clone for a unified PIM (Personal Information Manager) experience.
 */

// ── JMAP Base Client ──

export interface JMAPConfig {
  baseUrl: string;
  accessToken: string;
  /** Default: 'https://anvil.local' */
  origin?: string;
}

export class JMAPClient {
  private config: JMAPConfig;

  constructor(config: JMAPConfig) {
    this.config = config;
  }

  private async request(calls: JMAPCall[]): Promise<JMAPResponse> {
    const response = await fetch(`${this.config.baseUrl}/.well-known/jmap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify({
        using: [
          'urn:ietf:params:jmap:core',
          'urn:ietf:params:jmap:mail',
          'urn:ietf:params:jmap:calendars',
          'urn:ietf:params:jmap:contacts',
        ],
        methodCalls: calls,
      }),
    });

    if (!response.ok) {
      throw new Error(`JMAP request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // ── Session Discovery ──

  async getSession(): Promise<JMAPSession> {
    const response = await fetch(`${this.config.baseUrl}/.well-known/jmap`, {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`JMAP session discovery failed: ${response.status}`);
    }

    return response.json();
  }

  // ── Calendar Operations ──

  async getCalendars(): Promise<JMAPCalendar[]> {
    const session = await this.getSession();
    const calAccountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:calendars');

    if (!calAccountId) {
      return [];
    }

    const result = await this.request([
      [
        'Calendar/get',
        {
          accountId: calAccountId,
          ids: null, // Get all
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'Calendar/get');
    return (response?.[1] as any)?.list ?? [];
  }

  async getCalendarEvents(calendarIds?: string[], start?: Date, end?: Date): Promise<JSCalendarEvent[]> {
    const session = await this.getSession();
    const calAccountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:calendars');

    if (!calAccountId) {
      return [];
    }

    const filter: Record<string, unknown> = {};
    if (calendarIds) {
      filter.calendarIds = calendarIds;
    }
    if (start) {
      filter.after = start.toISOString();
    }
    if (end) {
      filter.before = end.toISOString();
    }

    const result = await this.request([
      [
        'CalendarEvent/get',
        {
          accountId: calAccountId,
          ids: null,
          properties: [
            'id', 'calendarId', 'uid', 'title', 'description',
            'start', 'duration', 'timeZone', 'location',
            'participants', 'status', 'priority', 'privacy',
            'recurrenceRules', 'alerts',
          ],
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'CalendarEvent/get');
    return (response?.[1] as any)?.list ?? [];
  }

  async createCalendarEvent(event: Partial<JSCalendarEvent>): Promise<JSCalendarEvent | null> {
    const session = await this.getSession();
    const calAccountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:calendars');

    if (!calAccountId) {
      return null;
    }

    const result = await this.request([
      [
        'CalendarEvent/set',
        {
          accountId: calAccountId,
          create: {
            'new-event': {
              ...event,
              '@type': 'Event',
              uid: event.uid ?? crypto.randomUUID(),
            },
          },
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'CalendarEvent/set');
    const created = (response?.[1] as any)?.created?.['new-event'];
    return created ?? null;
  }

  async updateCalendarEvent(eventId: string, updates: Partial<JSCalendarEvent>): Promise<boolean> {
    const session = await this.getSession();
    const calAccountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:calendars');

    if (!calAccountId) {
      return false;
    }

    const result = await this.request([
      [
        'CalendarEvent/set',
        {
          accountId: calAccountId,
          update: {
            [eventId]: updates,
          },
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'CalendarEvent/set');
    return !!(response?.[1] as any)?.updated?.[eventId];
  }

  async deleteCalendarEvent(eventId: string): Promise<boolean> {
    const session = await this.getSession();
    const calAccountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:calendars');

    if (!calAccountId) {
      return false;
    }

    const result = await this.request([
      [
        'CalendarEvent/set',
        {
          accountId: calAccountId,
          destroy: [eventId],
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'CalendarEvent/set');
    return (response?.[1] as any)?.destroyed?.includes(eventId) ?? false;
  }

  // ── Contact Operations (JSContact RFC 9553) ──

  async getContactLists(): Promise<JMAPContactList[]> {
    const session = await this.getSession();
    const accountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:contacts');

    if (!accountId) {
      return [];
    }

    const result = await this.request([
      [
        'ContactList/get',
        {
          accountId,
          ids: null,
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'ContactList/get');
    return (response?.[1] as any)?.list ?? [];
  }

  async getContacts(contactListId?: string): Promise<JSContact[]> {
    const session = await this.getSession();
    const accountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:contacts');

    if (!accountId) {
      return [];
    }

    const filter: Record<string, unknown> = {};
    if (contactListId) {
      filter.contactListId = contactListId;
    }

    const result = await this.request([
      [
        'Contact/get',
        {
          accountId,
          ids: null,
          properties: [
            'id', 'contactListId', 'uid', 'name', 'firstName', 'lastName',
            'emails', 'phones', 'addresses', 'organizations',
            'photo', 'birthday', 'notes', 'tags',
          ],
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'Contact/get');
    return (response?.[1] as any)?.list ?? [];
  }

  async createContact(contact: Partial<JSContact>): Promise<JSContact | null> {
    const session = await this.getSession();
    const accountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:contacts');

    if (!accountId) {
      return null;
    }

    const result = await this.request([
      [
        'Contact/set',
        {
          accountId,
          create: {
            'new-contact': {
              ...contact,
              '@type': 'Contact',
              uid: contact.uid ?? crypto.randomUUID(),
            },
          },
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'Contact/set');
    const created = (response?.[1] as any)?.created?.['new-contact'];
    return created ?? null;
  }

  async updateContact(contactId: string, updates: Partial<JSContact>): Promise<boolean> {
    const session = await this.getSession();
    const accountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:contacts');

    if (!accountId) {
      return false;
    }

    const result = await this.request([
      [
        'Contact/set',
        {
          accountId,
          update: {
            [contactId]: updates,
          },
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'Contact/set');
    return !!(response?.[1] as any)?.updated?.[contactId];
  }

  async deleteContact(contactId: string): Promise<boolean> {
    const session = await this.getSession();
    const accountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:contacts');

    if (!accountId) {
      return false;
    }

    const result = await this.request([
      [
        'Contact/set',
        {
          accountId,
          destroy: [contactId],
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'Contact/set');
    return (response?.[1] as any)?.destroyed?.includes(contactId) ?? false;
  }

  // ── Free/Busy Query ──

  async getFreeBusy(calendarIds: string[], start: Date, end: Date): Promise<JMAPFreeBusy[]> {
    const session = await this.getSession();
    const accountId = this.getPrimaryAccountId(session, 'urn:ietf:params:jmap:calendars');

    if (!accountId) {
      return [];
    }

    const result = await this.request([
      [
        'CalendarEvent/freeBusy',
        {
          accountId,
          calendarIds,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        'c0',
      ],
    ]);

    const response = result.methodResponses.find((r) => r[0] === 'CalendarEvent/freeBusy');
    return (response?.[1] as any)?.busy ?? [];
  }

  // ── Helpers ──

  private getPrimaryAccountId(session: JMAPSession, capability: string): string | null {
    const accounts = session.accounts ?? {};
    for (const [id, account] of Object.entries(accounts)) {
      if (account.accountCapabilities?.[capability]) {
        return id;
      }
    }
    return session.primaryAccounts?.['urn:ietf:params:jmap:mail'] ?? null;
  }
}

// ── JMAP Types ──

type JMAPCall = [string, Record<string, unknown>, string];

interface JMAPResponse {
  methodResponses: [string, Record<string, unknown>, string][];
  sessionState?: string;
}

interface JMAPSession {
  username: string;
  accounts: Record<string, {
    name: string;
    isPersonal: boolean;
    isReadOnly: boolean;
    accountCapabilities: Record<string, unknown>;
  }>;
  primaryAccounts: Record<string, string>;
  capabilities: Record<string, unknown>;
}

// ── Calendar Types (JSCalendar RFC 8984) ──

export interface JMAPCalendar {
  id: string;
  name: string;
  color?: string;
  description?: string;
  sortOrder?: number;
  isVisible?: boolean;
  mayReadItems?: boolean;
  mayAddItems?: boolean;
  mayModifyItems?: boolean;
  mayRemoveItems?: boolean;
  mayRename?: boolean;
  mayDelete?: boolean;
}

export interface JSCalendarEvent {
  '@type': 'Event';
  id: string;
  calendarId: string;
  uid: string;
  title: string;
  description?: string;
  start: string;           // RFC 5545 DATE-TIME or DATE
  duration: string;        // RFC 5545 DURATION (e.g., "PT1H30M")
  timeZone?: string;
  location?: {
    '@type': 'Location';
    name?: string;
    uri?: string;
    coordinates?: string;  // "geo:lat,lon"
  };
  participants?: Record<string, {
    '@type': 'Participant';
    name: string;
    email: string;
    roles: string[];
    participationStatus?: 'accepted' | 'declined' | 'tentative' | 'needs-action';
    sendTo?: Record<string, string>;
  }>;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  priority?: number;
  privacy?: 'public' | 'private' | 'secret';
  recurrenceRules?: {
    '@type': 'RecurrenceRule';
    frequency: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly' | 'minutely' | 'secondly';
    interval?: number;
    byDay?: string[];
    byMonth?: number[];
    until?: string;
    count?: number;
  }[];
  alerts?: {
    '@type': 'Alert';
    trigger: {
      '@type': 'OffsetTrigger';
      offset: string; // RFC 5545 DURATION (e.g., "-PT15M" for 15 min before)
    };
  }[];
  created?: string;
  updated?: string;
}

// ── Contact Types (JSContact RFC 9553) ──

export interface JMAPContactList {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  isVisible?: boolean;
}

export interface JSContact {
  '@type': 'Contact';
  id: string;
  contactListId?: string;
  uid: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  emails?: {
    '@type': 'EmailAddress';
    email: string;
    contexts?: ('work' | 'home' | 'other')[];
    label?: string;
  }[];
  phones?: {
    '@type': 'Phone';
    phone: string;
    contexts?: ('work' | 'home' | 'mobile' | 'other')[];
    label?: string;
  }[];
  addresses?: {
    '@type': 'Address';
    street?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    contexts?: ('work' | 'home' | 'other')[];
    label?: string;
    coordinates?: string;
  }[];
  organizations?: {
    '@type': 'Organization';
    name: string;
    title?: string;
    department?: string;
  }[];
  photo?: string;         // URL or data URI
  birthday?: string;      // YYYY-MM-DD
  anniversary?: string;
  notes?: string;
  tags?: string[];
  created?: string;
  updated?: string;
}

// ── Free/Busy ──

export interface JMAPFreeBusy {
  calendarId: string;
  eventId?: string;
  start: string;
  end: string;
  busyType: 'busy' | 'tentative' | 'unavailable';
}
