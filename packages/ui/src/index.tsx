/**
 * @anvil/ui — Shared component library for Project Anvil
 */

import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

// ── Utilities ──

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── App Shell ──

export interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  activeApp?: 'drive' | 'docs' | 'youtube' | 'maps' | 'search' | 'gmail';
}

export function AppShell({children, sidebar, header, activeApp}: AppShellProps) {
  const apps = [
    {id: 'drive', label: 'Drive', icon: '📁', href: '/drive'},
    {id: 'docs', label: 'Docs', icon: '📝', href: '/docs'},
    {id: 'youtube', label: 'YouTube', icon: '▶️', href: '/youtube'},
    {id: 'maps', label: 'Maps', icon: '🗺️', href: '/maps'},
    {id: 'search', label: 'Search', icon: '🔍', href: '/search'},
    {id: 'gmail', label: 'Gmail', icon: '✉️', href: '/gmail'},
  ] as const;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Anvil</h1>
        </div>
        <nav className="flex-1 p-2">
          {apps.map(app => (
            <a
              key={app.id}
              href={app.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                activeApp === app.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span>{app.icon}</span>
              <span>{app.label}</span>
            </a>
          ))}
        </nav>
        {sidebar}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {header && (
          <header className="h-14 border-b border-gray-200 bg-white flex items-center px-4">
            {header}
          </header>
        )}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

// ── Button ──

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
          'bg-blue-600 text-white hover:bg-blue-700': variant === 'primary',
          'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50': variant === 'secondary',
          'text-gray-600 hover:bg-gray-100': variant === 'ghost',
          'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
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
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'placeholder:text-gray-400',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
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
        'rounded-xl border border-gray-200 bg-white p-4 shadow-sm',
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
        'rounded-full bg-blue-600 text-white flex items-center justify-center font-medium',
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
          'bg-gray-100 text-gray-700': variant === 'default',
          'bg-green-100 text-green-700': variant === 'success',
          'bg-yellow-100 text-yellow-700': variant === 'warning',
          'bg-red-100 text-red-700': variant === 'danger',
        }
      )}
    >
      {children}
    </span>
  );
}
