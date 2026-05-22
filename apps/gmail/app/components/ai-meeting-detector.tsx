'use client';

/**
 * AI Meeting Detector — Anvil Mail
 *
 * Automatically detects meeting requests and event invitations in emails.
 * No external AI API needed for basic detection — uses pattern matching.
 * AI enhances the extraction for ambiguous or complex cases.
 *
 * Detects:
 * - Meeting invitations (Zoom, Teams, Google Meet, in-person)
 * - Calendar events and scheduling requests
 * - Interview requests
 * - Call requests (phone, video)
 *
 * Extracts:
 * - Date and time
 * - Duration
 * - Location / conference link
 * - Attendees
 * - Meeting title / agenda
 *
 * UI: Inline card "📅 Meeting detected — Add to Calendar"
 */

import {useState, useMemo} from 'react';

// ── Types ──

export interface DetectedMeeting {
  type: 'meeting' | 'call' | 'interview' | 'event' | 'scheduling-request';
  title: string;
  dateRaw: string;          // as found in email, e.g. "Tuesday, June 3rd at 2pm"
  dateISO?: string;         // YYYY-MM-DDTHH:mm if parseable
  durationMinutes?: number;
  location?: string;
  conferenceUrl?: string;
  platform?: 'zoom' | 'teams' | 'meet' | 'phone' | 'in-person' | 'other';
  attendees?: string[];
  agenda?: string;
  confidence: number;
}

export interface MeetingDetectionResult {
  hasMeeting: boolean;
  meetings: DetectedMeeting[];
}

// ── Patterns ──

const MEETING_SIGNALS = [
  /\b(meeting|call|sync|standup|stand-up|interview|catch up|catch-up|connect|chat|discussion)\b/i,
  /\b(scheduled|scheduling|invite|invitation|join|attend)\b/i,
  /\b(zoom|teams|google meet|webex|gotomeeting|bluejeans|whereby)\b/i,
  /\blet's\s+(meet|talk|connect|chat|sync)\b/i,
  /\b(coffee|lunch|dinner)\s+meeting\b/i,
  /\bvideo\s+(call|conference|meeting)\b/i,
  /\bphone\s+call\b/i,
  /\bare you\s+(free|available)\b/i,
  /\b(block|blocked|blocking|hold|reserve)\s+(your|the|some)\s+time\b/i,
  /\bcalendar\s+(invite|invitation|block)\b/i,
];

const DATE_PATTERNS = [
  /(?:this|next|coming)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
  /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?/gi,
  /\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g,
  /tomorrow|today|day after tomorrow/gi,
];

const TIME_PATTERNS = [
  /\d{1,2}:\d{2}\s*(?:am|pm)?/gi,
  /\d{1,2}\s*(?:am|pm)/gi,
  /noon|midnight|midday/gi,
];

const DURATION_PATTERNS = [
  /(\d+)\s*(?:hour|hr)s?/i,
  /(\d+)\s*(?:minute|min)s?/i,
  /(\d+)\s*-\s*(\d+)\s*(?:hour|hr)s?/i,
  /half\s+(?:an\s+)?hour/i,
  /45\s*min/i,
  /30\s*min/i,
];

