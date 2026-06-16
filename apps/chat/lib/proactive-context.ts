/**
 * Proactive Context Engine — makes every AI turn feel like talking to
 * someone who genuinely knows you.
 *
 * Enriches each AI call with:
 * 1. Cross-session relationship graph (who user works with most)
 * 2. Behavioral signals (active time, preferred tools, tone)
 * 3. Pending items from attention scan (unresolved threads)
 * 4. Conversation thread continuity (what was promised last time)
 * 5. Dynamic persona hints (how AI should present itself right now)
 *
 * This is the difference between a chatbot and an executive assistant.
 */

import type { ConversationContext } from './types';
import type { UserPattern } from './context-manager';

// ── Cross-session intelligence cache ──

interface ContextSnapshot {
  pendingFollowUps: string[];      // Things the AI said it would do but hasn't
  recentDecisions: string[];       // Key decisions made in past conversations
  importantPeople: string[];       // Most frequently mentioned contacts
  activeProjects: string[];        // Topics appearing across multiple convs
  lastSessionSummary: string;      // What we talked about last time
  capturedAt: number;
}

const CONTEXT_STORAGE_KEY = 'anvil-chat:proactive-context-v1';

export function loadContextSnapshot(): ContextSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as ContextSnapshot;
    // Expire after 24h
    if (Date.now() - snap.capturedAt > 24 * 60 * 60 * 1000) return null;
    return snap;
  } catch {
    return null;
  }
}

export function saveContextSnapshot(snap: Partial<ContextSnapshot>): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadContextSnapshot() ?? {
      pendingFollowUps: [],
      recentDecisions: [],
      importantPeople: [],
      activeProjects: [],
      lastSessionSummary: '',
      capturedAt: Date.now(),
    };
    const merged: ContextSnapshot = {
      ...existing,
      ...snap,
      pendingFollowUps: [
        ...(snap.pendingFollowUps ?? existing.pendingFollowUps),
      ].slice(-5),
      recentDecisions: [
        ...(snap.recentDecisions ?? existing.recentDecisions),
      ].slice(-10),
      importantPeople: [
        ...new Set([
          ...(snap.importantPeople ?? existing.importantPeople),
        ]),
      ].slice(-15),
      activeProjects: [
        ...new Set([
          ...(snap.activeProjects ?? existing.activeProjects),
        ]),
      ].slice(-8),
      capturedAt: Date.now(),
    };
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage may be full
  }
}

// ── Detect commitments in AI responses ──

