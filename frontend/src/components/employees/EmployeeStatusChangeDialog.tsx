'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, UserMinus, UserX } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { EmployeeCodeText } from '@/components/employees/EmployeeCodeField';

const MIN_REASON_LENGTH = 10;

export type StatusChangeIntent = 'ACTIVATE' | 'DEACTIVATE';

interface Props {
  open: boolean;
  onClose: () => void;
  employee: any | null;
  intent: StatusChangeIntent;
  /** When true the API requires a reason and the UI blocks submission without it. */
  reasonRequired?: boolean;
  onSaved: (updated: any) => void;
  onCancelIntent?: () => void;
}

/**
 * Employment-status change with a MANDATORY reason.
 *
 * Sends `PATCH /employees/:id/status` with { status, reason, lastWorkingDate }.
 * Deactivation only flips the employment state and closes the login account —
 * employee, attendance and payroll rows are never deleted, and this dialog says
 * so explicitly because it is a compliance requirement.
 */
export function EmployeeStatusChangeDialog({ open, onClose, employee, intent, reasonRequired = true, onSaved }: Props) {
  const [reason, setReason] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [closeAccount, setCloseAccount] = useState(true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivating = intent === 'DEACTIVATE';
  const targetStatus = deactivating ? 'INACTIVE' : 'ACTIVE';

  useEffect(() => {
    if (!open) return;
    setReason('');
    setLastWorkingDate('');
    setCloseAccount(deactivating);
    setTouched(false);
    setError(null);
  }, [open, intent, deactivating]);

  if (!employee) return null;

  const trimmed = reason.trim();
  const reasonError =
    trimmed.length === 0
      ? 'A reason is mandatory — the change is not recorded without it.'
      : trimmed.length < MIN_REASON_LENGTH
        ? `Give a fuller reason (at least ${MIN_REASON_LENGTH} characters) so the audit trail is usable.`
        : null;
  const blockReason = reasonRequired && Boolean(reasonError);
  const showReasonError = touched && reasonRequired;

  const submit = async () => {
    setTouched(true);
    if (blockReason) {
      toast.error('Reason is mandatory for this change.');
      return;
    }
    setError(null);
    setSaving(true);

    const payload: Record<string, any> = {
      status: targetStatus,
      reason: trimmed || (deactivating ? 'Account deactivated by HR' : 'Account reactivated by HR'),
      remarks: trimmed || undefined,
      closeAccount: deactivating ? closeAccount : false,
    };
    if (deactivating && lastWorkingDate) payload.lastWorkingDate = lastWorkingDate;
    if (deactivating && lastWorkingDate) payload.exitDate = lastWorkingDate;

    try {
      const res = await api.patch(`/employees/${employee.id}/status`, payload);
      const updated = res.data?.employee || res.data || {};
      toast.success(
        deactivating
          ? `${employee.fullName || 'Employee'} marked inactive. Attendance and payroll history retained.`
          : `${employee.fullName || 'Employee'} restored to the active workforce.`
      );
      onSaved({ ...employee, ...updated, status: updated.status || targetStatus, _reason: trimmed });
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        err?.response?.data?.error || err?.response?.data?.message || 'The HRMS API rejected this status change.';
      if (status === 400) {
        setError(
          typeof message === 'string'
            ? message
            : 'The API rejected the request — a reason is required in the body.'
        );
      } else if (status === 403) {
        setError('Your role is not allowed to change employment status (enforced by the API).');
      } else if (status === 404) {
        setError('Employee record not found on the server.');
      } else if (status === 409) {
        setError(err?.response?.data?.message || 'Another user changed this record first. Reload and try again.');
      } else {
        setError(String(message));
      }
      toast.error('Status change failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deactivating ? 'Deactivate employee account' : 'Reactivate employee'}
      className="max-w-xl"
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 p-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-sm">{employee.fullName || `${employee.firstName} ${employee.lastName}`}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-slate-500">Employee number:</span>
              <EmployeeCodeText code={employee.employeeCode} />
            </div>
            <p className="mt-1 text-slate-500">
              Current employment status: <span className="font-bold text-slate-700 dark:text-slate-200">{employee.status}</span>
              {' → '}
              <span className="font-bold">{targetStatus}</span>
            </p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${deactivating ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {deactivating ? <UserX className="w-5 h-5" /> : <UserMinus className="w-5 h-5 rotate-180" />}
          </div>
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-800 p-3 flex gap-2">
          <ShieldAlert className="w-4 h-4 text-sky-600 dark:text-sky-300 mt-0.5 shrink-0" />
          <p className="text-sky-900 dark:text-sky-200">
            {deactivating
              ? 'Deactivating hides the employee from active workforce counts and closes their login. Their attendance, payroll and document history stay in the database and remain in historical reports.'
              : 'Reactivating restores the employee to active workforce counts. Their previous attendance and payroll history is untouched and stays linked to the same employee number.'}
          </p>
        </div>

        <Textarea
          label={reasonRequired ? 'Reason for change *' : 'Reason for change'}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          rows={4}
          placeholder={
            deactivating
              ? 'e.g. Resigned — last working day 31 Aug 2026, notice served; F&F cleared. Login closed by HR.'
              : 'e.g. Rejoining after resignation withdrawal approved by HR Head on 12 Oct 2026.'
          }
          error={showReasonError ? reasonError ?? undefined : undefined}
          helperText={
            reasonRequired
              ? 'Mandatory. Stored with your user id and timestamp in the audit trail.'
              : 'Optional here — the API does not enforce a reason yet, but HR policy requires one.'
          }
        />

        {deactivating && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Last working date"
              type="date"
              value={lastWorkingDate}
              onChange={(e) => setLastWorkingDate(e.target.value)}
              helperText="Recorded as the exit date on the master record."
            />
            <Select
              label="Login account"
              value={closeAccount ? 'close' : 'keep'}
              onChange={(e) => setCloseAccount(e.target.value === 'close')}
              options={[
                { value: 'close', label: 'Close sign-in access too' },
                { value: 'keep', label: 'Keep sign-in enabled (inactive but reachable)' },
              ]}
            />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-3 flex gap-2 text-red-700 dark:text-red-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={deactivating ? 'danger' : 'success'}
            disabled={saving || blockReason}
            onClick={submit}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            {deactivating ? 'Mark inactive' : 'Reactivate employee'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default EmployeeStatusChangeDialog;
