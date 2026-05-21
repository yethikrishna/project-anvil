'use client';

import { useState, useMemo } from 'react';
import { cn } from '@anvil/ui';
import type { JSCalendarEvent } from '../lib/jmap-calendar-contacts';

// ── Mock Calendar Data (would come from JMAP in production) ──

const MOCK_CALENDARS = [
  { id: 'cal-1', name: 'Personal', color: '#4285F4' },
  { id: 'cal-2', name: 'Work', color: '#34A853' },
  { id: 'cal-3', name: 'Reminders', color: '#FBBC05' },
];

const MOCK_EVENTS: (JSCalendarEvent & { calendarId: string })[] = [
  {
    '@type': 'Event',
    id: 'evt-1',
    calendarId: 'cal-2',
    uid: 'uid-1',
    title: 'Sprint Planning',
    description: 'Plan next sprint with the team',
    start: '2026-05-21T09:00:00',
    duration: 'PT1H',
    timeZone: 'UTC',
    status: 'confirmed',
    participants: {
      'p1': { '@type': 'Participant', name: 'Sarah Chen', email: 'sarah@company.com', roles: ['attendee'], participationStatus: 'accepted' },
      'p2': { '@type': 'Participant', name: 'Alex Rivera', email: 'alex@startup.io', roles: ['attendee'], participationStatus: 'needs-action' },
    },
  },
  {
    '@type': 'Event',
    id: 'evt-2',
    calendarId: 'cal-1',
    uid: 'uid-2',
    title: 'Coffee with Alex',
    description: 'Catch up at the usual spot',
    start: '2026-05-22T14:00:00',
    duration: 'PT45M',
    timeZone: 'UTC',
    status: 'confirmed',
  },
  {
    '@type': 'Event',
    id: 'evt-3',
    calendarId: 'cal-2',
    uid: 'uid-3',
    title: 'Project Anvil Demo',
    description: 'Show off the full-stack Google clone to the team',
    start: '2026-05-23T15:00:00',
    duration: 'PT30M',
    timeZone: 'UTC',
    status: 'confirmed',
    participants: {
      'p1': { '@type': 'Participant', name: 'Team', email: 'team@company.com', roles: ['attendee'], participationStatus: 'accepted' },
    },
  },
  {
    '@type': 'Event',
    id: 'evt-4',
    calendarId: 'cal-1',
    uid: 'uid-4',
    title: 'Dentist Appointment',
    start: '2026-05-25T10:30:00',
    duration: 'PT1H',
    timeZone: 'UTC',
    status: 'confirmed',
  },
  {
    '@type': 'Event',
    id: 'evt-5',
    calendarId: 'cal-2',
    uid: 'uid-5',
    title: '1:1 with Manager',
    start: '2026-05-21T14:00:00',
    duration: 'PT30M',
    timeZone: 'UTC',
    status: 'confirmed',
  },
  {
    '@type': 'Event',
    id: 'evt-6',
    calendarId: 'cal-3',
    uid: 'uid-6',
    title: 'Submit expense report',
    start: '2026-05-23T09:00:00',
    duration: 'PT0S',
    timeZone: 'UTC',
    status: 'confirmed',
  },
];

