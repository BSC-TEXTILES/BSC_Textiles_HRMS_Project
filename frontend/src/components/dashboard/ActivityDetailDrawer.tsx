'use client';

/**
 * Full detail for one live activity: who, what happened, the exact rule that
 * was broken, the day's punches, the audit trail, and the HR actions the
 * caller's permissions actually allow.
 *
 * The action buttons are rendered from the permission flags the summary
 * endpoint computed from RBAC — they are a convenience, not the control. The
 * server re-checks the same permission on POST, so hiding a button is never
 * what stops an unauthorised decision.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import type { LiveEvent } from './LiveActivitiesSection';

export interface ActivityPermissions {
  canRegularize?: boolean;
  canWaiveFine?: boolean;
  canApproveOvertime?: boolean;
  canRemark?: boolean;
}

interface Detail {
  event: LiveEvent & { decisionNote?: string | null; decidedAt?: string | null };
  employee: {
    fullName: string; employeeCode: string; designation: string | null;
    departmentName: string | null; locationName: string | null; managerName: string | null;
    shiftId: string | null; status: string | null;
  } | null;
  punches: { id: string; at: string | null; punchType: string; verifyMode: string | null; deviceName: string | null; serialNumber: string | null; source: string }[];
  auditTrail: { action: string; entityType: string; entityId: string; userId: string | null; ipAddress: string | null; at: string | null }[];
}

const EXPLANATION: Record<string, string> = {
  missed_in: 'No check-in was recorded against a scheduled shift. The employee was expected on the shift start shown below; a manual correction or a terminal sync usually resolves it.',
  missed_out: 'A check-in exists but no check-out. Until the exit punch arrives the day is incomplete, so working hours and overtime cannot be finalised.',
  mismatch: 'The terminal reported something that does not reconcile with the roster — an unrecognised badge, a name that differs from the device record, or a punch on a device the employee is not assigned to.',
  late_arrival: 'Check-in fell after the shift grace period. The fine is computed from chargeable minutes under the location late policy and can be waived by an approver.',
  early_departure: 'Check-out fell before the scheduled shift end without an approved reason.',
  overtime_start: 'Work continued past the scheduled shift end.',
  overtime_end: 'An overtime window closed. Hours are payable at the shift overtime rate once approved.',
  leave: 'A leave application covers this day.',
  absence: 'Marked absent for the scheduled day.',
  assignment: 'The employee was moved to a different floor, section, selling point or reporting line.',
  shift_change: 'The reporting line or shift assignment changed.',
  correction: 'A manual attendance correction was requested or decided.',
};

function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(iso));
}

function money(value: unknown): string {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function ActivityDetailDrawer({
  event, onClose, permissions, onDecided,
}: {
  event: LiveEvent | null;
  onClose: () => void;
  permissions?: ActivityPermissions;
  onDecided: (updated: any) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/live-activities/events/${encodeURIComponent(event.dedupeKey || event.id)}`);
      setDetail(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load this activity.');
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    setDetail(null);
    setNote('');
    load();
  }, [load]);

  const act = async (action: string) => {
    if (!event) return;
    setBusy(action);
    setError(null);
    try {
      const res = await api.post(`/live-activities/events/${encodeURIComponent(event.dedupeKey || event.id)}/action`, { action, note });
      onDecided(res.data?.event || { status: res.data?.event?.status });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'That action could not be recorded.');
    } finally {
      setBusy(null);
    }
  };

  const payload = (detail?.event?.payload || event?.payload || {}) as Record<string, any>;
  const isFinance = (detail?.event?.category || event?.category) === 'FINANCE';
  const isOvertime = (detail?.event?.category || event?.category) === 'OVERTIME';

  const allActions: { key: string; label: string; allowed: boolean; tone: 'primary' | 'danger' | 'neutral' }[] = [
    { key: 'REGULARIZE', label: 'Regularize punch', allowed: Boolean(permissions?.canRegularize), tone: 'primary' },
    { key: 'WAIVE', label: 'Waive fine', allowed: isFinance && Boolean(permissions?.canWaiveFine), tone: 'neutral' },
    { key: 'APPLY_FINE', label: 'Apply fine', allowed: isFinance && Boolean(permissions?.canWaiveFine), tone: 'danger' },
    { key: 'APPROVE_OVERTIME', label: 'Approve overtime', allowed: isOvertime && Boolean(permissions?.canApproveOvertime), tone: 'primary' },
    { key: 'APPROVE', label: 'Approve', allowed: Boolean(permissions?.canApproveOvertime || permissions?.canRegularize), tone: 'primary' },
    { key: 'REJECT', label: 'Reject', allowed: Boolean(permissions?.canApproveOvertime || permissions?.canRegularize), tone: 'danger' },
  ];
  const actions = allActions.filter((action) => action.allowed);

  return (
    <Drawer open={Boolean(event)} onClose={onClose} title="Activity detail" size="lg">
      {loading ? (
        <div className="p-6 space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : error && !detail ? (
        <div className="p-6">
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          <button type="button" onClick={load} className="mt-3 text-xs font-semibold text-[#0058be] dark:text-blue-400 underline">Try again</button>
        </div>
      ) : (
        <div className="p-4 sm:p-6 space-y-5">
          {/* What happened */}
          <div>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h3 className="text-base font-bold text-[#0b1c30] dark:text-slate-100">{detail?.event?.summary || event?.summary}</h3>
              <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                {detail?.event?.status || event?.status}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              {when(detail?.event?.occurredAt || event?.occurredAt)} · {detail?.event?.type?.replace(/_/g, ' ') || event?.type?.replace(/_/g, ' ')}
            </p>
          </div>

          {/* Employee snippet */}
          {detail?.employee && (
            <section aria-label="Employee" className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Employee</h4>
                <Link href={`/employees/${detail.employee.employeeCode || ''}`} className="text-[11px] font-semibold text-[#0058be] dark:text-blue-400">
                  Open profile
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-[12px]">
                {[
                  ['Name', detail.employee.fullName],
                  ['Employee ID', detail.employee.employeeCode],
                  ['Designation', detail.employee.designation || '—'],
                  ['Department', detail.employee.departmentName || '—'],
                  ['Site', detail.employee.locationName || '—'],
                  ['Reports to', detail.employee.managerName || 'Not assigned'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
                    <dd className="font-medium text-[#0b1c30] dark:text-slate-100 text-right truncate">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* What went wrong */}
          {(detail?.event?.type || event?.type) && EXPLANATION[(detail?.event?.type || event?.type)!] && (
            <section aria-label="Explanation" className="rounded-lg bg-[#eff4ff] dark:bg-blue-950/40 border border-[#dce9ff] dark:border-blue-900/50 p-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#0058be] dark:text-blue-400">What this is</h4>
              <p className="text-[12px] text-slate-700 dark:text-slate-300 mt-1">{EXPLANATION[(detail?.event?.type || event?.type)!]}</p>
              {payload.mismatchType && (
                <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-2">
                  Detected: <b>{String(payload.mismatchType).replace(/_/g, ' ')}</b>
                  {payload.expected ? ` · expected ${typeof payload.expected === 'object' ? JSON.stringify(payload.expected) : payload.expected}` : ''}
                  {payload.received ? ` · received ${typeof payload.received === 'object' ? JSON.stringify(payload.received) : payload.received}` : ''}
                  {payload.deviceName ? ` · on ${payload.deviceName}` : ''}
                </p>
              )}
            </section>
          )}

          {/* Fine calculation */}
          {isFinance && (
            <section aria-label="Fine calculation" className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Late & fine</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-[12px]">
                {[
                  ['Minutes late', `${Number(payload.lateMinutes || 0)} min`],
                  ['Chargeable', `${Number(payload.chargeableMinutes || payload.lateMinutes || 0)} min`],
                  ['Fine', money(payload.finalFine ?? payload.fine)],
                  ['Waived', money(payload.waived)],
                  ['Approval', payload.approvalStatus || payload.fineStatus || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
                    <dd className="font-medium text-[#0b1c30] dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Overtime */}
          {isOvertime && (
            <section aria-label="Overtime" className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Overtime</h4>
              <p className="text-[12px] text-slate-700 dark:text-slate-300 mt-2">
                {(Number(payload.overtimeSeconds || 0) / 3600).toFixed(1)} hours · from {when(payload.actualLogin)} to {when(payload.actualLogout)}
              </p>
            </section>
          )}

          {/* Punch history */}
          <section aria-label="Punch history for the day">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Punches on this day
            </h4>
            {detail?.punches?.length ? (
              <ul className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {detail.punches.map((p, i) => (
                  <li key={`${p.id}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[15px] text-slate-400">
                        {p.punchType === 'CHECK_OUT' || p.punchType === 'APP_CHECK_IN' ? 'logout' : 'login'}
                      </span>
                      <span className="truncate text-[#0b1c30] dark:text-slate-200">
                        {String(p.punchType || '').replace(/_/g, ' ')} · {p.deviceName || p.source}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-500 dark:text-slate-400 tabular-nums">{when(p.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-400 dark:text-slate-500">No punch rows for this employee on this date.</p>
            )}
          </section>

          {/* HR actions */}
          {(actions.length || permissions?.canRemark) && (
            <section aria-label="HR actions" className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</h4>
              <label className="sr-only" htmlFor="activity-note">Remark</label>
              <textarea
                id="activity-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Optional remark for the audit trail…"
                className="w-full text-[12px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1526] p-2 text-[#0b1c30] dark:text-slate-100"
              />
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => act(action.key)}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      action.tone === 'danger'
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300'
                        : action.tone === 'primary'
                          ? 'bg-[#0058be] text-white hover:bg-[#00489c]'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {busy === action.key ? 'Working…' : action.label}
                  </button>
                ))}
              </div>
              {detail?.event?.decisionNote && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Last decision: {detail.event.decisionNote} ({when(detail.event.decidedAt)})
                </p>
              )}
            </section>
          )}

          {/* Audit trail */}
          <section aria-label="Audit trail">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Audit trail</h4>
            {detail?.auditTrail?.length ? (
              <ul className="space-y-1.5">
                {detail.auditTrail.map((entry, i) => (
                  <li key={`${entry.action}-${i}`} className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-600 dark:text-slate-300">{String(entry.action).replace(/_/g, ' ')} · {entry.entityType}</span>
                    <span className="tabular-nums">{when(entry.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-400 dark:text-slate-500">No audit entries reference this record yet.</p>
            )}
          </section>

          {error && detail && <p role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </Drawer>
  );
}

export default ActivityDetailDrawer;
