/**
 * GET  /api/intelligence — Get extracted conversation intelligence summary.
 * PUT  /api/intelligence — Update task status (done/cancelled).
 *
 * Returns tasks, decisions, and commitments extracted from all conversations.
 * This powers the "Action Items" sidebar panel and weekly summaries.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getIntelligenceSummary,
  getPendingTasks,
  getRecentDecisions,
  getRecentCommitments,
  updateTaskStatus,
} from '@/lib/conversation-intelligence';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') ?? 'default';
  const view = searchParams.get('view') ?? 'summary';

  switch (view) {
    case 'tasks':
      return NextResponse.json({ tasks: getPendingTasks(userId) });

    case 'decisions':
      return NextResponse.json({ decisions: getRecentDecisions(userId, 20) });

    case 'commitments':
      return NextResponse.json({ commitments: getRecentCommitments(userId, 20) });

    case 'summary':
    default:
      return NextResponse.json(getIntelligenceSummary(userId));
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    userId?: string;
    taskId: string;
    status: 'done' | 'cancelled';
  };

  const userId = body.userId ?? 'default';
  const { taskId, status } = body;

  if (!taskId || !['done', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Missing taskId or invalid status' }, { status: 400 });
  }

  const success = updateTaskStatus(userId, taskId, status);
  return NextResponse.json({ success });
}
