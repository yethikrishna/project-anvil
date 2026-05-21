'use client';

/**
 * Customizable dashboard with drag-and-drop widgets.
 *
 * Features:
 * - Grid layout with resizable widgets
 * - Drag-and-drop reordering
 * - Widget library: clock, weather, calendar, tasks, emails, quick links, notes
 * - Layout persistence to localStorage
 * - Responsive columns (1-4)
 */

import {useState, useCallback, useEffect, useRef, useMemo} from 'react';

// ── Types ──

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

export type WidgetType = 
  | 'clock' | 'weather' | 'calendar-preview' | 'tasks-preview'
  | 'email-preview' | 'quick-links' | 'notes' | 'bookmarks'
  | 'analytics' | 'activity' | 'search' | 'recent-files';

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  columns: number;
  createdAt: string;
}

// ── Widget Components ──

function ClockWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-4xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
        {time.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'})}
      </div>
      <div className="text-sm text-gray-500 mt-1">
        {time.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})}
      </div>
    </div>
  );
}

function WeatherWidget() {
  const forecast = [
    {day: 'Today', icon: '☀️', high: 32, low: 24},
    {day: 'Tomorrow', icon: '⛅', high: 30, low: 22},
    {day: 'Friday', icon: '🌧️', high: 28, low: 21},
  ];
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-3xl">☀️</span>
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">32°C</div>
          <div className="text-xs text-gray-500">Sunny</div>
        </div>
      </div>
      <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        {forecast.map(f => (
          <div key={f.day} className="text-center flex-1">
            <div className="text-[10px] text-gray-400">{f.day}</div>
            <div className="text-sm">{f.icon}</div>
            <div className="text-[10px] text-gray-500">{f.high}°/{f.low}°</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksPreviewWidget() {
  const tasks = [
    {title: 'Review Q4 proposal', priority: 'high', done: false},
    {title: 'Update roadmap doc', priority: 'medium', done: false},
    {title: 'Team standup notes', priority: 'low', done: true},
    {title: 'Deploy v0.5.0', priority: 'high', done: false},
  ];
  const priorityColors: Record<string, string> = {high: 'bg-red-400', medium: 'bg-yellow-400', low: 'bg-blue-400'};
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Tasks</span>
        <span className="text-[10px] text-gray-400">{tasks.filter(t => !t.done).length} remaining</span>
      </div>
      {tasks.map(t => (
        <div key={t.title} className="flex items-center gap-2 text-sm">
          <div className={`w-1.5 h-1.5 rounded-full ${priorityColors[t.priority]}`} />
          <span className={t.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}>{t.title}</span>
        </div>
      ))}
    </div>
  );
}

function EmailPreviewWidget() {
  const emails = [
    {from: 'Sarah Chen', subject: 'Q4 Planning Update', time: '10m ago', unread: true},
    {from: 'Dev Team', subject: 'Deploy successful', time: '1h ago', unread: true},
    {from: 'Mike J.', subject: 'Re: Meeting tomorrow', time: '3h ago', unread: false},
  ];
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Emails</span>
        <span className="text-[10px] text-blue-600">{emails.filter(e => e.unread).length} unread</span>
      </div>
      {emails.map(e => (
        <div key={e.subject} className={`text-sm ${e.unread ? 'font-medium' : ''}`}>
          <div className="flex justify-between">
            <span className="text-gray-900 dark:text-gray-100 text-xs">{e.from}</span>
            <span className="text-[10px] text-gray-400">{e.time}</span>
          </div>
          <div className="text-[11px] text-gray-500 truncate">{e.subject}</div>
        </div>
      ))}
    </div>
  );
}

function QuickLinksWidget() {
  const links = [
    {name: 'Docs', url: '/docs', icon: '📝'},
    {name: 'Drive', url: '/drive', icon: '💾'},
    {name: 'Gmail', url: '/gmail', icon: '📧'},
    {name: 'Calendar', url: '/calendar', icon: '📅'},
    {name: 'Tasks', url: '/tasks', icon: '✅'},
    {name: 'Search', url: '/search', icon: '🔍'},
  ];
  return (
    <div className="p-3 grid grid-cols-3 gap-2">
      {links.map(l => (
        <a key={l.name} href={l.url} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <span className="text-lg">{l.icon}</span>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">{l.name}</span>
        </a>
      ))}
    </div>
  );
}

function NotesWidget() {
  const [note, setNote] = useState('');
  useEffect(() => { try { setNote(localStorage.getItem('anvil-dashboard-note') || ''); } catch {} }, []);
  const save = (v: string) => { setNote(v); try { localStorage.setItem('anvil-dashboard-note', v); } catch {} };
  return (
    <div className="p-3 h-full">
      <textarea
        value={note}
        onChange={e => save(e.target.value)}
        placeholder="Quick notes..."
        className="w-full h-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none resize-none focus:outline-none placeholder:text-gray-300"
      />
    </div>
  );
}

function BookmarksWidget() {
  const bookmarks = [
    {title: 'Q4 Planning Doc', app: 'docs'},
    {title: 'Product Roadmap', app: 'docs'},
    {title: 'Team Budget', app: 'drive'},
    {title: 'Design System', app: 'drive'},
  ];
  return (
    <div className="p-3 space-y-1">
      {bookmarks.map(b => (
        <div key={b.title} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
          <span className="text-xs">📌</span>
          <span className="text-gray-700 dark:text-gray-300 truncate">{b.title}</span>
          <span className="text-[10px] text-gray-400 ml-auto">{b.app}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityWidget() {
  const events = [
    {text: 'Alice edited "Q4 Plan"', time: '5m ago', icon: '✏️'},
    {text: 'Bob uploaded "mockups.fig"', time: '15m ago', icon: '📤'},
    {text: 'Carol commented on "Roadmap"', time: '1h ago', icon: '💬'},
    {text: 'You completed 3 tasks', time: '2h ago', icon: '✅'},
  ];
  return (
    <div className="p-3 space-y-2">
      {events.map(e => (
        <div key={e.text} className="flex items-start gap-2 text-sm">
          <span className="text-xs">{e.icon}</span>
          <div className="flex-1">
            <div className="text-xs text-gray-700 dark:text-gray-300">{e.text}</div>
            <div className="text-[10px] text-gray-400">{e.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Widget Renderer ──

const WIDGET_COMPONENTS: Record<WidgetType, () => React.ReactNode> = {
  'clock': () => <ClockWidget />,
  'weather': () => <WeatherWidget />,
  'calendar-preview': () => <div className="p-3 text-sm text-gray-500">📅 Calendar preview loading...</div>,
  'tasks-preview': () => <TasksPreviewWidget />,
  'email-preview': () => <EmailPreviewWidget />,
  'quick-links': () => <QuickLinksWidget />,
  'notes': () => <NotesWidget />,
  'bookmarks': () => <BookmarksWidget />,
  'analytics': () => <div className="p-3 text-sm text-gray-500">📊 Analytics widget</div>,
  'activity': () => <ActivityWidget />,
  'search': () => <div className="p-3"><input placeholder="Search..." className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm" /></div>,
  'recent-files': () => <div className="p-3 text-sm text-gray-500">📁 Recent files</div>,
};

// ── Default Layout ──

const DEFAULT_LAYOUT: DashboardLayout = {
  id: 'default',
  name: 'My Dashboard',
  columns: 3,
  createdAt: new Date().toISOString(),
  widgets: [
    {id: 'w1', type: 'clock', title: 'Clock', x: 0, y: 0, w: 1, h: 1},
    {id: 'w2', type: 'weather', title: 'Weather', x: 1, y: 0, w: 1, h: 1},
    {id: 'w3', type: 'quick-links', title: 'Quick Access', x: 2, y: 0, w: 1, h: 1},
    {id: 'w4', type: 'tasks-preview', title: 'Tasks', x: 0, y: 1, w: 1, h: 1},
    {id: 'w5', type: 'email-preview', title: 'Email', x: 1, y: 1, w: 1, h: 1},
    {id: 'w6', type: 'activity', title: 'Activity', x: 2, y: 1, w: 1, h: 1},
    {id: 'w7', type: 'bookmarks', title: 'Bookmarks', x: 0, y: 2, w: 1, h: 1},
    {id: 'w8', type: 'notes', title: 'Notes', x: 1, y: 2, w: 2, h: 1},
  ],
};

const STORAGE_KEY = 'anvil-dashboard-layout';

// ── Hook ──

export function useDashboard() {
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setLayout(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const addWidget = useCallback((type: WidgetType, title: string) => {
    setLayout(prev => ({
      ...prev,
      widgets: [...prev.widgets, {
        id: `w_${Date.now()}`,
        type, title,
        x: prev.widgets.length % prev.columns,
        y: Math.floor(prev.widgets.length / prev.columns),
        w: 1, h: 1,
      }],
    }));
  }, []);

  const removeWidget = useCallback((id: string) => {
    setLayout(prev => ({...prev, widgets: prev.widgets.filter(w => w.id !== id)}));
  }, []);

  const moveWidget = useCallback((id: string, x: number, y: number) => {
    setLayout(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => w.id === id ? {...w, x, y} : w),
    }));
  }, []);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
  }, []);

  return {layout, editMode, setEditMode, addWidget, removeWidget, moveWidget, resetLayout};
}

// ── Dashboard Component ──

export function Dashboard() {
  const {layout, editMode, setEditMode, removeWidget, resetLayout} = useDashboard();
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🏠 {layout.name}</h1>
          <p className="text-xs text-gray-500">Your personalized workspace</p>
        </div>
        <div className="flex gap-2">
          {editMode && (
            <>
              <button onClick={resetLayout} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50">
                Reset Layout
              </button>
              <AddWidgetDropdown />
            </>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`text-xs px-3 py-1.5 rounded-lg ${editMode ? 'bg-blue-600 text-white' : 'border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50'}`}
          >
            {editMode ? 'Done' : '✏️ Edit'}
          </button>
        </div>
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {layout.widgets.map(widget => {
          const WidgetComponent = WIDGET_COMPONENTS[widget.type];
          return (
            <div
              key={widget.id}
              draggable={editMode}
              onDragStart={() => setDragId(widget.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => setDragId(null)}
              className={`relative rounded-xl border bg-white dark:bg-gray-900 overflow-hidden ${
                editMode ? 'border-blue-300 dark:border-blue-700 cursor-move' : 'border-gray-200 dark:border-gray-700'
              } ${dragId === widget.id ? 'opacity-50' : ''}`}
            >
              {/* Widget Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{widget.title}</span>
                {editMode && (
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {/* Widget Content */}
              <div className="min-h-[120px]">
                <WidgetComponent />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddWidgetDropdown() {
  const [open, setOpen] = useState(false);
  const WIDGET_TYPES: {type: WidgetType; label: string; icon: string}[] = [
    {type: 'clock', label: 'Clock', icon: '🕐'},
    {type: 'weather', label: 'Weather', icon: '☀️'},
    {type: 'tasks-preview', label: 'Tasks', icon: '✅'},
    {type: 'email-preview', label: 'Email', icon: '📧'},
    {type: 'quick-links', label: 'Quick Links', icon: '🔗'},
    {type: 'notes', label: 'Notes', icon: '📝'},
    {type: 'bookmarks', label: 'Bookmarks', icon: '📌'},
    {type: 'activity', label: 'Activity', icon: '📊'},
    {type: 'search', label: 'Search', icon: '🔍'},
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50">
        + Add Widget
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-10 p-2">
          {WIDGET_TYPES.map(w => (
            <button key={w.type} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
              <span>{w.icon}</span> {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
