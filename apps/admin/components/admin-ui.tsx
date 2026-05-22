/**
 * Admin console shared components — sidebar navigation, layout, and auth context.
 */
'use client';

import {useState, createContext, useContext, type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

// ── Auth Context ──

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  tenantId: string;
  tenantName: string;
}

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({user: null, isLoading: true});

export function useAdminAuth() {
  return useContext(AuthContext);
}

// ── Sidebar Navigation ──

const NAV_ITEMS = [
  {href: '/', label: 'Dashboard', icon: '📊'},
  {href: '/users', label: 'Users', icon: '👥'},
  {href: '/audit', label: 'Audit Log', icon: '📋'},
  {href: '/security', label: 'Security', icon: '🛡️'},
  {href: '/billing', label: 'Billing', icon: '💳'},
  {href: '/settings', label: 'Settings', icon: '⚙️'},
];

export function AdminSidebar({collapsed = false}: {collapsed?: boolean}) {
  const pathname = usePathname();

  return (
    <aside className={`fixed left-0 top-0 bottom-0 bg-gray-900 dark:bg-gray-950 text-white flex flex-col z-30 transition-all ${collapsed ? 'w-16' : 'w-56'}`}>
      {/* Logo */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <span className="text-2xl">🔨</span>
        {!collapsed && <span className="font-bold text-lg">Anvil Admin</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
        {!collapsed && <span>Anvil v0.1.0</span>}
      </div>
    </aside>
  );
}

// ── Page Header ──

export function PageHeader({title, description, actions}: {title: string; description?: string; actions?: ReactNode}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// ── Admin Layout ──

export function AdminLayout({children}: {children: ReactNode}) {
  const [sidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminSidebar collapsed={sidebarCollapsed} />
      <main className={`${sidebarCollapsed ? 'ml-16' : 'ml-56'} min-h-screen`}>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

// ── Common UI ──

export function Badge({variant = 'default', children}: {variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode}) {
  const colors = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[variant]}`}>{children}</span>;
}

export function Button({variant = 'primary', size = 'md', children, onClick, disabled}: {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50';
  const sizes = {sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm'};
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]}`}>
      {children}
    </button>
  );
}

export function Card({children, className = ''}: {children: ReactNode; className?: string}) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({label, value, change, icon}: {label: string; value: string | number; change?: string; icon: string}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          {change && <p className="mt-1 text-xs text-green-600 dark:text-green-400">{change}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </Card>
  );
}

export function EmptyState({icon, title, description, action}: {icon: string; title: string; description: string; action?: ReactNode}) {
  return (
    <div className="text-center py-12">
      <span className="text-4xl">{icon}</span>
      <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function DataTable<T>({columns, data, onRowClick}: {
  columns: {key: string; label: string; render?: (row: T) => ReactNode}[];
  data: T[];
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            {columns.map(col => (
              <th key={col.key} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-gray-100 dark:border-gray-800/50 ${onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''}`}
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {col.render ? col.render(row) : String((row as any)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
