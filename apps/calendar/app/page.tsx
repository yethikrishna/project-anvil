'use client';

import {useState, useMemo, useCallback} from 'react';
import {format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, getHours, getMinutes, setHours, setMinutes} from 'date-fns';
import {AppShell, ThemeProvider, ThemeToggle, Button, Card} from '@anvil/ui';
import {NotificationProvider, NotificationBell} from '@anvil/notifications';
import {CalendarEvent, EVENT_COLORS, expandRecurrence, findAvailableSlots} from '../lib/events';

// ── Demo Events ──

const DEMO_EVENTS: CalendarEvent[] = [
  {
    id: 'e1', title: 'Team Standup', start: new Date(Date.now() + 3600000).toISOString(), end: new Date(Date.now() + 7200000).toISOString(),
    calendarId: 'work', userId: 'u1', color: '#3b82f6', createdAt: '', updatedAt: '',
    recurrence: 'RRULE:FREQ=DAILY;COUNT=30',
  },
  {
    id: 'e2', title: 'Lunch with Sarah', start: new Date(Date.now() + 86400000 + 43200000).toISOString(), end: new Date(Date.now() + 86400000 + 50400000).toISOString(),
    calendarId: 'personal', userId: 'u1', color: '#10b981', location: 'Cafe Luna', createdAt: '', updatedAt: '',
  },
  {
    id: 'e3', title: 'Sprint Review', start: new Date(Date.now() + 172800000 + 46800000).toISOString(), end: new Date(Date.now() + 172800000 + 54000000).toISOString(),
    calendarId: 'work', userId: 'u1', color: '#f59e0b', createdAt: '', updatedAt: '',
    attendees: [{email: 'team@anvil.dev', status: 'accepted'}],
  },
  {
    id: 'e4', title: 'Gym', start: new Date(Date.now() + 259200000 + 25200000).toISOString(), end: new Date(Date.now() + 259200000 + 32400000).toISOString(),
    calendarId: 'personal', userId: 'u1', color: '#8b5cf6', createdAt: '', updatedAt: '',
    recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12',
  },
  {
    id: 'e5', title: 'Project Deadline', start: new Date(Date.now() + 604800000).toISOString(), end: new Date(Date.now() + 604800000).toISOString(),
    allDay: true, calendarId: 'work', userId: 'u1', color: '#ef4444', createdAt: '', updatedAt: '',
  },
];

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [events] = useState<CalendarEvent[]>(DEMO_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showSmartSchedule, setShowSmartSchedule] = useState(false);

  const navigate = useCallback((dir: 'prev' | 'next' | 'today') => {
    if (dir === 'today') return setCurrentDate(new Date());
    const fn = dir === 'next'
      ? (viewMode === 'month' ? addMonths : viewMode === 'week' ? addWeeks : addDays)
      : (viewMode === 'month' ? subMonths : viewMode === 'week' ? subWeeks : subDays);
    setCurrentDate(d => fn(d, 1));
  }, [viewMode]);

  // Get expanded events for current view range
  const viewEvents = useMemo(() => {
    const rangeStart = viewMode === 'month'
      ? startOfWeek(startOfMonth(currentDate))
      : viewMode === 'week'
        ? startOfWeek(currentDate)
        : startOfDay(currentDate);

    const rangeEnd = viewMode === 'month'
      ? endOfWeek(endOfMonth(currentDate))
      : viewMode === 'week'
        ? endOfWeek(currentDate)
        : endOfDay(currentDate);

    return events.flatMap(e => expandRecurrence(e, rangeStart, rangeEnd));
  }, [events, currentDate, viewMode]);

  return (
    <ThemeProvider>
      <NotificationProvider userId="demo-user">
        <AppShell activeApp="calendar" notifications={<><ThemeToggle /><NotificationBell /></>}>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {viewMode === 'month' ? format(currentDate, 'MMMM yyyy') :
                   viewMode === 'week' ? `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}` :
                   format(currentDate, 'EEEE, MMMM d, yyyy')}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => navigate('today')}>Today</Button>
                <div className="flex items-center gap-1">
                  <button onClick={() => navigate('prev')} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600">
                    ‹
                  </button>
                  <button onClick={() => navigate('next')} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600">
                    ›
                  </button>
                </div>
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                        viewMode === mode
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <Button size="sm" onClick={() => setShowSmartSchedule(true)}>📅 Smart Schedule</Button>
                <Button size="sm" variant="primary" onClick={() => setShowNewEvent(true)}>+ New Event</Button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 overflow-auto">
              {viewMode === 'month' && <MonthView currentDate={currentDate} events={viewEvents} onSelectEvent={setSelectedEvent} />}
              {viewMode === 'week' && <WeekView currentDate={currentDate} events={viewEvents} onSelectEvent={setSelectedEvent} />}
              {viewMode === 'day' && <DayView currentDate={currentDate} events={viewEvents} onSelectEvent={setSelectedEvent} />}
            </div>
          </div>

          {/* Event Detail Modal */}
          {selectedEvent && (
            <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          )}

          {/* New Event Modal */}
          {showNewEvent && (
            <NewEventModal onClose={() => setShowNewEvent(false)} />
          )}

          {/* Smart Schedule Modal */}
          {showSmartSchedule && (
            <SmartScheduleModal events={events} onClose={() => setShowSmartSchedule(false)} />
          )}
        </AppShell>
      </NotificationProvider>
    </ThemeProvider>
  );
}

