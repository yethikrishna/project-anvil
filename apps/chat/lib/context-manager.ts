/**
 * ContextManager — learns user patterns across conversations.
 *
 * Features:
 * - Tracks contact frequency, file type preferences, meeting habits
 * - Detects communication style from interaction patterns
 * - Persists patterns to localStorage + IndexedDB
 * - Provides context enrichment for AI system prompts
 * - Learns user preferences from explicit and implicit signals
 */

'use client';

import type { ConversationContext, ActionRecord, ReferencedFile } from './types';

// ── Pattern Types ──

export interface UserPattern {
  /** Most contacted people with frequency */
  frequentContacts: Array<{ name: string; count: number; lastContact: number }>;
  /** Common file types worked with */
  filePreferences: Array<{ type: string; count: number }>;
  /** Peak activity hours (0-23) */
  activeHours: number[];
  /** Preferred meeting days (0=Sun, 6=Sat) */
  preferredMeetingDays: number[];
  /** Topics the user frequently discusses */
  interests: string[];
  /** Inferred communication style */
  communicationStyle: 'concise' | 'detailed' | 'technical' | 'casual';
  /** Email tone preference */
  emailTone: 'professional' | 'friendly' | 'casual' | 'formal';
  /** Whether user prefers morning/afternoon meetings */
  meetingTimePreference: 'morning' | 'afternoon' | 'evening' | 'flexible';
  /** Tools the user uses most */
  mostUsedTools: Array<{ tool: string; count: number }>;
  /** Average session length in minutes */
  avgSessionMinutes: number;
  /** When patterns were last updated */
  lastUpdated: number;
}

// ── Pattern Detection ──

/**
 * Analyze conversation context to extract user patterns.
 */
