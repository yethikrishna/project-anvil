'use client';

import { useState, useCallback } from 'react';
import { cn } from '../utils';

// ── Types ──

export type AnvilApp = 'drive' | 'docs' | 'youtube' | 'maps' | 'search' | 'gmail' | 'marketplace' | 'calendar' | 'tasks' | 'photos' | 'chat';

export interface NavItem {
  id: AnvilApp;
  label: string;
  icon: React.ReactNode;
  href: string;
  badge?: number;
}

export interface SidebarProps {
  activeApp?: AnvilApp;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  children?: React.ReactNode;
}

// ── App Icons (SVG) ──

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DocsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function MapsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

// ── App Registry ──

export const ANVIL_APPS: NavItem[] = [
  { id: 'search', label: 'Search', icon: <SearchIcon />, href: '/' },
  { id: 'gmail', label: 'Mail', icon: <GmailIcon />, href: '/mail' },
  { id: 'drive', label: 'Drive', icon: <DriveIcon />, href: '/drive' },
  { id: 'docs', label: 'Docs', icon: <DocsIcon />, href: '/docs' },
  { id: 'youtube', label: 'Video', icon: <YoutubeIcon />, href: '/video' },
  { id: 'maps', label: 'Maps', icon: <MapsIcon />, href: '/maps' },
  { id: 'marketplace' as AnvilApp, label: 'Plugins', icon: <span className="text-base">🧩</span>, href: '/marketplace' },
  { id: 'calendar' as AnvilApp, label: 'Calendar', icon: <CalendarIcon />, href: '/calendar' },
  { id: 'tasks' as AnvilApp, label: 'Tasks', icon: <TasksIcon />, href: '/tasks' },
  { id: 'photos' as AnvilApp, label: 'Photos', icon: <span className="text-base">📷</span>, href: '/photos' },
  { id: 'chat' as AnvilApp, label: 'AI', icon: <span className="text-base">🤖</span>, href: '/chat' },
];

// ── App Switcher ──

export interface AppSwitcherProps {
  activeApp?: AnvilApp;
  collapsed?: boolean;
}

export function AppSwitcher({ activeApp, collapsed }: AppSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentApp = ANVIL_APPS.find(a => a.id === activeApp);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          collapsed && 'justify-center px-0'
        )}
      >
        <span className="text-lg">⚡</span>
        {!collapsed && (
          <>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Anvil</span>
            <svg className="w-4 h-4 ml-auto text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={cn(
            'absolute z-50 mt-1 rounded-xl border border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-900 shadow-lg p-2',
            collapsed ? 'left-full ml-2' : 'left-0 w-full'
          )}>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-3 py-1 mb-1">
              Switch to
            </div>
            {ANVIL_APPS.map(app => (
              <a
                key={app.id}
                href={app.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeApp === app.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <span className="w-5 h-5">{app.icon}</span>
                <span>{app.label}</span>
                {app.badge ? (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {app.badge > 99 ? '99+' : app.badge}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Mobile Nav ──

export interface MobileNavProps {
  activeApp?: AnvilApp;
}

export function MobileNav({ activeApp }: MobileNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {ANVIL_APPS.map(app => (
          <a
            key={app.id}
            href={app.href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-xs transition-colors',
              activeApp === app.id
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
            <span className="w-5 h-5">{app.icon}</span>
            <span>{app.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

// ── Hamburger Button ──

export function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Toggle navigation"
    >
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}

// ── Sidebar ──

export function Sidebar({
  activeApp,
  collapsed = false,
  onToggleCollapse,
  user,
  onLogout,
  children,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900',
        'flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header with App Switcher */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <AppSwitcher activeApp={activeApp} collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {ANVIL_APPS.map(app => (
          <a
            key={app.id}
            href={app.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              activeApp === app.id
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              collapsed && 'justify-center px-0'
            )}
            title={collapsed ? app.label : undefined}
          >
            <span className="w-5 h-5 shrink-0">{app.icon}</span>
            {!collapsed && <span>{app.label}</span>}
            {!collapsed && app.badge ? (
              <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {app.badge > 99 ? '99+' : app.badge}
              </span>
            ) : null}
          </a>
        ))}

        {/* App-specific children (e.g. Drive folders, Gmail labels) */}
        {children && (
          <div className={cn('mt-4 pt-4 border-t border-gray-200 dark:border-gray-700', collapsed && 'hidden')}>
            {children}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-2">
        {/* Collapse toggle */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
              'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              collapsed && 'justify-center px-0'
            )}
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        )}

        {/* User section */}
        {user && !collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mt-1">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
              {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Sign out"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
