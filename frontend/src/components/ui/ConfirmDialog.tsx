'use client';

import { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** Extra context shown verbatim, e.g. the users that would be affected. */
  details?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive actions in the access-control screens go through this instead of
 * `window.confirm`, so the consequence is stated before it happens.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  details,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <Modal open onClose={onCancel} title={title} className="max-w-md">
      <div className="space-y-4">
        <div className="flex gap-3">
          {tone === 'danger' && (
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="text-sm text-gray-700 dark:text-slate-300">{message}</div>
        </div>
        {details && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            {details}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
