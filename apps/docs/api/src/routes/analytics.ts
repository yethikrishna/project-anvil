/**
 * Collaboration Analytics — tracks real-time editing metrics for documents.
 *
 * Metrics:
 * - Active collaborators (currently connected)
 * - Total edits per document
 * - Edit frequency over time
 * - Session duration estimates
 * - Most active collaborators
 *
 * Data is collected from:
 * - Hocuspocus awareness state (real-time presence)
 * - Document save events (edit counts)
 * - Client-side session tracking
 */

// ── Types ──

export interface CollabSession {
  userId: string;
  userName: string;
  documentId: string;
  connectedAt: string;
  editsCount: number;
  lastActiveAt: string;
  color: string;
}

export interface DocumentAnalytics {
  documentId: string;
  documentTitle: string;
  totalEdits: number;
  totalSessions: number;
  averageSessionDuration: number; // minutes
  activeCollaborators: number;
  topContributors: ContributorStats[];
  editTimeline: TimelinePoint[];
  createdAt: string;
  lastEditedAt: string;
}

export interface ContributorStats {
  userId: string;
  userName: string;
  edits: number;
  sessions: number;
  totalTimeMinutes: number;
  percentage: number;
}

export interface TimelinePoint {
  timestamp: string;
  edits: number;
  collaborators: number;
}

// ── Analytics Engine (in-memory for demo, swap for PostgreSQL) ──

const sessionStore = new Map<string, CollabSession[]>();     // documentId -> sessions
const editTimelineStore = new Map<string, TimelinePoint[]>(); // documentId -> timeline

/**
 * Record a collaborator joining a document.
 */
export function recordJoin(documentId: string, userId: string, userName: string, color: string): void {
  const sessions = sessionStore.get(documentId) ?? [];

  // Don't duplicate active sessions
  const existing = sessions.find(s => s.userId === userId && s.documentId === documentId);
  if (existing) {
    existing.lastActiveAt = new Date().toISOString();
    return;
  }

  sessions.push({
    userId,
    userName,
    documentId,
    connectedAt: new Date().toISOString(),
    editsCount: 0,
    lastActiveAt: new Date().toISOString(),
    color,
  });

  sessionStore.set(documentId, sessions);
}

/**
 * Record a collaborator leaving a document.
 */
export function recordLeave(documentId: string, userId: string): void {
  const sessions = sessionStore.get(documentId) ?? [];
  const idx = sessions.findIndex(s => s.userId === userId);
  if (idx >= 0) {
    sessions.splice(idx, 1);
  }
}

/**
 * Record an edit event.
 */
export function recordEdit(documentId: string, userId: string): void {
  const sessions = sessionStore.get(documentId) ?? [];
  const session = sessions.find(s => s.userId === userId);
  if (session) {
    session.editsCount++;
    session.lastActiveAt = new Date().toISOString();
  }

  // Update timeline
  const now = new Date();
  const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00:00.000Z`;

  const timeline = editTimelineStore.get(documentId) ?? [];
  const lastPoint = timeline[timeline.length - 1];

  if (lastPoint && lastPoint.timestamp === hourKey) {
    lastPoint.edits++;
    lastPoint.collaborators = sessions.length;
  } else {
    timeline.push({
      timestamp: hourKey,
      edits: 1,
      collaborators: sessions.length,
    });
    // Keep last 168 points (1 week of hourly data)
    if (timeline.length > 168) {
      timeline.shift();
    }
  }

  editTimelineStore.set(documentId, timeline);
}

/**
 * Get analytics for a specific document.
 */
export function getDocumentAnalytics(documentId: string): DocumentAnalytics | null {
  const sessions = sessionStore.get(documentId) ?? [];
  const timeline = editTimelineStore.get(documentId) ?? [];

  if (sessions.length === 0 && timeline.length === 0) {
    return null;
  }

  // Calculate contributor stats from all-time sessions
  // (In production, this would query PostgreSQL)
  const contributorMap = new Map<string, ContributorStats>();

  for (const session of sessions) {
    const existing = contributorMap.get(session.userId);
    const durationMin = (Date.now() - new Date(session.connectedAt).getTime()) / 60000;

    if (existing) {
      existing.edits += session.editsCount;
      existing.totalTimeMinutes += durationMin;
    } else {
      contributorMap.set(session.userId, {
        userId: session.userId,
        userName: session.userName,
        edits: session.editsCount,
        sessions: 1,
        totalTimeMinutes: durationMin,
        percentage: 0,
      });
    }
  }

  // Calculate percentages
  const totalEdits = Array.from(contributorMap.values()).reduce((sum, c) => sum + c.edits, 0);
  const contributors = Array.from(contributorMap.values())
    .sort((a, b) => b.edits - a.edits)
    .map(c => ({
      ...c,
      percentage: totalEdits > 0 ? Math.round((c.edits / totalEdits) * 100) : 0,
    }));

  return {
    documentId,
    documentTitle: '',
    totalEdits,
    totalSessions: sessions.length,
    averageSessionDuration: sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (Date.now() - new Date(s.connectedAt).getTime()) / 60000, 0) / sessions.length
      : 0,
    activeCollaborators: sessions.filter(s => {
      const lastActive = new Date(s.lastActiveAt);
      return Date.now() - lastActive.getTime() < 300000; // Active in last 5 min
    }).length,
    topContributors: contributors,
    editTimeline: timeline,
    createdAt: timeline[0]?.timestamp ?? new Date().toISOString(),
    lastEditedAt: timeline[timeline.length - 1]?.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Get global analytics across all documents.
 */
export function getGlobalAnalytics(): {
  totalDocuments: number;
  totalActiveUsers: number;
  totalEdits: number;
  topDocuments: {documentId: string; edits: number; collaborators: number}[];
} {
  const docIds = new Set([...sessionStore.keys(), ...editTimelineStore.keys()]);
  const topDocuments: {documentId: string; edits: number; collaborators: number}[] = [];

  let totalEdits = 0;
  const uniqueUsers = new Set<string>();

  for (const docId of docIds) {
    const sessions = sessionStore.get(docId) ?? [];
    const timeline = editTimelineStore.get(docId) ?? [];
    const edits = timeline.reduce((sum, t) => sum + t.edits, 0);

    totalEdits += edits;
    for (const s of sessions) uniqueUsers.add(s.userId);

    topDocuments.push({
      documentId: docId,
      edits,
      collaborators: sessions.length,
    });
  }

  topDocuments.sort((a, b) => b.edits - a.edits);

  return {
    totalDocuments: docIds.size,
    totalActiveUsers: uniqueUsers.size,
    totalEdits,
    topDocuments: topDocuments.slice(0, 10),
  };
}
