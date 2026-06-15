/**
 * ThemeToggle — switches between light / dark mode.
 *
 * Reads and writes to localStorage key 'anvil-chat:theme'.
 * Applies the 'dark' class to <html> so Tailwind dark: variants work.
 */

'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  // Sync initial state from DOM (injected by layout.tsx script)
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('anvil-chat:theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('anvil-chat:theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      className={`text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors ${className ?? ''}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
