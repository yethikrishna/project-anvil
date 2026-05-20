'use client';

import {useState, useMemo, useCallback} from 'react';
import {format, isToday, isTomorrow, isPast} from 'date-fns';
import {AppShell, ThemeProvider, ThemeToggle, Button, Card} from '@anvil/ui';
import {NotificationProvider, NotificationBell} from '@anvil/notifications';
import type {Task, TaskStatus, TaskPriority} from '../lib/tasks';

type FilterView = 'all' | 'today' | 'upcoming' | 'pinned' | 'done';

const PRIORITY_CONFIG: Record<TaskPriority, {label: string; color: string; icon: string}> = {
  urgent: {label: 'Urgent', color: 'bg-red-500 text-white', icon: '🔴'},
  high: {label: 'High', color: 'bg-orange-100 text-orange-700', icon: '🟠'},
  medium: {label: 'Medium', color: 'bg-blue-100 text-blue-700', icon: '🔵'},
  low: {label: 'Low', color: 'bg-gray-100 text-gray-600', icon: '⚪'},
};

const STATUS_ICONS: Record<TaskStatus, string> = {
  todo: '⬜',
  in_progress: '🔄',
  done: '✅',
  archived: '📦',
};

const SOURCE_ICONS: Record<string, string> = {
  tasks: '📋',
  gmail: '✉️',
  docs: '📝',
  drive: '📁',
  calendar: '📅',
};

const DEMO_TASKS: Task[] = [
  {
    id: '1', title: 'Review Q1 budget proposal', description: 'Check the spreadsheet Sarah shared and add comments',
    status: 'in_progress', priority: 'high', dueDate: new Date(Date.now() + 86400000).toISOString(),
    sourceApp: 'gmail', sourceUrl: '/mail/thread/budget-q1', tags: ['work', 'finance'],
    subtasks: [{id: '1a', title: 'Download attachment', done: true}, {id: '1b', title: 'Review line items', done: false}, {id: '1c', title: 'Send feedback', done: false}],
    createdAt: new Date(Date.now() - 172800000).toISOString(), updatedAt: new Date().toISOString(), pinned: true, color: '#3b82f6',
  },
  {
    id: '2', title: 'Finish project documentation', description: 'Update the API docs and add examples',
    status: 'todo', priority: 'medium', dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    sourceApp: 'docs', sourceUrl: '/docs/project-docs', tags: ['work', 'docs'],
    subtasks: [], createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString(), pinned: false, color: '#10b981',
  },
  {
    id: '3', title: 'Buy groceries', status: 'todo', priority: 'low', tags: ['personal'],
    subtasks: [{id: '3a', title: 'Milk', done: false}, {id: '3b', title: 'Bread', done: false}, {id: '3c', title: 'Eggs', done: true}, {id: '3d', title: 'Vegetables', done: false}],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false, color: '#f59e0b',
  },
  {
    id: '4', title: 'Upload photos from trip', description: 'Organize and upload vacation photos to Drive',
    status: 'todo', priority: 'low', sourceApp: 'drive', tags: ['personal', 'photos'],
    subtasks: [], createdAt: new Date(Date.now() - 259200000).toISOString(), updatedAt: new Date(Date.now() - 259200000).toISOString(), pinned: false,
  },
  {
    id: '5', title: 'Schedule dentist appointment', status: 'done', priority: 'medium', tags: ['personal', 'health'],
    subtasks: [], createdAt: new Date(Date.now() - 604800000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString(),
    completedAt: new Date(Date.now() - 86400000).toISOString(), pinned: false, color: '#8b5cf6',
  },
  {
    id: '6', title: 'Prepare sprint demo slides', description: 'Show the new calendar and admin features',
    status: 'todo', priority: 'urgent', dueDate: new Date(Date.now() + 43200000).toISOString(),
    sourceApp: 'calendar', tags: ['work'],
    subtasks: [{id: '6a', title: 'Calendar app demo', done: true}, {id: '6b', title: 'Admin console demo', done: false}],
    createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString(), pinned: true, color: '#ef4444',
  },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(DEMO_TASKS);
  const [view, setView] = useState<FilterView>('all');
  const [showNew, setShowNew] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const filtered = useMemo(() => {
    let list = tasks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)));
    }

    switch (view) {
      case 'today':
        return list.filter(t => t.dueDate && (isToday(new Date(t.dueDate)) || isPast(new Date(t.dueDate))));
      case 'upcoming':
        return list.filter(t => t.dueDate && t.status !== 'done');
      case 'pinned':
        return list.filter(t => t.pinned && t.status !== 'done');
      case 'done':
        return list.filter(t => t.status === 'done');
      default:
        return list.filter(t => t.status !== 'done');
    }
  }, [tasks, view, searchQuery]);

  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'done').length,
  }), [tasks]);

  const toggleStatus = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const nextStatus: Record<TaskStatus, TaskStatus> = {todo: 'in_progress', in_progress: 'done', done: 'todo', archived: 'todo'};
      return {
        ...t,
        status: nextStatus[t.status],
        completedAt: nextStatus[t.status] === 'done' ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const togglePin = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? {...t, pinned: !t.pinned, updatedAt: new Date().toISOString()} : t));
  }, []);

  const addTask = useCallback(() => {
    if (!newTitle.trim()) return;
    const task: Task = {
      id: `task_${Date.now()}`,
      title: newTitle.trim(),
      status: 'todo',
      priority: 'medium',
      tags: [],
      subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      sourceApp: 'tasks',
    };
    setTasks(prev => [task, ...prev]);
    setNewTitle('');
    setShowNew(false);
  }, [newTitle]);

  return (
    <ThemeProvider>
      <NotificationProvider userId="demo-user">
        <AppShell activeApp="tasks" notifications={<><ThemeToggle /><NotificationBell /></>}>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tasks</h1>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {stats.todo} to do • {stats.inProgress} in progress • {stats.done} done
                    {stats.overdue > 0 && <span className="text-red-500 ml-1">• {stats.overdue} overdue</span>}
                  </p>
                </div>
                <Button size="sm" variant="primary" onClick={() => setShowNew(true)}>+ New Task</Button>
              </div>

              {/* Quick add */}
              <div className="flex gap-2 mb-3">
                <input
                  placeholder="Quick add task..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                />
                {newTitle.trim() && <Button size="sm" onClick={addTask}>Add</Button>}
              </div>

              {/* Filters */}
              <div className="flex gap-1.5 overflow-x-auto">
                {([
                  {id: 'all', label: 'All', count: stats.todo + stats.inProgress},
                  {id: 'today', label: 'Today', count: null},
                  {id: 'upcoming', label: 'Upcoming', count: null},
                  {id: 'pinned', label: '📌 Pinned', count: null},
                  {id: 'done', label: '✅ Done', count: stats.done},
                ] as const).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setView(f.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      view === f.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center py-16">
                  <span className="text-4xl">✅</span>
                  <p className="text-gray-500 mt-3">{view === 'done' ? 'No completed tasks yet' : 'All caught up!'}</p>
                </div>
              ) : (
                filtered.map(task => <TaskCard key={task.id} task={task} onToggleStatus={toggleStatus} onTogglePin={togglePin} onEdit={setEditingTask} />)
              )}
            </div>
          </div>

          {/* New Task Modal */}
          {showNew && <NewTaskModal onClose={() => setShowNew(false)} onSave={(t) => { setTasks(prev => [t, ...prev]); setShowNew(false); }} />}

          {/* Edit Task Modal */}
          {editingTask && <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} onSave={(updated) => { setTasks(prev => prev.map(t => t.id === updated.id ? updated : t)); setEditingTask(null); }} />}
        </AppShell>
      </NotificationProvider>
    </ThemeProvider>
  );
}

