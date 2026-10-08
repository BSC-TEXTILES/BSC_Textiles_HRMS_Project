'use client';

import { ReactNode, ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './Badge';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  color: string;
  badge?: string;
  trend?: { value: string; positive: boolean };
  onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, color, badge, trend, onClick }: StatCardProps) {
  return (
    <div 
      className="card p-5 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 truncate">{value}</p>
          {badge && (
            <Badge className="mt-2" variant="info">{badge}</Badge>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', color)}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}