export function analyzePatterns(context: ConversationContext): UserPattern {
  // Contact frequency with recency
  const contactMap = new Map<string, { count: number; lastContact: number }>();
  context.people.forEach(p => {
    const existing = contactMap.get(p);
    contactMap.set(p, {
      count: (existing?.count ?? 0) + 1,
      lastContact: Math.max(existing?.lastContact ?? 0, Date.now()),
    });
  });
  const frequentContacts = Array.from(contactMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(10);

  // File type preferences
  const typeCounts = new Map<string, number>();
  context.files.forEach(f => typeCounts.set(f.type, (typeCounts.get(f.type) ?? 0) + 1));
  const filePreferences = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Active hours from action timestamps
  const hourCounts = new Map<number, number>();
  context.actions.forEach(a => {
    const hour = new Date(a.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  });
  const activeHours = Array.from(hourCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([hour]) => hour);

  // Preferred meeting days from calendar actions
  const dayCounts = new Map<number, number>();
  context.actions
    .filter(a => a.tool.startsWith('calendar'))
    .forEach(a => {
      const day = new Date(a.timestamp).getDay();
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    });
  const preferredMeetingDays = Array.from(dayCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([day]) => day);

  // Most used tools
  const toolCounts = new Map<string, number>();
  context.actions.forEach(a => {
    toolCounts.set(a.tool, (toolCounts.get(a.tool) ?? 0) + 1);
  });
  const mostUsedTools = Array.from(toolCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(5);

  // Communication style detection
  const prefs = context.preferences.join(' ').toLowerCase();
  let communicationStyle: UserPattern['communicationStyle'] = 'concise';
  if (prefs.includes('detail') || prefs.includes('thorough') || prefs.includes('explain')) {
    communicationStyle = 'detailed';
  } else if (prefs.includes('technical') || prefs.includes('code') || prefs.includes('developer')) {
    communicationStyle = 'technical';
  } else if (prefs.includes('casual') || prefs.includes('informal') || prefs.includes('relaxed')) {
    communicationStyle = 'casual';
  }

  // Email tone
  let emailTone: UserPattern['emailTone'] = 'professional';
  if (prefs.includes('friendly')) emailTone = 'friendly';
  else if (prefs.includes('casual email')) emailTone = 'casual';
  else if (prefs.includes('formal')) emailTone = 'formal';

  // Meeting time preference
  let meetingTimePreference: UserPattern['meetingTimePreference'] = 'flexible';
  const morningHours = activeHours.filter(h => h >= 8 && h < 12).length;
  const afternoonHours = activeHours.filter(h => h >= 12 && h < 17).length;
  const eveningHours = activeHours.filter(h => h >= 17 && h < 20).length;
  if (morningHours > afternoonHours && morningHours > eveningHours) {
    meetingTimePreference = 'morning';
  } else if (afternoonHours > morningHours && afternoonHours > eveningHours) {
    meetingTimePreference = 'afternoon';
  } else if (eveningHours > morningHours && eveningHours > afternoonHours) {
    meetingTimePreference = 'evening';
  }

  return {
    frequentContacts,
    filePreferences,
    activeHours,
    preferredMeetingDays,
    interests: [...new Set(context.topics)].slice(10),
    communicationStyle,
    emailTone,
    meetingTimePreference,
    mostUsedTools,
    avgSessionMinutes: 0,
    lastUpdated: Date.now(),
  };
}

/**
 * Merge old patterns with new ones — incremental learning.
 */
export function mergePatterns(
  oldPatterns: UserPattern,
  newPatterns: UserPattern,
): UserPattern {
  // Merge contacts
  const contactMap = new Map<string, { count: number; lastContact: number }>();
  for (const c of [...oldPatterns.frequentContacts, ...newPatterns.frequentContacts]) {
    const existing = contactMap.get(c.name);
    contactMap.set(c.name, {
      count: (existing?.count ?? 0) + c.count,
      lastContact: Math.max(existing?.lastContact ?? 0, c.lastContact ?? Date.now()),
    });
  }
  const frequentContacts = Array.from(contactMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(10);

  // Merge interests
  const interests = [...new Set([...oldPatterns.interests, ...newPatterns.interests])].slice(15);

  // Merge most used tools
  const toolMap = new Map<string, number>();
  for (const t of [...oldPatterns.mostUsedTools, ...newPatterns.mostUsedTools]) {
    toolMap.set(t.tool, (toolMap.get(t.tool) ?? 0) + t.count);
  }
  const mostUsedTools = Array.from(toolMap.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(5);

  return {
    frequentContacts,
    filePreferences: newPatterns.filePreferences.length > 0
      ? newPatterns.filePreferences
      : oldPatterns.filePreferences,
    activeHours: [...new Set([...oldPatterns.activeHours, ...newPatterns.activeHours])].sort(),
    preferredMeetingDays: [...new Set([
      ...oldPatterns.preferredMeetingDays,
      ...newPatterns.preferredMeetingDays,
    ])],
    interests,
    communicationStyle: newPatterns.communicationStyle,
    emailTone: newPatterns.emailTone,
    meetingTimePreference: newPatterns.meetingTimePreference,
    mostUsedTools,
    avgSessionMinutes: oldPatterns.avgSessionMinutes || newPatterns.avgSessionMinutes,
    lastUpdated: Date.now(),
  };
}

/**
 * Build a context summary string for the AI system prompt.
 */
export function buildContextSummary(
  context: ConversationContext,
  patterns: UserPattern,
): string {
  const parts: string[] = [];

  if (patterns.frequentContacts.length > 0) {
    const top = patterns.frequentContacts.slice(3).map(c => c.name);
    parts.push(`Frequent contacts: ${top.join(', ')}`);
  }

  if (context.files.length > 0) {
    const recent = context.files.slice(-5).map(f => f.name);
    parts.push(`Recent files: ${recent.join(', ')}`);
  }

  if (patterns.interests.length > 0) {
    parts.push(`Topics of interest: ${patterns.interests.slice(5).join(', ')}`);
  }

  if (patterns.communicationStyle !== 'concise') {
    parts.push(`Communication style: ${patterns.communicationStyle}`);
  }

  if (patterns.emailTone !== 'professional') {
    parts.push(`Preferred email tone: ${patterns.emailTone}`);
  }

  if (patterns.meetingTimePreference !== 'flexible') {
    parts.push(`Preferred meeting time: ${patterns.meetingTimePreference}`);
  }

  if (patterns.mostUsedTools.length > 0) {
    parts.push(`Most used tools: ${patterns.mostUsedTools.map(t => t.tool).join(', ')}`);
  }

  return parts.join('\n');
}

// ── Persistence ──

const PATTERNS_KEY = 'anvil-chat:user-patterns';
const SESSION_KEY = 'anvil-chat:session-start';

export function savePatterns(patterns: UserPattern): void {
  try {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns));
  } catch {
    // Storage full or unavailable
  }
}

export function loadPatterns(): UserPattern | null {
  try {
    const stored = localStorage.getItem(PATTERNS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Track session start time for calculating session duration.
 */
export function startSession(): void {
  localStorage.setItem(SESSION_KEY, String(Date.now()));
}

/**
 * Get current session duration in minutes.
 */
export function getSessionDuration(): number {
  const start = localStorage.getItem(SESSION_KEY);
  if (!start) return 0;
  return (Date.now() - Number(start)) / 60_000;
}

/**
 * Detect preferences from user messages (implicit learning).
 */
export function detectPreferences(message: string): string[] {
  const prefs: string[] = [];
  const lower = message.toLowerCase();

  // Communication style signals
  if (lower.match(/\b(be brief|keep it short|tl;dr|quick summary)\b/)) {
    prefs.push('prefers concise responses');
  }
  if (lower.match(/\b(explain in detail|tell me more|elaborate)\b/)) {
    prefs.push('prefers detailed responses');
  }
  if (lower.match(/\b(no code|in plain english|simply)\b/)) {
    prefs.push('prefers non-technical language');
  }
  if (lower.match(/\b(show me the code|technical details|api)\b/)) {
    prefs.push('comfortable with technical content');
  }

  // Email preferences
  if (lower.match(/\b(formal email|professional tone)\b/)) {
    prefs.push('prefers formal email tone');
  }
  if (lower.match(/\b(casual email|friendly tone|relaxed)\b/)) {
    prefs.push('prefers casual email tone');
  }

  // Meeting preferences
  if (lower.match(/\b(morning meeting|early meeting|before lunch)\b/)) {
    prefs.push('prefers morning meetings');
  }
  if (lower.match(/\b(afternoon|after lunch|pm meeting)\b/)) {
    prefs.push('prefers afternoon meetings');
  }

  // Action preferences
  if (lower.match(/\b(just do it|go ahead|don't ask|auto)\b/)) {
    prefs.push('prefers autonomous actions without confirmation');
  }
  if (lower.match(/\b(always ask|confirm first|double check)\b/)) {
    prefs.push('wants confirmation before all actions');
  }

  return prefs;
}
