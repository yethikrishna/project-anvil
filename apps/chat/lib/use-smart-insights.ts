/**
 * useSmartInsights — derives AI-visible insights from across all conversations.
 *
 * Runs on mount and when conversations change.
 * Produces a compact insights summary that gets injected into
 * the system prompt to make every AI response feel more personalized.
 *
 * Output: a string like:
 * "User frequently discusses: project deadlines, budget reviews.
 *  Typically active around 9-11 AM.
 *  Common contacts: alice@co.com, bob@co.com.
 *  Recently worked on: Q3 planning doc, team offsite proposal."
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Conversation } from './types';

export interface SmartInsights {
  summary: string;           // Single paragraph for system prompt injection
  topTopics: string[];       // Most discussed topics
  topPeople: string[];       // Most mentioned people
  recentFiles: string[];     // Recently accessed files
  activeHours: number[];     // Peak usage hours (0-23)
  decisionHistory: string[]; // Important decisions captured
  lastUpdated: number;
}

const INSIGHTS_KEY = 'anvil-chat:smart-insights-v1';
const STALE_MS = 10 * 60 * 1000; // Regenerate every 10 minutes

function loadCachedInsights(): SmartInsights | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(INSIGHTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SmartInsights;
    if (Date.now() - parsed.lastUpdated > STALE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveInsights(insights: SmartInsights): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INSIGHTS_KEY, JSON.stringify(insights));
  } catch { /* storage full */ }
}

// Frequency counter helper
function topN<T>(arr: T[], n: number): T[] {
  const counts = new Map<string, number>();
  for (const item of arr) {
    const key = String(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key) as T[];
}

export function deriveInsights(conversations: Conversation[]): SmartInsights {
  // Collect all context data across conversations
  const allTopics: string[] = [];
  const allPeople: string[] = [];
  const allFiles: string[] = [];
  const allHours: number[] = [];
  const allPreferences: string[] = [];

  for (const conv of conversations) {
    const ctx = conv.context;
    if (ctx) {
      allTopics.push(...(ctx.topics ?? []));
      allPeople.push(...(ctx.people ?? []));
      allFiles.push(...(ctx.files?.map(f => f.name) ?? []));
      allPreferences.push(...(ctx.preferences ?? []));
    }
    // Extract hours from message timestamps
    for (const msg of conv.messages) {
      if (msg.role === 'user') {
        allHours.push(new Date(msg.timestamp).getHours());
      }
    }
  }

  const topTopics = topN(allTopics, 8);
  const topPeople = topN(allPeople, 8);
  const recentFiles = topN(allFiles, 6);
  const activeHours = topN(allHours, 4).map(Number).sort((a, b) => a - b);
  const uniquePrefs = [...new Set(allPreferences)].slice(0, 6);

  // Build compact summary for system prompt injection
  const parts: string[] = [];

  if (topTopics.length > 0) {
    parts.push(`Frequently discussed topics: ${topTopics.slice(0, 5).join(', ')}`);
  }
  if (topPeople.length > 0) {
    parts.push(`Common contacts/people: ${topPeople.slice(0, 5).join(', ')}`);
  }
  if (recentFiles.length > 0) {
    parts.push(`Recent files worked on: ${recentFiles.slice(0, 4).join(', ')}`);
  }
  if (activeHours.length > 0) {
    const hourStrs = activeHours.slice(0, 3).map(h => {
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}${ampm}`;
    });
    parts.push(`Most active around: ${hourStrs.join(', ')}`);
  }
  if (uniquePrefs.length > 0) {
    parts.push(`Learned preferences: ${uniquePrefs.slice(0, 4).join('; ')}`);
  }

  const summary = parts.join('. ');

  const insights: SmartInsights = {
    summary,
    topTopics,
    topPeople,
    recentFiles,
    activeHours,
    decisionHistory: [],
    lastUpdated: Date.now(),
  };

  saveInsights(insights);
  return insights;
}

// ── Hook ──

export function useSmartInsights(conversations: Conversation[]): {
  insights: SmartInsights | null;
  insightsSummary: string;
} {
  const [insights, setInsights] = useState<SmartInsights | null>(() => loadCachedInsights());

  const compute = useCallback(() => {
    if (conversations.length === 0) return;
    const derived = deriveInsights(conversations);
    setInsights(derived);
  }, [conversations]);

  // Compute on first load + when conversations change (debounced)
  useEffect(() => {
    const cached = loadCachedInsights();
    if (cached) {
      setInsights(cached);
      return;
    }
    // Slight delay to avoid blocking initial render
    const timer = setTimeout(compute, 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Recompute when conversations change significantly (every 5 conversations loaded)
    if (conversations.length > 0 && conversations.length % 5 === 0) {
      compute();
    }
  }, [conversations.length, compute]);

  return {
    insights,
    insightsSummary: insights?.summary ?? '',
  };
}
