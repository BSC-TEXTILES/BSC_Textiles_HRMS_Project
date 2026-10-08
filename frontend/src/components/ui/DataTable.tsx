'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './Badge';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  rowClick?: (row: T) => void;
  striped?: boolean;
  hoverable?: boolean;
  className?: string;
  pagination?: boolean;
  pageSize?: number;
}

export function DataTable<T>({ 
  columns, 
  data, 
  loading = false, 
  emptyMessage = 'No data available',
  rowClick,
  striped = false,
  hoverable = false,
  className,
  pagination = false,
  pageSize = 10,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
              {columns.map((col) => (
                <th key={col.key} className={cn('px-4 py-3', col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3', col.className)}>
                    <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-4 py-3', col.headerClassName)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                striped && rowIndex % 2 === 0 && 'bg-gray-50',
                hoverable && 'hover:bg-gray-50',
                rowClick && 'cursor-pointer'
              )}
              onClick={() => rowClick && rowClick(row as T)}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 text-sm text-gray-900', col.className)}>
                  {col.render ? col.render(row as T, rowIndex) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}