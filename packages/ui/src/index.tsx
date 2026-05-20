/**
 * @anvil/ui — Shared component library for Project Anvil
 */

// ── Utilities ──
export { cn } from './utils';

// ── Shell (sidebar, app switcher, mobile nav) ──
export { AppShell } from './shell/app-shell';
export { Sidebar, AppSwitcher, MobileNav, HamburgerButton, ANVIL_APPS } from './shell/sidebar';
export type { AnvilApp, SidebarProps, AppSwitcherProps, MobileNavProps, NavItem, AppShellProps } from './shell';

// ── Primitives ──

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        'disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600': variant === 'primary',
          'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700': variant === 'secondary',
          'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800': variant === 'ghost',
          'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600': variant === 'danger',
        },
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Input ──

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({label, error, className, id, ...props}: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm',
          'text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'placeholder:text-gray-400 dark:placeholder:text-gray-500',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// ── Card ──

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({children, className, onClick}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Avatar ──

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({name, src, size = 'md'}: AvatarProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base'};

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center font-medium',
        sizeClasses[size]
      )}
    >
      {initials}
    </div>
  );
}

// ── Badge ──

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function Badge({children, variant = 'default'}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300': variant === 'default',
          'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400': variant === 'success',
          'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400': variant === 'warning',
          'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400': variant === 'danger',
        }
      )}
    >
      {children}
    </span>
  );
}

// ── Overlay Components ──
export { Modal, Dropdown, Tabs, ToastDisplay, ToastContainer, Tooltip, Skeleton, SkeletonTable, SkeletonCard, SkeletonList } from './overlay';
export type { ModalProps, DropdownProps, DropdownItem, TabsProps, Tab, Toast, ToastType, ToastContainerProps, TooltipProps, SkeletonProps } from './overlay';

// ── DataTable ──
export { DataTable } from './data-table';
export type { DataTableProps, Column } from './data-table';

// ── Theme ──
export { ThemeProvider, ThemeToggle, useTheme } from './theme';

// ── AI Copilot ──
export { AICopilot, CopilotToggleButton } from './copilot';

// ── Command Palette ──
export { CommandPalette, useGlobalShortcuts } from './command-palette';
export type { CommandItem, CommandPaletteProps, GlobalShortcut } from './command-palette';

// ── Keyboard Shortcuts ──
export { useKeyboardShortcuts, ShortcutHelpOverlay, GLOBAL_SHORTCUTS, GMAIL_SHORTCUTS, DOCS_SHORTCUTS } from './shortcuts';
export type { ShortcutDef, ShortcutState } from './shortcuts';

// ── Theme Editor ──
export { ThemeEditor, useThemeEditor, THEME_PRESETS } from './theme-editor';
export type { ThemeConfig } from './theme-editor';

// ── View Transitions & Modern CSS ──
export {
  navigateWithTransition,
  SCROLL_ANIMATION_CSS,
  CONTAINER_QUERY_CSS,
  POPOVER_CSS,
} from './transitions';
export type { TransitionType } from './transitions';

// ── Activity & Focus ──
export { ActivityTimeline, FocusModeSelector } from './activity';
export type { ActivityEntry, ActivityTimelineProps, FocusMode, FocusModeProps } from './activity';

// ── API Playground ──
export { ApiPlayground } from './api-playground';
