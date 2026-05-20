'use client';

import { useState, useCallback } from 'react';
import { cn } from '../utils';
import { Sidebar, MobileNav, HamburgerButton } from './sidebar';
import type { AnvilApp } from './sidebar';

// ── Types ──

export interface AppShellProps {
  children: React.ReactNode;
  activeApp?: AnvilApp;
  header?: React.ReactNode;
  sidebarContent?: React.ReactNode;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  notifications?: React.ReactNode;
}

// ── App Shell ──

export function AppShell({
  children,
  activeApp,
  header,
  sidebarContent,
  user,
  onLogout,
  notifications,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleCollapse = useCallback(() => setCollapsed(c => !c), []);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen(o => !o), []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar
          activeApp={activeApp}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          user={user}
          onLogout={onLogout}
        >
          {sidebarContent}
        </Sidebar>
      </div>

      {/* Mobile slide-over sidebar */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={toggleMobileMenu}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar
              activeApp={activeApp}
              user={user}
              onLogout={onLogout}
            >
              {sidebarContent}
            </Sidebar>
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        {(header || true) && (
          <header className="h-14 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center px-4 gap-3 shrink-0">
            <HamburgerButton onClick={toggleMobileMenu} />
            {header}
            <div className="ml-auto flex items-center gap-2">
              {notifications}
              {/* Theme toggle slot — filled by ThemeToggle when used */}
            </div>
          </header>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav activeApp={activeApp} />
    </div>
  );
}
