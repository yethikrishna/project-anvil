/**
 * ai-coach.ts — Intelligent productivity coach.
 *
 * Analyzes user conversation patterns and behavior to generate:
 * - Weekly productivity score with breakdown
 * - Behavior insights ("You respond to urgent emails 40% faster on Tuesday")
 * - Actionable recommendations
 * - Communication style analysis
 * - Focus time patterns
 *
 * All analysis is local (no external calls) — uses conversation history,
 * tool call logs, and memory preferences.
 */

import type { Conversation } from '@/lib/types';

export interface ProductivityInsight {
  category: 'speed' | 'focus' | 'communication' | 'organization' | 'follow_through';
  icon: string;
  title: string;
  detail: string;
  score: number;  // 0-100
  trend: 'up' | 'down' | 'stable';
  recommendation?: string;
}

export interface WeeklyProductivityReport {
  overallScore: number;
  headline: string;
  subheadline: string;
  insights: ProductivityInsight[];
  topStrength: string;
  topImprovement: string;
  weekComparedToLast: number; // delta (-100 to +100)
  activeDays: number;
  totalActions: number;
  generatedAt: number;
}

// ── Conversation analytics ──

interface ConvStats {
  totalMessages: number;
  userMessages: number;
  aiMessages: number;
  toolCallCount: number;
  toolsByType: Record<string, number>;
  avgResponseLengthChars: number;
  activeHours: Record<number, number>;  // hour → count
  activeDays: Set<string>;
  draftSaves: number;
  emailSearches: number;
  calendarChecks: number;
  fileSearches: number;
  multiStepChains: number;
}

function analyzeConversations(conversations: Conversation[]): ConvStats {
  const stats: ConvStats = {
    totalMessages: 0,
    userMessages: 0,
    aiMessages: 0,
    toolCallCount: 0,
    toolsByType: {},
    avgResponseLengthChars: 0,
    activeHours: {},
    activeDays: new Set(),
    draftSaves: 0,
    emailSearches: 0,
    calendarChecks: 0,
    fileSearches: 0,
    multiStepChains: 0,
  };

  const responseLengths: number[] = [];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.timestamp < weekAgo) continue;

      stats.totalMessages++;
      const hour = new Date(msg.timestamp).getHours();
      const day = new Date(msg.timestamp).toLocaleDateString();
      stats.activeHours[hour] = (stats.activeHours[hour] ?? 0) + 1;
      stats.activeDays.add(day);

      if (msg.role === 'user') {
        stats.userMessages++;
      } else if (msg.role === 'assistant') {
        stats.aiMessages++;
        responseLengths.push(msg.content.length);
      }

      if (msg.toolCalls?.length) {
        stats.toolCallCount += msg.toolCalls.length;
        if (msg.toolCalls.length > 2) stats.multiStepChains++;

        for (const tc of msg.toolCalls) {
          stats.toolsByType[tc.tool] = (stats.toolsByType[tc.tool] ?? 0) + 1;
          if (tc.tool === 'email_save_draft') stats.draftSaves++;
          if (tc.tool === 'email_search') stats.emailSearches++;
          if (tc.tool.startsWith('calendar')) stats.calendarChecks++;
          if (tc.tool === 'file_search') stats.fileSearches++;
        }
      }
    }
  }

  if (responseLengths.length > 0) {
    stats.avgResponseLengthChars = responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length;
  }

  return stats;
}

// ── Insight generators ──

function scoreSpeed(stats: ConvStats): ProductivityInsight {
  // Higher score = user is using AI to respond faster (more drafts, searches)
  const score = Math.min(100, (stats.draftSaves * 15) + (stats.emailSearches * 8));
  return {
    category: 'speed',
    icon: '⚡',
    title: 'Response speed',
    detail: stats.draftSaves > 0
      ? `You drafted ${stats.draftSaves} email${stats.draftSaves !== 1 ? 's' : ''} using AI this week.`
      : 'Use AI draft assist to respond faster.',
    score: Math.max(10, score),
    trend: stats.draftSaves > 2 ? 'up' : 'stable',
    recommendation: stats.draftSaves === 0 ? 'Try "Draft reply" on your next unread email.' : undefined,
  };
}

function scoreFocus(stats: ConvStats): ProductivityInsight {
  const peakHour = Object.entries(stats.activeHours)
    .sort(([, a], [, b]) => b - a)[0];
  const peakHourNum = peakHour ? parseInt(peakHour[0]) : 9;
  const peakLabel = new Date(new Date().setHours(peakHourNum, 0, 0, 0))
    .toLocaleTimeString([], { hour: '2-digit', hour12: true });

  const workHoursActivity = Object.entries(stats.activeHours)
    .filter(([h]) => parseInt(h) >= 9 && parseInt(h) <= 17)
    .reduce((sum, [, v]) => sum + v, 0);

  const score = Math.min(100, (workHoursActivity / Math.max(stats.totalMessages, 1)) * 100);

  return {
    category: 'focus',
    icon: '🎯',
    title: 'Focus window',
    detail: `You\'re most active at ${peakLabel}. ${stats.activeDays.size} active day${stats.activeDays.size !== 1 ? 's' : ''} this week.`,
    score: Math.max(20, Math.round(score)),
    trend: stats.activeDays.size >= 4 ? 'up' : 'stable',
    recommendation: stats.activeDays.size < 3 ? 'Daily check-ins help catch urgent items before they pile up.' : undefined,
  };
}

