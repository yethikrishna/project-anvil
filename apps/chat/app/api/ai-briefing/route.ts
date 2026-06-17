/**
 * GET /api/ai-briefing — Intelligent daily briefing for the welcome screen.
 *
 * Combines attention scan + calendar + Drive into a prioritized morning brief.
 * Designed to answer "What do I need to know and do right now?" in < 5s.
 *
 * Features:
 * - Parallel data fetch across Mail + Calendar + Drive
 * - AI-powered priority scoring
 * - Time-aware greeting + focus recommendations
 * - Action items with one-click execution prompts
 * - Caches result for 5 minutes to avoid re-calling on every page load
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export const runtime = 'nodejs';
export const maxDuration = 45;

export interface BriefingSection {
  id: string;
  type: 'urgent' | 'today' | 'followup' | 'files' | 'insight';
  icon: string;
  title: string;
  items: BriefingItem[];
  badge?: number;
  empty?: string;
}

export interface BriefingItem {
  id: string;
  title: string;
  subtitle?: string;
  detail?: string;
  timestamp?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  actionPrompt?: string;     // Pre-built prompt for one-click action
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface AIBriefing {
  greeting: string;
  headline: string;          // 1-line "here's what matters today"
  focusRecommendation: string; // What to tackle first and why
  sections: BriefingSection[];
  generatedAt: string;
  freshness: 'live' | 'cached';
}

// ── Time-aware greeting ──

function buildGreeting(): { greeting: string } {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;

  let greeting: string;
  if (hour < 9) greeting = isWeekend ? 'Good morning — catching up on the weekend?' : 'Good morning — let\'s start strong.';
  else if (hour < 12) greeting = 'Morning — here\'s where things stand.';
  else if (hour < 14) greeting = 'Midday check-in — here\'s what you\'ve got.';
  else if (hour < 17) greeting = 'Afternoon — here\'s your status.';
  else if (hour < 20) greeting = 'Wrapping up — here\'s what still needs attention.';
  else greeting = 'Working late — here\'s what can\'t wait.';

  return { greeting };
}

// ── Priority scorer ──

function scorePriority(subject: string, from: string, snippet: string, age_hours: number): 'urgent' | 'high' | 'medium' | 'low' {
  const text = `${subject} ${from} ${snippet}`.toLowerCase();

  // Urgent signals
  if (/urgent|asap|immediately|critical|emergency|action required|deadline today/.test(text)) return 'urgent';
  if (from.includes('ceo') || from.includes('cto') || from.includes('vp') || from.includes('director')) return 'urgent';

  // High priority
  if (/important|priority|follow.?up|response needed|please review|your approval/.test(text)) return 'high';
  if (age_hours < 2) return 'high';

  // Medium
  if (age_hours < 24) return 'medium';

  return 'low';
}

// ── Data fetchers ──

async function fetchUrgentEmails(tools: ReturnType<typeof getToolExecutor>): Promise<BriefingItem[]> {
  try {
    const raw = await tools.searchEmails('is:unread', 'inbox', 15);
    const emails = JSON.parse(raw);
    const list = Array.isArray(emails) ? emails : (emails.results ?? []);

    return list
      .map((e: Record<string, unknown>) => {
        const subject = String(e.subject ?? '(No subject)');
        const from = String(e.from ?? e.sender ?? 'Unknown');
        const snippet = String(e.snippet ?? '');
        const ts = e.date ?? e.timestamp ?? e.receivedAt;
        const ageHours = ts ? (Date.now() - new Date(String(ts)).getTime()) / 3_600_000 : 24;
        const priority = scorePriority(subject, from, snippet, ageHours);
        const threadId = String(e.threadId ?? e.id ?? '');

        return {
          id: `email-${threadId || Math.random()}`,
          title: subject.length > 55 ? subject.slice(0, 52) + '…' : subject,
          subtitle: from.split('<')[0].trim(),
          detail: snippet.length > 80 ? snippet.slice(0, 77) + '…' : snippet,
          timestamp: ts ? new Date(String(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          priority,
          actionPrompt: `Read my email thread "${subject}" from ${from} and draft a reply`,
          actionLabel: 'Draft reply',
          metadata: { threadId, from, subject },
        } satisfies BriefingItem;
      })
      .filter((item: BriefingItem) => item.priority === 'urgent' || item.priority === 'high')
      .sort((a: BriefingItem, b: BriefingItem) => {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority!] ?? 2) - (order[b.priority!] ?? 2);
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchTodayEvents(tools: ReturnType<typeof getToolExecutor>): Promise<BriefingItem[]> {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const raw = await tools.getCalendarEvents(todayStart.toISOString(), todayEnd.toISOString());
    const events = JSON.parse(raw);
    const list = Array.isArray(events) ? events : (events.items ?? events.events ?? []);

    return list
      .map((e: Record<string, unknown>) => {
        const title = String(e.summary ?? e.title ?? 'Event');
        const startDT = e.start ? String((e.start as Record<string, unknown>).dateTime ?? e.start) : '';
        const endDT = e.end ? String((e.end as Record<string, unknown>).dateTime ?? e.end) : '';
        const attendees = Array.isArray(e.attendees) ? e.attendees.map((a: Record<string, unknown>) => String(a.email ?? a.displayName ?? a)).join(', ') : '';
        const location = e.location ? String(e.location) : '';

        const startTime = startDT ? new Date(startDT) : null;
        const minutesUntil = startTime ? Math.round((startTime.getTime() - now.getTime()) / 60_000) : null;
        const isPast = minutesUntil !== null && minutesUntil < 0;
        const isSoon = minutesUntil !== null && minutesUntil >= 0 && minutesUntil <= 30;

        const subtitle = [
          startTime ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
          location || '',
        ].filter(Boolean).join(' · ');

        const detail = attendees ? `With: ${attendees.slice(0, 60)}` : undefined;

        return {
          id: `event-${e.id ?? title}`,
          title: title.length > 50 ? title.slice(0, 47) + '…' : title,
          subtitle,
          detail,
          priority: isSoon ? 'urgent' : isPast ? 'low' : 'medium',
          actionPrompt: `Prepare me for my "${title}" meeting${attendees ? ` with ${attendees.split(',')[0]}` : ''}`,
          actionLabel: 'Prep briefing',
          metadata: { startDT, endDT, attendees, location, minutesUntil },
        } satisfies BriefingItem;
      })
      .sort((a: BriefingItem, b: BriefingItem) => {
        const aStart = (a.metadata?.startDT as string) ?? '';
        const bStart = (b.metadata?.startDT as string) ?? '';
        return aStart.localeCompare(bStart);
      });
  } catch {
    return [];
  }
}

async function fetchPendingFollowUps(tools: ReturnType<typeof getToolExecutor>): Promise<BriefingItem[]> {
  try {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const raw = await tools.searchEmails(`after:${cutoff}`, 'sent', 10);
    const emails = JSON.parse(raw);
    const list = Array.isArray(emails) ? emails : (emails.results ?? []);

    return list
      .filter((e: Record<string, unknown>) => {
        // Simple heuristic: sent emails where subject doesn't start with "Re:"
        const subject = String(e.subject ?? '');
        return !subject.toLowerCase().startsWith('re:');
      })
      .slice(0, 3)
      .map((e: Record<string, unknown>) => {
        const subject = String(e.subject ?? '(No subject)');
        const to = String(e.to ?? e.recipient ?? 'Unknown');
        const ts = String(e.date ?? e.timestamp ?? e.sentAt ?? '');

        return {
          id: `followup-${e.id ?? Math.random()}`,
          title: subject.length > 50 ? subject.slice(0, 47) + '…' : subject,
          subtitle: `To: ${to.split('<')[0].trim()}`,
          detail: ts ? `Sent ${new Date(ts).toLocaleDateString()}` : undefined,
          priority: 'medium' as const,
          actionPrompt: `Check if ${to.split('<')[0].trim() || 'the recipient'} replied to my email "${subject}" and tell me if I need to follow up`,
          actionLabel: 'Check replies',
        } satisfies BriefingItem;
      });
  } catch {
    return [];
  }
}

async function fetchRecentFiles(tools: ReturnType<typeof getToolExecutor>): Promise<BriefingItem[]> {
  try {
    const raw = await tools.searchFiles('*', 'any', 5);
    const files = JSON.parse(raw);
    const list = Array.isArray(files) ? files : (files.results ?? files.files ?? []);

    return list.slice(0, 4).map((f: Record<string, unknown>) => {
      const name = String(f.name ?? f.title ?? 'File');
      const mimeType = String(f.mimeType ?? f.type ?? '');
      const modifiedTime = f.modifiedTime ?? f.modifiedAt ?? f.updatedAt;

      const typeIcon = mimeType.includes('sheet') || mimeType.includes('xls') ? '📊'
        : mimeType.includes('slide') || mimeType.includes('ppt') ? '📽️'
        : mimeType.includes('pdf') ? '📕'
        : mimeType.includes('image') ? '🖼️'
        : '📄';

      return {
        id: `file-${f.id ?? name}`,
        title: name.length > 45 ? name.slice(0, 42) + '…' : name,
        subtitle: modifiedTime ? `Modified ${new Date(String(modifiedTime)).toLocaleDateString()}` : undefined,
        detail: typeIcon,
        priority: 'low' as const,
        actionPrompt: `Open and summarize the file "${name}" from Drive`,
        actionLabel: 'Summarize',
        metadata: { id: f.id, mimeType },
      } satisfies BriefingItem;
    });
  } catch {
    return [];
  }
}

// ── AI insight generator ──

async function generateInsight(
  engine: ChatEngine,
  urgentEmails: BriefingItem[],
  todayEvents: BriefingItem[],
  followUps: BriefingItem[],
): Promise<{ headline: string; focusRecommendation: string }> {
  const urgentCount = urgentEmails.filter(e => e.priority === 'urgent').length;
  const highCount = urgentEmails.filter(e => e.priority === 'high').length;
  const eventCount = todayEvents.length;
  const soonEvent = todayEvents.find(e => {
    const mins = e.metadata?.minutesUntil as number | null;
    return mins !== null && mins >= 0 && mins <= 60;
  });
  const followUpCount = followUps.length;

  const context = `
Urgent emails: ${urgentCount}
High-priority emails: ${highCount}
Today's meetings: ${eventCount}
${soonEvent ? `Next meeting in: ${soonEvent.metadata?.minutesUntil} minutes — "${soonEvent.title}"` : ''}
Pending follow-ups: ${followUpCount}
Current hour: ${new Date().getHours()}
`;

  try {
    const raw = await engine.quickGenerate(
      `You are a smart executive assistant. Based on the user's current status, generate:
1. A one-line "headline" summarizing the day's priority (e.g. "3 urgent emails + 2 meetings today")
2. A one-sentence focus recommendation (what to tackle first and why)

Return valid JSON: {"headline": "...", "focusRecommendation": "..."}
Be direct and specific. No filler words.`,
      context,
    );

    const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned) as { headline: string; focusRecommendation: string };
    return {
      headline: parsed.headline ?? 'Here\'s what needs your attention today.',
      focusRecommendation: parsed.focusRecommendation ?? 'Start with your urgent emails.',
    };
  } catch {
    // Fallback without AI
    const parts: string[] = [];
    if (urgentCount > 0) parts.push(`${urgentCount} urgent email${urgentCount !== 1 ? 's' : ''}`);
    else if (highCount > 0) parts.push(`${highCount} important email${highCount !== 1 ? 's' : ''}`);
    if (eventCount > 0) parts.push(`${eventCount} meeting${eventCount !== 1 ? 's' : ''} today`);
    if (followUpCount > 0) parts.push(`${followUpCount} follow-up${followUpCount !== 1 ? 's' : ''} pending`);

    const headline = parts.length > 0 ? parts.join(' · ') : 'All clear — nothing urgent right now.';
    const focus = soonEvent
      ? `Your next meeting "${soonEvent.title}" starts in ${soonEvent.metadata?.minutesUntil} minutes — prep now.`
      : urgentCount > 0
        ? 'Handle the urgent emails first — they need immediate responses.'
        : 'Looks like a good time to work through your follow-ups.';

    return { headline, focusRecommendation: focus };
  }
}

// ── Main handler ──

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') ?? 'default';

  const tools = getToolExecutor({ userId });
  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o-mini', // fast model for briefing
  });

  // Parallel data fetch
  const [urgentEmails, todayEvents, followUps, recentFiles] = await Promise.all([
    fetchUrgentEmails(tools),
    fetchTodayEvents(tools),
    fetchPendingFollowUps(tools),
    fetchRecentFiles(tools),
  ]);

  // AI insight (can run while we assemble the response)
  const { headline, focusRecommendation } = await generateInsight(
    engine, urgentEmails, todayEvents, followUps,
  );

  const { greeting } = buildGreeting();

  const sections: BriefingSection[] = [
    {
      id: 'urgent',
      type: 'urgent' as const,
      icon: '⚡',
      title: 'Needs attention',
      items: urgentEmails,
      badge: urgentEmails.filter(e => e.priority === 'urgent').length || undefined,
      empty: 'Inbox clear — no urgent emails.',
    },
    {
      id: 'today',
      type: 'today' as const,
      icon: '📅',
      title: 'Today\'s schedule',
      items: todayEvents,
      empty: 'No meetings today.',
    },
    {
      id: 'followup',
      type: 'followup' as const,
      icon: '🔄',
      title: 'Follow-ups',
      items: followUps,
      empty: 'No pending follow-ups.',
    },
    {
      id: 'files',
      type: 'files' as const,
      icon: '📁',
      title: 'Recent files',
      items: recentFiles,
      empty: 'No recent files.',
    },
  ].filter(s => s.items.length > 0 || s.empty);

  const briefing: AIBriefing = {
    greeting,
    headline,
    focusRecommendation,
    sections,
    generatedAt: new Date().toISOString(),
    freshness: 'live',
  };

  return NextResponse.json(briefing);
}