// ── Task Card ──

function TaskCard({task, onToggleStatus, onTogglePin, onEdit}: {
  task: Task; onToggleStatus: (id: string) => void; onTogglePin: (id: string) => void; onEdit: (t: Task) => void;
}) {
  const isDone = task.status === 'done';
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isDone;
  const subtasksDone = task.subtasks.filter(s => s.done).length;
  const subtasksTotal = task.subtasks.length;

  return (
    <div className={`group border rounded-xl p-4 transition-all hover:shadow-md ${isDone ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
      <div className="flex items-start gap-3">
        {/* Status toggle */}
        <button onClick={() => onToggleStatus(task.id)} className="mt-0.5 text-lg shrink-0">
          {STATUS_ICONS[task.status]}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {task.title}
            </span>
            {task.pinned && <span className="text-xs">📌</span>}
          </div>

          {task.description && (
            <p className={`text-xs mt-1 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>{task.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Priority badge */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_CONFIG[task.priority].color}`}>
              {PRIORITY_CONFIG[task.priority].label}
            </span>

            {/* Source app */}
            {task.sourceApp && task.sourceApp !== 'tasks' && (
              <span className="text-[10px] text-gray-400">{SOURCE_ICONS[task.sourceApp]} {task.sourceApp}</span>
            )}

            {/* Due date */}
            {dueDate && (
              <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                {isOverdue ? '⚠️ Overdue' : isToday(dueDate) ? '📅 Today' : isTomorrow(dueDate) ? '📅 Tomorrow' : `📅 ${format(dueDate, 'MMM d')}`}
              </span>
            )}

            {/* Subtask progress */}
            {subtasksTotal > 0 && (
              <span className="text-[10px] text-gray-400">
                ✓ {subtasksDone}/{subtasksTotal}
              </span>
            )}

            {/* Tags */}
            {task.tags.map(tag => (
              <span key={tag} className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>

          {/* Subtask bar */}
          {subtasksTotal > 0 && (
            <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{width: `${(subtasksDone / subtasksTotal) * 100}%`}} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onTogglePin(task.id)} className="text-xs p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Pin">
            {task.pinned ? '📌' : '📍'}
          </button>
          <button onClick={() => onEdit(task)} className="text-xs p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Edit">
            ✏️
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Task Modal ──

function NewTaskModal({onClose, onSave}: {onClose: () => void; onSave: (task: Task) => void}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState('');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: `task_${Date.now()}`,
      title: title.trim(),
      description: description.trim() || undefined,
      status: 'todo',
      priority,
      dueDate: dueDate || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      sourceApp: 'tasks',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">New Task</h2>
        <div className="space-y-3">
          <input placeholder="Task title *" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" autoFocus />
          <textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm">
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent</option>
            </select>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          </div>
          <input placeholder="Tags (comma-separated)" value={tags} onChange={e => setTags(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={!title.trim()}>Create Task</Button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Task Modal ──

function EditTaskModal({task, onClose, onSave}: {task: Task; onClose: () => void; onSave: (task: Task) => void}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);

  const handleSave = () => {
    onSave({
      ...task,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Edit Task</h2>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm">
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>

          {/* Subtasks */}
          {task.subtasks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Subtasks ({task.subtasks.filter(s => s.done).length}/{task.subtasks.length})</p>
              {task.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 py-1">
                  <span className="text-xs">{sub.done ? '✅' : '⬜'}</span>
                  <span className={`text-xs ${sub.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{sub.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
