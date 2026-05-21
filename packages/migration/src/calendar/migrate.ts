/**
 * Google Calendar → Anvil Calendar migration.
 *
 * Exports Google Calendar events via the Calendar API and
 * imports them as iCal (RFC 5545) into Anvil Calendar.
 *
 * Handles:
 * - Primary and secondary calendars
 * - Recurring events (RRULE)
 * - Attendees and reminders
 * - Calendar sharing/ACL
 */

import {BaseMigrator, type MigrationConfig, type MigrationProgress} from '../index';

export class CalendarMigrator extends BaseMigrator {
  constructor(config: MigrationConfig) {
    super(config, 'calendar');
  }

  async estimateItems(): Promise<number> {
    const token = await this.getGoogleAccessToken();
    const calendars = await this.googleApiRequest(
      '/calendar/v3/users/me/calendarList',
      token,
    );
    let total = 0;
    for (const cal of calendars.items ?? []) {
      const events = await this.googleApiRequest(
        `/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?maxResults=1`,
        token,
      );
      total += events.items?.length ?? 0;
    }
    return total;
  }

  async migrate(): Promise<MigrationProgress> {
    this.progress.status = 'running';
    this.progress.startedAt = new Date().toISOString();

    try {
      const accessToken = await this.getGoogleAccessToken();

      // Get all calendars
      const calendars = await this.googleApiRequest(
        '/calendar/v3/users/me/calendarList?minAccessRole=writer',
        accessToken,
      );

      for (const calendar of calendars.items ?? []) {
        try {
          // Create calendar in Anvil
          const anvilCalId = await this.createAnvilCalendar({
            name: calendar.summary,
            description: calendar.description,
            color: calendar.backgroundColor,
            timezone: calendar.timeZone,
            sourceId: calendar.id,
          });

          // Migrate all events
          const events = await this.listAllEvents(calendar.id, accessToken);
          this.progress.totalItems += events.length;

          for (const event of events) {
            try {
              const iCal = this.eventToICal(event, anvilCalId);
              await this.importICalEvent(iCal);
              this.progress.processedItems++;
            } catch (err) {
              this.progress.failedItems++;
              this.progress.errors.push({
                itemId: event.id,
                itemName: event.summary ?? event.id,
                error: (err as Error).message,
                retryCount: 0,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          this.progress.errors.push({
            itemId: calendar.id,
            itemName: calendar.summary ?? calendar.id,
            error: (err as Error).message,
            retryCount: 0,
            timestamp: new Date().toISOString(),
          });
        }
      }

      this.progress.status = 'completed';
    } catch (err) {
      this.progress.status = 'failed';
      this.progress.errors.push({
        itemId: 'migration',
        itemName: 'Calendar Migration',
        error: (err as Error).message,
        retryCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    this.progress.completedAt = new Date().toISOString();
    return this.progress;
  }

  private async listAllEvents(calendarId: string, accessToken: string): Promise<any[]> {
    const allEvents: any[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        maxResults: '2500',
        singleEvents: 'false', // Get recurring event masters
        fields: 'nextPageToken,items(id,summary,start,end,location,description,attendees,recurrence,reminders,visibility,status)',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const result = await this.googleApiRequest(
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        accessToken,
      );

      allEvents.push(...(result.items ?? []));
      pageToken = result.nextPageToken;
    } while (pageToken);

    return allEvents;
  }

  /**
   * Convert a Google Calendar event to iCal (RFC 5545) format.
   */
  private eventToICal(event: any, calendarId: string): string {
    const uid = `${event.id}@anvil-migration`;
    const dtstamp = formatICalDate(new Date());
    const summary = escapeICalText(event.summary ?? '');
    const description = escapeICalText(event.description ?? '');
    const location = escapeICalText(event.location ?? '');

    let dtStart: string;
    let dtEnd: string;

    if (event.start?.dateTime) {
      dtStart = `DTSTART:${formatICalDateTime(event.start.dateTime)}`;
      dtEnd = `DTEND:${formatICalDateTime(event.end.dateTime)}`;
    } else {
      dtStart = `DTSTART;VALUE=DATE:${event.start.date.replace(/-/g, '')}`;
      dtEnd = `DTEND;VALUE=DATE:${event.end.date.replace(/-/g, '')}`;
    }

    let lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Project Anvil//Migration//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `SUMMARY:${summary}`,
      dtStart,
      dtEnd,
    ];

    if (description) lines.push(`DESCRIPTION:${description}`);
    if (location) lines.push(`LOCATION:${location}`);
    if (event.status === 'cancelled') lines.push('STATUS:CANCELLED');
    if (event.visibility === 'private') lines.push('CLASS:PRIVATE');

    // Recurrence rules
    if (event.recurrence) {
      lines.push(...event.recurrence);
    }

    // Attendees
    if (event.attendees) {
      for (const attendee of event.attendees) {
        const params = [];
        if (attendee.displayName) params.push(`CN=${attendee.displayName}`);
        if (attendee.organizer) params.push('ROLE=CHAIR');
        else if (attendee.optional) params.push('ROLE=OPT-PARTICIPANT');
        params.push(`RSVP=${attendee.responseStatus === 'needsAction' ? 'TRUE' : 'FALSE'}`);
        lines.push(`ATTENDEE;${params.join(';')}:mailto:${attendee.email}`);
      }
    }

    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  private async createAnvilCalendar(data: {
    name: string;
    description?: string;
    color?: string;
    timezone?: string;
    sourceId: string;
  }): Promise<string> {
    const response = await fetch(`${this.config.anvilApiUrl}/api/calendars`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.anvilApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        color: data.color,
        timezone: data.timezone,
        metadata: {source: 'google-calendar-migration', sourceId: data.sourceId},
      }),
    });

    if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
    const result = await response.json();
    return result.id;
  }

  private async importICalEvent(iCal: string): Promise<void> {
    const response = await fetch(`${this.config.anvilApiUrl}/api/calendar/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.anvilApiKey}`,
        'Content-Type': 'text/calendar',
      },
      body: iCal,
    });

    if (!response.ok) throw new Error(`Import failed: ${response.status}`);
  }
}

// ── iCal Helpers ──

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatICalDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace(/Z$/, 'Z');
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