const COMMITMENT_PATTERNS = [
  /I(?:'ll| will) (send|draft|schedule|create|find|check|follow up|remind you|add|set up|book)/gi,
  /I(?:'ll| will) (get back to you|let you know|keep an eye|monitor|track)/gi,
  /(?:Remind me|I should remember) to (.+)/gi,
  /(?:Next step|Action item|TODO)[:\s]+(.+)/gi,
];

export function extractCommitments(aiResponse: string): string[] {
  const commitments: string[] = [];
  for (const pattern of COMMITMENT_PATTERNS) {
    const matches = [...aiResponse.matchAll(pattern)];
    for (const match of matches) {
      const commitment = match[0].slice(0, 120);
      if (!commitments.includes(commitment)) {
        commitments.push(commitment);
      }
    }
  }
  return commitments.slice(0, 3);
}

// ── Detect decisions in conversation ──

const DECISION_PATTERNS = [
  /(?:decided|agreed|confirmed|settled on|going with|chose|picked) (.+?)(?:\.|$)/gi,
  /(?:will use|will go with|using) (.+?)(?:\.|$)/gi,
  /(?:meeting is|event is|scheduled for) (.+?)(?:\.|$)/gi,
];

export function extractDecisions(text: string): string[] {
  const decisions: string[] = [];
  for (const pattern of DECISION_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const decision = match[0].slice(0, 100);
      if (!decisions.includes(decision)) {
        decisions.push(decision);
      }
    }
  }
  return decisions.slice(0, 3);
}

// ── Build persona hint based on time + patterns ──

export function buildPersonaHint(patterns?: UserPattern | null): string {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const hints: string[] = [];

  if (hour >= 8 && hour < 10) {
    hints.push('User is starting their day — morning briefing mindset. Lead with priorities.');
  } else if (hour >= 12 && hour < 14) {
    hints.push('Midday check-in. User may be between meetings. Keep it brief.');
  } else if (hour >= 16 && hour < 18) {
    hints.push('End of business day. Focus on wrap-up, next-day prep, and pending items.');
  } else if (hour >= 18 || hour < 8) {
    hints.push('Outside business hours. User may be catching up. Note if action needs to wait for business hours.');
  }

  if (isWeekend) {
    hints.push('Weekend. Avoid scheduling meetings for today unless asked. Keep tone relaxed.');
  }

  const now = new Date();
  const dayOfMonth = now.getDate();
  if (dayOfMonth <= 3 || dayOfMonth >= 28) {
    hints.push('Near month boundaries — user may have monthly reviews or deadlines.');
  }

  if (patterns) {
    if (patterns.communicationStyle) {
      hints.push(`User prefers ${patterns.communicationStyle} communication.`);
    }
    if (patterns.emailTone) {
      hints.push(`Default email tone: ${patterns.emailTone}.`);
    }
    if (patterns.meetingTimePreference && patterns.meetingTimePreference !== 'flexible') {
      hints.push(`Prefers ${patterns.meetingTimePreference} meetings.`);
    }
    const topTools = patterns.mostUsedTools?.slice(0, 3).map(t => t.tool).join(', ');
    if (topTools) {
      hints.push(`Most active with: ${topTools}.`);
    }
  }

  return hints.join(' ');
}

// ── Proactive context builder ──

export interface ProactiveContext {
  personaHint: string;
  importantPeople: string[];
  activeProjects: string[];
  pendingFollowUps: string[];
  recentDecisions: string[];
  lastSessionSummary: string;
  fullContextBlock: string;
}

export function buildProactiveContext(
  context: ConversationContext,
  patterns?: UserPattern | null,
): ProactiveContext {
  const snapshot = loadContextSnapshot();
  const personaHint = buildPersonaHint(patterns);

  // Merge conversation context with cross-session knowledge
  const importantPeople = [
    ...new Set([
      ...(snapshot?.importantPeople ?? []),
      ...context.people.slice(-5),
    ]),
  ].slice(0, 10);

  const activeProjects = [
    ...new Set([
      ...(snapshot?.activeProjects ?? []),
      ...context.topics.slice(-5),
    ]),
  ].slice(0, 8);

  const pendingFollowUps = snapshot?.pendingFollowUps ?? [];
  const recentDecisions = snapshot?.recentDecisions ?? [];
  const lastSessionSummary = snapshot?.lastSessionSummary ?? '';

  // Build the full context block for injection into system prompt
  const blocks: string[] = [];

  if (personaHint) {
    blocks.push(`SITUATIONAL AWARENESS:\n${personaHint}`);
  }

  if (importantPeople.length > 0) {
    blocks.push(`KEY PEOPLE (mention when relevant): ${importantPeople.join(', ')}`);
  }

  if (activeProjects.length > 0) {
    blocks.push(`ACTIVE PROJECTS/TOPICS: ${activeProjects.join(', ')}`);
  }

  if (pendingFollowUps.length > 0) {
    blocks.push(`OPEN COMMITMENTS (mention if relevant):\n${pendingFollowUps.map(f => `• ${f}`).join('\n')}`);
  }

  if (recentDecisions.length > 0) {
    blocks.push(`RECENT DECISIONS:\n${recentDecisions.slice(0, 3).map(d => `• ${d}`).join('\n')}`);
  }

  if (lastSessionSummary) {
    blocks.push(`LAST SESSION: ${lastSessionSummary}`);
  }

  return {
    personaHint,
    importantPeople,
    activeProjects,
    pendingFollowUps,
    recentDecisions,
    lastSessionSummary,
    fullContextBlock: blocks.join('\n\n'),
  };
}

// ── Post-turn learning ──

/**
 * After each AI turn, extract signals and update cross-session context.
 * Call this client-side after receiving the AI response.
 */
export function learnFromTurnProactive(
  userMessage: string,
  aiResponse: string,
  context: ConversationContext,
): void {
  const commitments = extractCommitments(aiResponse);
  const decisions = extractDecisions(aiResponse + ' ' + userMessage);

  const snapshot = loadContextSnapshot() ?? {
    pendingFollowUps: [],
    recentDecisions: [],
    importantPeople: [],
    activeProjects: [],
    lastSessionSummary: '',
    capturedAt: Date.now(),
  };

  saveContextSnapshot({
    pendingFollowUps: [
      ...snapshot.pendingFollowUps.filter(f =>
        // Keep existing commitments unless the latest response implies they're done
        !aiResponse.toLowerCase().includes(f.toLowerCase().slice(0, 20))
      ),
      ...commitments,
    ].slice(-5),
    recentDecisions: [
      ...snapshot.recentDecisions,
      ...decisions,
    ].slice(-10),
    importantPeople: [
      ...new Set([...snapshot.importantPeople, ...context.people.slice(-3)]),
    ].slice(-15),
    activeProjects: [
      ...new Set([...snapshot.activeProjects, ...context.topics.slice(-3)]),
    ].slice(-8),
  });
}

/**
 * Update session summary — call at conversation end or periodically.
 */
export function updateSessionSummary(summary: string): void {
  saveContextSnapshot({ lastSessionSummary: summary });
}