const CONFERENCE_URLS = [
  /https?:\/\/(?:\w+\.)?zoom\.us\/[^\s<>"]+/gi,
  /https?:\/\/teams\.microsoft\.com\/[^\s<>"]+/gi,
  /https?:\/\/meet\.google\.com\/[^\s<>"]+/gi,
  /https?:\/\/(?:\w+\.)?webex\.com\/[^\s<>"]+/gi,
  /https?:\/\/whereby\.com\/[^\s<>"]+/gi,
];

// ── Extraction helpers ──

function extractDates(text: string): string[] {
  const dates: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern) || [];
    dates.push(...matches);
  }
  return [...new Set(dates)];
}

function extractTimes(text: string): string[] {
  const times: string[] = [];
  for (const pattern of TIME_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern) || [];
    times.push(...matches);
  }
  return [...new Set(times)];
}

function extractDuration(text: string): number | undefined {
  const halfHour = /half\s+(?:an\s+)?hour/i.test(text);
  if (halfHour) return 30;

  const hourMatch = text.match(/(\d+)\s*(?:hour|hr)s?/i);
  const minMatch = text.match(/(\d+)\s*(?:minute|min)s?/i);

  if (hourMatch && minMatch) {
    return parseInt(hourMatch[1]) * 60 + parseInt(minMatch[1]);
  }
  if (hourMatch) return parseInt(hourMatch[1]) * 60;
  if (minMatch) return parseInt(minMatch[1]);
  return undefined;
}

function extractConferenceUrl(text: string): {url: string; platform: DetectedMeeting['platform']} | null {
  for (const pattern of CONFERENCE_URLS) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    if (match) {
      let platform: DetectedMeeting['platform'] = 'other';
      if (match[0].includes('zoom.us')) platform = 'zoom';
      else if (match[0].includes('teams.microsoft')) platform = 'teams';
      else if (match[0].includes('meet.google')) platform = 'meet';
      else if (match[0].includes('webex')) platform = 'other';
      else if (match[0].includes('whereby')) platform = 'other';
      return {url: match[0], platform};
    }
  }
  return null;
}

function detectMeetingType(text: string): DetectedMeeting['type'] {
  if (/interview/i.test(text)) return 'interview';
  if (/phone\s+call|call\s+with/i.test(text)) return 'call';
  if (/\b(are you (free|available)|what time works|when (can|are) you)/i.test(text)) return 'scheduling-request';
  if (/\b(conference|summit|webinar|workshop|seminar)\b/i.test(text)) return 'event';
  return 'meeting';
}

function extractTitle(subject: string, type: DetectedMeeting['type']): string {
  // Clean subject line
  const cleaned = subject
    .replace(/^(Re:|Fwd?:|Fw:)\s*/gi, '')
    .replace(/^\[.+?\]\s*/, '')
    .trim();

  if (cleaned.length > 5) return cleaned;

  const typeLabels: Record<DetectedMeeting['type'], string> = {
    meeting: 'Meeting',
    call: 'Call',
    interview: 'Interview',
    event: 'Event',
    'scheduling-request': 'Scheduling Request',
  };
  return typeLabels[type];
}

// ── Main detection ──

export function detectMeetings(
  subject: string,
  body: string,
  fromName: string,
): MeetingDetectionResult {
  const text = `${subject}\n${body}`;
  const signalCount = MEETING_SIGNALS.filter(p => p.test(text)).length;

  if (signalCount === 0) return {hasMeeting: false, meetings: []};

  const type = detectMeetingType(text);
  const dates = extractDates(text);
  const times = extractTimes(text);
  const duration = extractDuration(text);
  const conference = extractConferenceUrl(text);

  const dateRaw = dates.length > 0
    ? times.length > 0
      ? `${dates[0]} at ${times[0]}`
      : dates[0]
    : times.length > 0
      ? times[0]
      : '';

  // Compute confidence
  let confidence = Math.min(1, signalCount * 0.15);
  if (dates.length > 0) confidence += 0.2;
  if (times.length > 0) confidence += 0.2;
  if (conference) confidence = Math.min(1, confidence + 0.3);
  confidence = Math.min(1, confidence);

  if (confidence < 0.25) return {hasMeeting: false, meetings: []};

  const meeting: DetectedMeeting = {
    type,
    title: extractTitle(subject, type),
    dateRaw,
    durationMinutes: duration,
    conferenceUrl: conference?.url,
    platform: conference?.platform || (body.toLowerCase().includes('phone') ? 'phone' : 'other'),
    attendees: [fromName],
    confidence,
  };

  return {hasMeeting: true, meetings: [meeting]};
}

// ── Platform icons ──

const PLATFORM_ICONS: Record<string, string> = {
  zoom: '🎥',
  teams: '👥',
  meet: '📹',
  phone: '📞',
  'in-person': '📍',
  other: '📅',
};

const TYPE_LABELS: Record<DetectedMeeting['type'], string> = {
  meeting: 'Meeting detected',
  call: 'Call request',
  interview: 'Interview request',
  event: 'Event invitation',
  'scheduling-request': 'Scheduling request',
};

// ── Component ──

interface MeetingDetectorCardProps {
  subject: string;
  body: string;
  fromName: string;
  onAddToCalendar?: (meeting: DetectedMeeting) => void;
  onDismiss?: () => void;
}

export function MeetingDetectorCard({
  subject, body, fromName, onAddToCalendar, onDismiss,
}: MeetingDetectorCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [addedToCalendar, setAddedToCalendar] = useState(false);

  const detection = useMemo(
    () => detectMeetings(subject, body, fromName),
    [subject, body, fromName],
  );

  if (!detection.hasMeeting || dismissed || detection.meetings.length === 0) return null;

  const meeting = detection.meetings[0];
  const icon = PLATFORM_ICONS[meeting.platform || 'other'];

  const handleAddToCalendar = () => {
    onAddToCalendar?.(meeting);
    setAddedToCalendar(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="mt-3 border border-indigo-100 rounded-xl bg-indigo-50 p-3">
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-lg flex-shrink-0">
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-indigo-800">
              {TYPE_LABELS[meeting.type]}
            </span>
            {meeting.platform && meeting.platform !== 'other' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full font-medium capitalize">
                {meeting.platform}
              </span>
            )}
          </div>

          <div className="text-sm font-medium text-gray-900 mt-0.5 truncate">
            {meeting.title}
          </div>

          {/* Details */}
          <div className="mt-1.5 space-y-0.5">
            {meeting.dateRaw && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <span>🕐</span>
                <span>{meeting.dateRaw}</span>
              </div>
            )}
            {meeting.durationMinutes && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>⏱️</span>
                <span>
                  {meeting.durationMinutes >= 60
                    ? `${meeting.durationMinutes / 60}h`
                    : `${meeting.durationMinutes} min`}
                </span>
              </div>
            )}
            {meeting.conferenceUrl && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>🔗</span>
                <a
                  href={meeting.conferenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 truncate max-w-[200px]"
                >
                  Join link
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {!addedToCalendar ? (
            <button
              onClick={handleAddToCalendar}
              className="text-xs px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium whitespace-nowrap"
            >
              + Calendar
            </button>
          ) : (
            <span className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-lg font-medium whitespace-nowrap">
              ✓ Added
            </span>
          )}
          <button
            onClick={handleDismiss}
            className="text-[10px] text-gray-400 hover:text-gray-600 text-center"
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-indigo-400 flex items-center gap-1">
        <span>✨ Auto-detected meeting</span>
        <span>·</span>
        <span>{Math.round(meeting.confidence * 100)}% confidence</span>
      </div>
    </div>
  );
}

// ── Hook ──

export function useMeetingDetection(subject: string, body: string, fromName: string) {
  return useMemo(
    () => detectMeetings(subject, body, fromName),
    [subject, body, fromName],
  );
}