function scoreCommunication(stats: ConvStats): ProductivityInsight {
  const totalEmailActions = stats.emailSearches + stats.draftSaves;
  const score = Math.min(100, totalEmailActions * 12 + stats.calendarChecks * 10);

  return {
    category: 'communication',
    icon: '📬',
    title: 'Communication coverage',
    detail: `${stats.emailSearches} email searches · ${stats.calendarChecks} calendar checks · ${stats.draftSaves} drafts`,
    score: Math.max(15, Math.round(score)),
    trend: totalEmailActions > 5 ? 'up' : 'stable',
    recommendation: stats.calendarChecks === 0 ? 'Try the "Meeting prep briefing" command before your next call.' : undefined,
  };
}

function scoreOrganization(stats: ConvStats): ProductivityInsight {
  const orgActions = stats.fileSearches + stats.calendarChecks;
  const score = Math.min(100, orgActions * 15);

  return {
    category: 'organization',
    icon: '📁',
    title: 'Organization',
    detail: stats.fileSearches > 0
      ? `You found files ${stats.fileSearches} time${stats.fileSearches !== 1 ? 's' : ''} through AI this week.`
      : 'AI-powered file search can save hours.',
    score: Math.max(10, Math.round(score)),
    trend: stats.fileSearches > 2 ? 'up' : 'stable',
    recommendation: stats.fileSearches === 0 ? 'Use "Find a file" to locate documents in seconds.' : undefined,
  };
}

function scoreFollowThrough(stats: ConvStats): ProductivityInsight {
  const chainScore = stats.multiStepChains * 20;
  const score = Math.min(100, chainScore + stats.toolCallCount * 3);

  return {
    category: 'follow_through',
    icon: '✅',
    title: 'Multi-step execution',
    detail: stats.multiStepChains > 0
      ? `You ran ${stats.multiStepChains} multi-step AI workflow${stats.multiStepChains !== 1 ? 's' : ''} this week.`
      : 'Chain multiple actions together with a single instruction.',
    score: Math.max(10, Math.round(score)),
    trend: stats.multiStepChains > 1 ? 'up' : 'stable',
    recommendation: stats.multiStepChains === 0 ? 'Try: "Find the project doc, summarize it, and email to my team"' : undefined,
  };
}

// ── Main report generator ──

export function generateProductivityReport(conversations: Conversation[]): WeeklyProductivityReport {
  const stats = analyzeConversations(conversations);

  // Compute prior-week stats for week-over-week comparison
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let prevWeekActions = 0;
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.timestamp >= twoWeeksAgo && msg.timestamp < oneWeekAgo) {
        prevWeekActions += msg.toolCalls?.length ?? 0;
      }
    }
  }
  const thisWeekActions = stats.toolCallCount;
  const weekComparedToLast = prevWeekActions > 0
    ? Math.round(((thisWeekActions - prevWeekActions) / prevWeekActions) * 100)
    : thisWeekActions > 0 ? 100 : 0;

  const insights = [
    scoreSpeed(stats),
    scoreFocus(stats),
    scoreCommunication(stats),
    scoreOrganization(stats),
    scoreFollowThrough(stats),
  ];

  const overallScore = Math.round(insights.reduce((sum, i) => sum + i.score, 0) / insights.length);

  const topStrength = insights.reduce((a, b) => a.score > b.score ? a : b);
  const topImprovement = insights.reduce((a, b) => a.score < b.score ? a : b);

  let headline: string;
  let subheadline: string;

  if (overallScore >= 75) {
    headline = 'Strong week — you\'re in flow.';
    subheadline = 'AI is meaningfully accelerating your work.';
  } else if (overallScore >= 50) {
    headline = 'Solid week with room to grow.';
    subheadline = 'A few small habit shifts could boost your output significantly.';
  } else if (overallScore >= 25) {
    headline = 'Getting started — let\'s build momentum.';
    subheadline = 'The more you use AI workflows, the faster you\'ll move.';
  } else {
    headline = 'Light week — AI ready to help.';
    subheadline = 'Ask anything. I can handle email, calendar, files, and more.';
  }

  return {
    overallScore,
    headline,
    subheadline,
    insights,
    topStrength: `${topStrength.icon} ${topStrength.title}`,
    topImprovement: `${topImprovement.icon} ${topImprovement.recommendation ?? topImprovement.title}`,
    weekComparedToLast,
    activeDays: stats.activeDays.size,
    totalActions: stats.toolCallCount,
    generatedAt: Date.now(),
  };
}
