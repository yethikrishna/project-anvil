'use client';

import {useState, useEffect} from 'react';

/**
 * Real-time presence indicators for the workspace shell.
 * Shows which users are currently active in each app.
 */

export interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  currentApp: string;
  lastSeen: Date;
  status: 'active' | 'idle' | 'offline';
}

// ── Presence Indicator (for sidebar/shell) ──

export function PresenceIndicator({users, max = 5}: {users: PresenceUser[]; max?: number}) {
  const activeUsers = users.filter(u => u.status === 'active');
  const shown = activeUsers.slice(0, max);
  const remaining = activeUsers.length - max;

  return (
    <div className="flex items-center gap-1">
      {shown.map(user => (
        <div
          key={user.id}
          className="relative group"
          title={`${user.name} — ${user.currentApp}`}
        >
          {/* Avatar */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-900"
            style={{backgroundColor: user.color}}
          >
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>

          {/* Active dot */}
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-white dark:ring-gray-900" />

          {/* Tooltip */}
          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap z-50">
            {user.name} <span className="text-gray-400">in {user.currentApp}</span>
          </div>
        </div>
      ))}

      {remaining > 0 && (
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-600 dark:text-gray-400 font-medium">
          +{remaining}
        </div>
      )}
    </div>
  );
}

// ── Global Presence Bar (for shell header) ──

export function GlobalPresenceBar({users}: {users: PresenceUser[]}) {
  const [showAll, setShowAll] = useState(false);

  const active = users.filter(u => u.status === 'active');
  const idle = users.filter(u => u.status === 'idle');

  // Group active users by app
  const byApp = new Map<string, PresenceUser[]>();
  for (const user of active) {
    if (!byApp.has(user.currentApp)) byApp.set(user.currentApp, []);
    byApp.get(user.currentApp)!.push(user);
  }

  return (
    <div className="flex items-center gap-3">
      {/* Active count */}
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-xs text-gray-500">{active.length} online</span>
      </div>

      {/* Avatars */}
      <PresenceIndicator users={users} max={4} />

      {/* Expandable list */}
      {showAll && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3 z-50">
          <h4 className="text-xs font-semibold text-gray-500 mb-2">Active Now</h4>
          {active.map(user => (
            <div key={user.id} className="flex items-center gap-2 py-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{backgroundColor: user.color}}
              >
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                <div className="text-[10px] text-gray-400">in {user.currentApp}</div>
              </div>
              <div className="w-2 h-2 bg-green-500 rounded-full" />
            </div>
          ))}

          {idle.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-gray-500 mt-3 mb-2">Idle</h4>
              {idle.map(user => (
                <div key={user.id} className="flex items-center gap-2 py-1.5 opacity-50">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{backgroundColor: user.color}}
                  >
                    {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-600 dark:text-gray-400">{user.name}</div>
                    <div className="text-[10px] text-gray-400">{user.currentApp}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setShowAll(!showAll)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        {showAll ? '▲' : '▼'}
      </button>
    </div>
  );
}

// ── Hook for presence data ──

export function usePresence(initialUsers: PresenceUser[]) {
  const [users, setUsers] = useState(initialUsers);

  // Simulate presence changes
  useEffect(() => {
    const interval = setInterval(() => {
      setUsers(prev => prev.map(u => ({
        ...u,
        status: Math.random() > 0.1 ? u.status : (u.status === 'active' ? 'idle' : 'active'),
        lastSeen: new Date(),
      })));
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return users;
}