// ── Helpers ──

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59); }

function getEventsForDay(events: CalendarEvent[], day: Date) {
  return events.filter(e => isSameDay(new Date(e.start), day));
}

// ── Month View ──

function MonthView({currentDate, events, onSelectEvent}: {currentDate: Date; events: CalendarEvent[]; onSelectEvent: (e: CalendarEvent) => void}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({start: calStart, end: calEnd});
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {weekDays.map(day => (
          <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {days.map((day, i) => {
          const dayEvents = getEventsForDay(events, day);
          const inMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={i}
              className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 min-h-[80px] ${
                !inMonth ? 'bg-gray-50 dark:bg-gray-900/50' : ''
              } ${isToday(day) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
            >
              <div className={`text-xs mb-1 ${
                isToday(day) ? 'font-bold text-blue-600' : inMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'
              }`}>
                {format(day, 'd')}
              </div>
              {dayEvents.slice(0, 3).map(event => (
                <button
                  key={event.id}
                  onClick={() => onSelectEvent(event)}
                  className="w-full text-left text-[10px] px-1 py-0.5 rounded mb-0.5 truncate hover:opacity-80"
                  style={{backgroundColor: `${event.color ?? '#3b82f6'}20`, color: event.color ?? '#3b82f6'}}
                >
                  {!event.allDay && format(new Date(event.start), 'h:mm ')}{event.title}
                </button>
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ──

function WeekView({currentDate, events, onSelectEvent}: {currentDate: Date; events: CalendarEvent[]; onSelectEvent: (e: CalendarEvent) => void}) {
  const weekStart = startOfWeek(currentDate);
  const days = eachDayOfInterval({start: weekStart, end: addDays(weekStart, 6)});
  const hours = Array.from({length: 24}, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
        <div className="w-16 shrink-0" />
        {days.map((day, i) => (
          <div key={i} className={`flex-1 text-center py-2 text-xs ${isToday(day) ? 'font-bold text-blue-600' : 'text-gray-600 dark:text-gray-400'}`}>
            <div>{format(day, 'EEE')}</div>
            <div className={`text-lg ${isToday(day) ? 'bg-blue-600 text-white w-8 h-8 rounded-full mx-auto flex items-center justify-center' : ''}`}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        {hours.map(hour => (
          <div key={hour} className="flex border-b border-gray-50 dark:border-gray-800" style={{height: '48px'}}>
            <div className="w-16 shrink-0 text-[10px] text-gray-400 text-right pr-2 pt-1">
              {hour === 0 ? '' : format(setHours(new Date(), hour), 'h a')}
            </div>
            {days.map((day, di) => {
              const hourEvents = events.filter(e => {
                const start = new Date(e.start);
                return isSameDay(start, day) && getHours(start) === hour;
              });

              return (
                <div key={di} className="flex-1 border-l border-gray-100 dark:border-gray-800 relative">
                  {hourEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                      className="absolute left-0.5 right-0.5 rounded px-1 text-[10px] text-white truncate z-10"
                      style={{
                        backgroundColor: event.color ?? '#3b82f6',
                        top: `${(getMinutes(new Date(event.start)) / 60) * 100}%`,
                        height: '24px',
                      }}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day View ──

function DayView({currentDate, events, onSelectEvent}: {currentDate: Date; events: CalendarEvent[]; onSelectEvent: (e: CalendarEvent) => void}) {
  const dayEvents = getEventsForDay(events, currentDate);
  const hours = Array.from({length: 24}, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      <div className="text-center py-3 border-b border-gray-200 dark:border-gray-700">
        <span className={`text-3xl font-bold ${isToday(currentDate) ? 'text-blue-600' : 'text-gray-900 dark:text-gray-100'}`}>
          {format(currentDate, 'd')}
        </span>
        <span className="text-sm text-gray-500 ml-2">{format(currentDate, 'EEEE, MMMM yyyy')}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {hours.map(hour => {
          const hourEvents = dayEvents.filter(e => getHours(new Date(e.start)) === hour);

          return (
            <div key={hour} className="flex border-b border-gray-50 dark:border-gray-800" style={{height: '64px'}}>
              <div className="w-20 shrink-0 text-xs text-gray-400 text-right pr-3 pt-2">
                {format(setHours(new Date(), hour), 'h:mm a')}
              </div>
              <div className="flex-1 border-l border-gray-200 dark:border-gray-700 relative px-1 py-0.5">
                {hourEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    className="w-full text-left rounded-lg px-3 py-2 mb-1 text-sm text-white"
                    style={{backgroundColor: event.color ?? '#3b82f6'}}
                  >
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs opacity-80">
                      {format(new Date(event.start), 'h:mm')} – {format(new Date(event.end), 'h:mm a')}
                      {event.location && ` • ${event.location}`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Detail Modal ──

function EventDetailModal({event, onClose}: {event: CalendarEvent; onClose: () => void}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full mt-2 shrink-0" style={{backgroundColor: event.color ?? '#3b82f6'}} />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{event.title}</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
              <div>📅 {event.allDay ? 'All day' : `${format(new Date(event.start), 'PPPp')} – ${format(new Date(event.end), 'p')}`}</div>
              {event.location && <div>📍 {event.location}</div>}
              {event.description && <div className="mt-2">{event.description}</div>}
              {event.attendees?.length && (
                <div className="mt-2">
                  <span className="text-xs font-semibold">Attendees:</span>
                  <div className="mt-1 space-y-1">
                    {event.attendees.map(a => (
                      <div key={a.email} className="text-xs flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${a.status === 'accepted' ? 'bg-green-500' : a.status === 'declined' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                        {a.name ?? a.email} ({a.status})
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {event.source && <div className="text-xs text-gray-400">Source: {event.source}</div>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="danger">Delete</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ── New Event Modal ──

function NewEventModal({onClose}: {onClose: () => void}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">New Event</h2>
        <div className="space-y-3">
          <input placeholder="Event title" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input type="datetime-local" className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
            <input type="datetime-local" className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
          <input placeholder="Location" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          <textarea placeholder="Description" rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm resize-none" />
          <div>
            <label className="text-xs font-medium text-gray-500">Recurrence</label>
            <select className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm">
              <option value="">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary">Create Event</Button>
        </div>
      </div>
    </div>
  );
}

// ── Smart Schedule Modal ──

function SmartScheduleModal({events, onClose}: {events: CalendarEvent[]; onClose: () => void}) {
  const slots = useMemo(() => {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    return findAvailableSlots({
      existingEvents: events,
      startDate: now,
      endDate: weekEnd,
      durationMinutes: 60,
    }).filter(s => s.available).slice(0, 10);
  }, [events]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Smart Schedule</h2>
        <p className="text-xs text-gray-500 mb-4">Available 1-hour slots in the next 7 days</p>

        {slots.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No available slots found</p>
        ) : (
          <div className="space-y-2">
            {slots.map((slot, i) => (
              <button
                key={i}
                className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
              >
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {format(slot.start, 'EEE, MMM d')}
                </div>
                <div className="text-xs text-gray-500">
                  {format(slot.start, 'h:mm a')} – {format(slot.end, 'h:mm a')}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