// ── Helpers ──

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function parseDuration(dur: string): number {
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 60;
  return (parseInt(match[1] || '0') * 60) + parseInt(match[2] || '0');
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isSameDay(dateStr: string, year: number, month: number, day: number): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

// ── Event Form Modal ──

function EventFormModal({
  initialDate,
  onSave,
  onClose,
}: {
  initialDate?: Date;
  onSave: (event: Partial<JSCalendarEvent>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate ? initialDate.toISOString().slice(0, 10) : '');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [description, setDescription] = useState('');
  const [calendarId, setCalendarId] = useState('cal-1');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title,
      start: `${date}T${startTime}:00`,
      duration: `PT${duration}M`,
      description,
      calendarId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">New Event</h3>
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {MOCK_CALENDARS.map((cal) => (
              <option key={cal.id} value={cal.id}>{cal.name}</option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description"
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Event Detail Panel ──

function EventDetail({ event, onClose }: { event: JSCalendarEvent; onClose: () => void }) {
  const cal = MOCK_CALENDARS.find((c) => c.id === event.calendarId);
  const durationMin = parseDuration(event.duration);
  const participants = event.participants ? Object.values(event.participants as Record<string, {name: string; participationStatus?: string; email?: string}>) : [];

  return (
    <div className="p-4 border-b border-gray-200 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cal?.color || '#4285F4' }} />
          <h3 className="font-semibold text-gray-900">{event.title}</h3>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="text-sm text-gray-600 space-y-1">
        <p>📅 {new Date(event.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p>🕐 {formatTime(event.start)} · {durationMin} min</p>
        {event.description && <p className="text-gray-500 mt-2">{event.description}</p>}
        {participants.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-400 mb-1">Guests</p>
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span>{p.name}</span>
                {p.participationStatus && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full',
                    p.participationStatus === 'accepted' ? 'bg-green-100 text-green-700' :
                    p.participationStatus === 'declined' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  )}>
                    {p.participationStatus}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Calendar View ──

export default function CalendarView() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [events, setEvents] = useState(MOCK_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<JSCalendarEvent | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [view, setView] = useState<'month' | 'agenda'>('month');

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const todayDate = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const handleCreateEvent = (event: Partial<JSCalendarEvent>) => {
    const newEvent: JSCalendarEvent & { calendarId: string } = {
      '@type': 'Event',
      id: `evt-${Date.now()}`,
      calendarId: event.calendarId || 'cal-1',
      uid: crypto.randomUUID(),
      title: event.title || 'Untitled Event',
      start: event.start || new Date().toISOString(),
      duration: event.duration || 'PT1H',
      description: event.description,
      status: 'confirmed',
    };
    setEvents((prev) => [...prev, newEvent]);
  };

  // Agenda view: events for current month, sorted by date
  const agendaEvents = useMemo(() => {
    return events
      .filter((e) => {
        const d = new Date(e.start);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, currentYear, currentMonth]);

  // Calendar grid cells
  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [firstDay, daysInMonth]);

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setCurrentYear(todayYear); setCurrentMonth(todayMonth); }}
            className="text-lg font-semibold text-gray-900 hover:text-blue-600"
          >
            {MONTHS[currentMonth]} {currentYear}
          </button>
          <div className="flex items-center gap-1">
            <button onClick={handlePrevMonth} className="p-1.5 rounded hover:bg-gray-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button onClick={handleNextMonth} className="p-1.5 rounded hover:bg-gray-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('month')}
              className={cn('px-3 py-1 text-xs rounded-md', view === 'month' ? 'bg-white shadow-sm font-medium' : 'text-gray-500')}
            >Month</button>
            <button
              onClick={() => setView('agenda')}
              className={cn('px-3 py-1 text-xs rounded-md', view === 'agenda' ? 'bg-white shadow-sm font-medium' : 'text-gray-500')}
            >Agenda</button>
          </div>
          <button
            onClick={() => { setFormDate(undefined); setShowEventForm(true); }}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium"
          >
            + New Event
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main calendar area */}
        <div className="flex-1 overflow-auto">
          {view === 'month' ? (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-200">
                {DAYS.map((day) => (
                  <div key={day} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">{day}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 flex-1">
                {calendarCells.map((day, i) => {
                  if (day === null) {
                    return <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-gray-100 bg-gray-50/50" />;
                  }

                  const dayEvents = events.filter((e) => isSameDay(e.start, currentYear, currentMonth, day));
                  const isToday = day === todayDate && currentMonth === todayMonth && currentYear === todayYear;

                  return (
                    <div
                      key={day}
                      className={cn(
                        'min-h-[90px] border-b border-r border-gray-100 p-1 cursor-pointer hover:bg-blue-50/30',
                      )}
                      onClick={() => { setFormDate(new Date(currentYear, currentMonth, day)); setShowEventForm(true); }}
                    >
                      <div className={cn(
                        'text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full',
                        isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                      )}>
                        {day}
                      </div>
                      {dayEvents.slice(0, 3).map((evt) => {
                        const cal = MOCK_CALENDARS.find((c) => c.id === evt.calendarId);
                        return (
                          <div
                            key={evt.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedEvent(evt); }}
                            className="text-[10px] px-1 py-0.5 rounded truncate cursor-pointer mb-0.5"
                            style={{ backgroundColor: `${cal?.color || '#4285F4'}20`, color: cal?.color || '#4285F4' }}
                          >
                            {formatTime(evt.start)} {evt.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Agenda view */
            <div className="divide-y divide-gray-100">
              {agendaEvents.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No events this month</div>
              ) : (
                agendaEvents.map((evt) => {
                  const cal = MOCK_CALENDARS.find((c) => c.id === evt.calendarId);
                  const d = new Date(evt.start);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className="flex items-start gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="text-center w-12 shrink-0">
                        <div className="text-xs text-gray-400 uppercase">{DAYS[d.getDay()]}</div>
                        <div className="text-lg font-semibold text-gray-900">{d.getDate()}</div>
                      </div>
                      <div className="w-1 rounded-full self-stretch" style={{ backgroundColor: cal?.color || '#4285F4' }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">{evt.title}</div>
                        <div className="text-xs text-gray-500">{formatTime(evt.start)} · {parseDuration(evt.duration)} min</div>
                        {evt.participants && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {Object.values(evt.participants as Record<string, {name: string}>).map((p) => p.name).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Event detail sidebar */}
        {selectedEvent && (
          <div className="w-80 border-l border-gray-200 bg-white overflow-auto">
            <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        )}
      </div>

      {/* New event modal */}
      {showEventForm && (
        <EventFormModal
          initialDate={formDate}
          onSave={handleCreateEvent}
          onClose={() => setShowEventForm(false)}
        />
      )}
    </div>
  );
}
