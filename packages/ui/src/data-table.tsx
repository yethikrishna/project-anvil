'use client';

import { cn } from '../utils';

// ── DataTable ──

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  className?: string;
  loading?: boolean;
  stickyHeader?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField = 'id',
  onRowClick,
  emptyMessage = 'No data',
  className,
  loading,
  stickyHeader,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
        <div className="animate-pulse">
          <div className="bg-gray-100 dark:bg-gray-800 h-10" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className={cn(
            'bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700',
            stickyHeader && 'sticky top-0 z-10'
          )}>
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={String(row[keyField] ?? i)}
                onClick={() => onRowClick?.(row, i)}
                className={cn(
                  'border-b border-gray-100 dark:border-gray-800 last:border-0',
                  'bg-white dark:bg-gray-900',
                  onRowClick && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50'
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn('px-4 py-3 text-gray-700 dark:text-gray-300', col.className)}>
                    {col.render ? col.render(row, i) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
