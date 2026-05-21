/**
 * Session security — device fingerprinting, session management, login history.
 *
 * Features:
 * - Browser fingerprint (canvas, WebGL, screen, timezone)
 * - Session tracking with device metadata
 * - Login history with suspicious activity detection
 * - Session revocation
 * - Concurrent session limits
 */

// ── Types ──

export interface DeviceFingerprint {
  hash: string;
  browser: string;
  os: string;
  screen: string;
  timezone: string;
  language: string;
  platform: string;
  cores: number;
  memory: number;
  touchSupport: boolean;
}

export interface SessionInfo {
  id: string;
  userId: string;
  device: DeviceFingerprint;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface LoginEvent {
  id: string;
  userId: string;
  device: DeviceFingerprint;
  ipAddress: string;
  location?: string;
  timestamp: string;
  success: boolean;
  failureReason?: string;
}

export interface SuspiciousActivity {
  type: 'new_device' | 'new_location' | 'concurrent_sessions' | 'rapid_logins' | 'impossible_travel';
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp: string;
  details: Record<string, unknown>;
}

// ── Device Fingerprinting ──

export async function generateDeviceFingerprint(): Promise<DeviceFingerprint> {
  if (typeof window === 'undefined') {
    return {
      hash: 'server', browser: 'server', os: 'server', screen: 'server',
      timezone: 'UTC', language: 'en', platform: 'server', cores: 0,
      memory: 0, touchSupport: false,
    };
  }

  const ua = navigator.userAgent;
  const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;

  // Canvas fingerprint
  let canvasHash = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d')!;
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('AnvilFP', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('AnvilFP', 4, 17);
    canvasHash = canvas.toDataURL().slice(-50);
  } catch {}

  // Build hash from components
  const components = [
    ua,
    screen,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.platform,
    navigator.hardwareConcurrency?.toString() ?? '0',
    (navigator as any).deviceMemory?.toString() ?? '0',
    'ontouchstart' in window ? '1' : '0',
    canvasHash,
  ];

  const hashInput = components.join('|');
  // Simple hash (in production, use SubtleCrypto SHA-256)
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }

  return {
    hash: Math.abs(hash).toString(36) + canvasHash.slice(0, 8),
    browser: ua.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/)?.[0] ?? 'unknown',
    os: ua.match(/(Windows|Mac|Linux|Android|iOS)[\s\w]*/)?.[0]?.split(')')[0] ?? 'unknown',
    screen,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    cores: navigator.hardwareConcurrency ?? 0,
    memory: (navigator as any).deviceMemory ?? 0,
    touchSupport: 'ontouchstart' in window,
  };
}

// ── Session Manager (in-memory, swap for Redis in prod) ──

const sessions = new Map<string, SessionInfo>();
const loginHistory: LoginEvent[] = [];
const MAX_CONCURRENT_SESSIONS = 5;

export class SessionManager {
  /**
   * Create a new session.
   */
  async createSession(userId: string, ipAddress: string, userAgent: string): Promise<SessionInfo> {
    const device = await generateDeviceFingerprint();
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date();

    const session: SessionInfo = {
      id: sessionId,
      userId,
      device,
      ipAddress,
      userAgent,
      createdAt: now.toISOString(),
      lastActiveAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      isCurrent: true,
    };

    // Check concurrent session limit
    const userSessions = this.getUserSessions(userId);
    if (userSessions.length >= MAX_CONCURRENT_SESSIONS) {
      // Revoke oldest session
      const oldest = userSessions.sort((a, b) =>
        new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime()
      )[0];
      if (oldest) sessions.delete(oldest.id);
    }

    sessions.set(sessionId, session);

    // Record login event
    loginHistory.push({
      id: `login_${Date.now()}`,
      userId,
      device,
      ipAddress,
      timestamp: now.toISOString(),
      success: true,
    });

    return session;
  }

  /**
   * Get all sessions for a user.
   */
  getUserSessions(userId: string): SessionInfo[] {
    return Array.from(sessions.values())
      .filter(s => s.userId === userId);
  }

  /**
   * Validate a session and update last active.
   */
  validateSession(sessionId: string): SessionInfo | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    if (new Date(session.expiresAt) < new Date()) {
      sessions.delete(sessionId);
      return null;
    }

    session.lastActiveAt = new Date().toISOString();
    return session;
  }

  /**
   * Revoke a specific session.
   */
  revokeSession(sessionId: string): boolean {
    return sessions.delete(sessionId);
  }

  /**
   * Revoke all sessions for a user except the current one.
   */
  revokeOtherSessions(userId: string, currentSessionId: string): number {
    let count = 0;
    for (const [id, session] of sessions.entries()) {
      if (session.userId === userId && id !== currentSessionId) {
        sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Get login history for a user.
   */
  getLoginHistory(userId: string): LoginEvent[] {
    return loginHistory.filter(e => e.userId === userId);
  }

  /**
   * Detect suspicious activity.
   */
  detectSuspiciousActivity(userId: string): SuspiciousActivity[] {
    const activities: SuspiciousActivity[] = [];
    const userLogins = loginHistory.filter(e => e.userId === userId && e.success);
    const userSessions = this.getUserSessions(userId);

    // New device detection
    const deviceHashes = new Set(userLogins.slice(0, -1).map(l => l.device.hash));
    const latestLogin = userLogins[userLogins.length - 1];
    if (latestLogin && !deviceHashes.has(latestLogin.device.hash) && userLogins.length > 1) {
      activities.push({
        type: 'new_device',
        severity: 'medium',
        description: `Login from new device: ${latestLogin.device.browser} on ${latestLogin.device.os}`,
        timestamp: latestLogin.timestamp,
        details: {deviceHash: latestLogin.device.hash},
      });
    }

    // Rapid logins (more than 5 in 10 minutes)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentLogins = userLogins.filter(l => new Date(l.timestamp) > tenMinAgo);
    if (recentLogins.length > 5) {
      activities.push({
        type: 'rapid_logins',
        severity: 'high',
        description: `${recentLogins.length} login attempts in the last 10 minutes`,
        timestamp: new Date().toISOString(),
        details: {count: recentLogins.length},
      });
    }

    // Concurrent sessions
    if (userSessions.length > 3) {
      activities.push({
        type: 'concurrent_sessions',
        severity: 'low',
        description: `${userSessions.length} active sessions across different devices`,
        timestamp: new Date().toISOString(),
        details: {sessionCount: userSessions.length},
      });
    }

    return activities;
  }
}
