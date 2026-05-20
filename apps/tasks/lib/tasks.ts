/**
 * Task types and in-memory store for the Tasks/Keep app.
 * Supports cross-app task creation from any Anvil app.
 */

import {v4 as uuidv4} from 'uuid';

// ── Types ──

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Due date (ISO 8601) */
  dueDate?: string;
  /** Reminder date */
  reminderAt?: string;
  /** Which app created this task */
  sourceApp?: 'tasks' | 'gmail' | 'docs' | 'drive' | 'calendar';
  /** Link to source item */
  sourceUrl?: string;
  /** Tags/categories */
  tags: string[];
  /** Subtasks */
  subtasks: Subtask[];
  /** Creation timestamp */
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Pinned / starred */
  pinned: boolean;
  /** Color label */
  color?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

// ── In-Memory Store (swap for PostgreSQL in production) ──

let tasks: Task[] = [
  {
    id: '1',
    title: 'Review Q1 budget proposal',
    description: 'Check the spreadsheet Sarah shared and add comments',
    status: 'in_progress',
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    sourceApp: 'gmail',
    sourceUrl: '/mail/thread/budget-q1',
    tags: ['work', 'finance'],
    subtasks: [
      {id: '1a', title: 'Download attachment', done: true},
      {id: '1b', title: 'Review line items', done: false},
      {id: '1c', title: 'Send feedback', done: false},
    ],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: true,
    color: '#3b82f6',
  },
  {
    id: '2',
    title: 'Finish project documentation',
    description: 'Update the API docs and add examples for the new endpoints',
    status: 'todo',
    priority: 'medium',
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    sourceApp: 'docs',
    sourceUrl: '/docs/project-docs',
    tags: ['work', 'docs'],
    subtasks: [],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    pinned: false,
    color: '#10b981',
  },
  {
    id: '3',
    title: 'Buy groceries',
    status: 'todo',
    priority: 'low',
    tags: ['personal'],
    subtasks: [
      {id: '3a', title: 'Milk', done: false},
      {id: '3b', title: 'Bread', done: false},
      {id: '3c', title: 'Eggs', done: true},
      {id: '3d', title: 'Vegetables', done: false},
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: false,
    color: '#f59e0b',
  },
  {
    id: '4',
    title: 'Upload photos from trip',
    description: 'Organize and upload the vacation photos to Drive',
    status: 'todo',
    priority: 'low',
    sourceApp: 'drive',
    tags: ['personal', 'photos'],
    subtasks: [],
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 259200000).toISOString(),
    pinned: false,
  },
  {
    id: '5',
    title: 'Schedule dentist appointment',
    status: 'done',
    priority: 'medium',
    tags: ['personal', 'health'],
    subtasks: [],
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    completedAt: new Date(Date.now() - 86400000).toISOString(),
    pinned: false,
    color: '#8b5cf6',
  },
  {
    id: '6',
    title: 'Prepare sprint demo slides',
    description: 'Show the new calendar and admin features',
    status: 'todo',
    priority: 'urgent',
    dueDate: new Date(Date.now() + 43200000).toISOString(),
    sourceApp: 'calendar',
    tags: ['work'],
    subtasks: [
      {id: '6a', title: 'Calendar app demo', done: true},
      {id: '6b', title: 'Admin console demo', done: false},
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: true,
    color: '#ef4444',
  },
];

// ── CRUD Operations ──

export function getAllTasks(): Task[] {
  return tasks;
}

export function getTask(id: string): Task | undefined {
  return tasks.find(t => t.id === id);
}

export function createTask(input: Partial<Task> & {title: string}): Task {
  const task: Task = {
    id: uuidv4(),
    title: input.title,
    description: input.description,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate,
    reminderAt: input.reminderAt,
    sourceApp: input.sourceApp ?? 'tasks',
    sourceUrl: input.sourceUrl,
    tags: input.tags ?? [],
    subtasks: input.subtasks ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: input.pinned ?? false,
    color: input.color,
  };
  tasks = [task, ...tasks];
  return task;
}

export function updateTask(id: string, updates: Partial<Task>): Task | undefined {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return undefined;
  tasks[idx] = {
    ...tasks[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
    ...(updates.status === 'done' && !tasks[idx].completedAt
      ? {completedAt: new Date().toISOString()}
      : {}),
    ...(updates.status && updates.status !== 'done' ? {completedAt: undefined} : {}),
  };
  return tasks[idx];
}

export function deleteTask(id: string): boolean {
  const len = tasks.length;
  tasks = tasks.filter(t => t.id !== id);
  return tasks.length < len;
}

export function toggleSubtask(taskId: string, subtaskId: string): Task | undefined {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return undefined;
  const sub = task.subtasks.find(s => s.id === subtaskId);
  if (sub) sub.done = !sub.done;
  task.updatedAt = new Date().toISOString();
  return task;
}

// ── Cross-app creation helpers ──

export function createTaskFromEmail(subject: string, threadUrl: string): Task {
  return createTask({
    title: `Follow up: ${subject}`,
    sourceApp: 'gmail',
    sourceUrl: threadUrl,
    tags: ['email'],
    priority: 'medium',
  });
}

export function createTaskFromDoc(docTitle: string, docUrl: string): Task {
  return createTask({
    title: `Review: ${docTitle}`,
    sourceApp: 'docs',
    sourceUrl: docUrl,
    tags: ['docs'],
    priority: 'low',
  });
}
