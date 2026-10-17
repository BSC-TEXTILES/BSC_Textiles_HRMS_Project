'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function HireError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-200">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export default HireError;
