'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  History,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  UserCog,
  UserX,
} from 'lucide-react';
import api from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmployeeCodeText } from '@/components/employees/EmployeeCodeField';
import { formatDateSafe, formatDateTimeSafe } from '@/lib/utils';
import {
  fetchAttendanceHistory,
  fetchEmployeeAuditTrail,
  type AccountInfo,
  type ExitInfo,
} from '@/lib/inactiveEmployees';

interface Props {
  open: boolean;
  onClose: () => void;
  employee: any | null;
  account?: AccountInfo | null;
  exit?: ExitInfo | null;
  canViewPayroll: boolean;
  canViewDocuments: boolean;
  canChangeStatus: boolean;
  onReactivate: (employee: any) => void;
  onDeactivate: (employee: any) => void;
  onEdit: (employee: any) => void;
}

type SectionState = 'loading' | 'ready' | 'error';

function Section({
  title,
  icon,
  state,
  error,
  onRetry,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  state: SectionState;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/60">
        <h3 className="text-[12px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="text-[#1346a1] dark:text-sky-300">{icon}</span>
          {title}
        </h3>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-slate-400 hover:text-[#1346a1] p-1 rounded"
            title="Reload this section"
            aria-label={`Reload ${title}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </header>
      <div className="p-4">
        {state === 'loading' && (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {state === 'error' && (
          <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error || 'This section could not be loaded.'}</span>
          </div>
        )}
        {state === 'ready' && children}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-xs text-slate-800 dark:text-slate-100 mt-0.5 break-words">{value ?? '—'}</dd>
    </div>
  );
}

export function InactiveEmployeeDrawer({
  open,
  onClose,
  employee,
  account,
  exit,
  canViewPayroll,
  canViewDocuments,
  canChangeStatus,
  onReactivate,
  onDeactivate,
  onEdit,
}: Props) {
  const [attendanceState, setAttendanceState] = useState<SectionState>('loading');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  const [payrollState, setPayrollState] = useState<SectionState>('loading');
  const [payslips, setPayslips] = useState<any[]>([]);
  const [payrollError, setPayrollError] = useState<string | null>(null);

  const [docState, setDocState] = useState<SectionState>('loading');
  const [documents, setDocuments] = useState<any[]>([]);
  const [docError, setDocError] = useState<string | null>(null);

  const [historyState, setHistoryState] = useState<SectionState>('loading');
  const [history, setHistory] = useState<{ entries: any[]; limited: boolean }>({ entries: [], limited: false });
  const [historyError, setHistoryError] = useState<string | null>(null);

  const id = employee?.id as string | undefined;

  const loadAttendance = useCallback(() => {
    if (!id) return;
    setAttendanceState('loading');
    setAttendanceError(null);
    fetchAttendanceHistory(id, 30)
      .then((rows) => {
        setAttendance(rows);
        setAttendanceState('ready');
      })
      .catch(() => {
        setAttendanceError('Historical attendance could not be read for this employee.');
        setAttendanceState('error');
      });
  }, [id]);

  const loadPayroll = useCallback(() => {
    if (!id) return;
    if (!canViewPayroll) {
      setPayrollState('ready');
      setPayslips([]);
      return;
    }
    setPayrollState('loading');
    setPayrollError(null);
    api
      .get('/payroll/payslips', { params: { employeeId: id, limit: 24 } })
      .then((res) => {
        const rows = res.data?.payslips || res.data?.items || res.data?.data || [];
        setPayslips(Array.isArray(rows) ? rows : []);
        setPayrollState('ready');
      })
      .catch(() => {
        setPayrollError('Payroll history is not available for this role or the payslip service is unreachable.');
        setPayrollState('error');
      });
  }, [id, canViewPayroll]);

  const loadDocuments = useCallback(() => {
    if (!id) return;
    if (!canViewDocuments) {
      setDocState('ready');
      setDocuments([]);
      return;
    }
    setDocState('loading');
    setDocError(null);
    api
      .get(`/employees/documents/employee/${id}`)
      .then((res) => {
        const rows = res.data?.documents || res.data?.data || res.data || [];
        setDocuments(Array.isArray(rows) ? rows : []);
        setDocState('ready');
      })
      .catch(() => {
        setDocError('Document dossier could not be opened for this employee.');
        setDocState('error');
      });
  }, [id, canViewDocuments]);

  const loadHistory = useCallback(() => {
    if (!employee) return;
    setHistoryState('loading');
    setHistoryError(null);
    fetchEmployeeAuditTrail(employee)
      .then((result) => {
        setHistory(result);
        setHistoryState('ready');
      })
      .catch(() => {
        setHistoryError('Audit trail not accessible for this role.');
        setHistoryState('error');
      });
  }, [employee]);

  useEffect(() => {
    if (!open || !id) return;
    loadAttendance();
    loadPayroll();
    loadDocuments();
    loadHistory();
  }, [open, id, loadAttendance, loadPayroll, loadDocuments, loadHistory]);

  if (!employee) return null;

  const isActive = String(employee.status).toUpperCase() === 'ACTIVE';
  const reasonText = exit?.reason || employee.deactivationReason || employee.exitReason || null;

  return (
    <Drawer open={open} onClose={onClose} size="xl" title="Inactive employee dossier">
      <div className="space-y-4 pb-8">
        {/* Identity + status */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {employee.fullName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim()}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <EmployeeCodeText code={employee.employeeCode} />
                <Badge variant={isActive ? 'success' : 'danger'} dot>
                  {employee.status}
                </Badge>
                {account?.accountActive === false && (
                  <Badge variant="gray" className="border border-slate-300">
                    Login account closed
                  </Badge>
                )}
                {account?.accountActive === true && !isActive && (
                  <Badge variant="warning" className="border border-amber-300">
                    Login account still open
                  </Badge>
                )}
              </div>
            </div>
            <Link
              href={`/employees/profile/${employee.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1346a1] dark:text-sky-300 border border-[#1346a1]/30 dark:border-sky-500/40 rounded-lg px-3 py-1.5 hover:bg-[#1346a1]/10"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Full 360° profile
            </Link>
          </div>

          {/* Employment status vs last login — never conflated */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Field label="Employment status" value={<span className="font-bold">{employee.status}</span>} />
            <Field
              label="Account status"
              value={
                !account || account.accountActive === null || account.accountActive === undefined
                  ? 'No linked login account'
                  : account.accountActive
                    ? 'Active (can sign in)'
                    : 'Deactivated'
              }
            />
            <Field
              label="Last login (informational)"
              value={
                account?.lastLoginAt ? (
                  <span className="font-mono">{formatDateTimeSafe(account.lastLoginAt)}</span>
                ) : (
                  'Not recorded'
                )
              }
            />
            <Field label="Joining date" value={formatDateSafe(employee.joiningDate || employee.dateOfJoining)} />
          </div>

          <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
            Last login is display information only. An employee who has not signed in recently is still whatever
            employment status HR set — inactivity is never derived from login recency.
          </p>
        </div>

        {/* Placement & contact */}
        <Section title="Assignment, floor / counter & contact" icon={<MapPin className="w-4 h-4" />} state="ready">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Store / location" value={employee.location?.name ? `${employee.location.name}${employee.location.code ? ` (${employee.location.code})` : ''}` : '—'} />
            <Field label="Department" value={employee.department?.name || '—'} />
            <Field label="Designation" value={employee.designation || '—'} />
            <Field label="Shift" value={employee.shift?.name || 'Not mapped'} />
            <Field label="Floor" value={employee.floor?.name || 'Not assigned'} />
            <Field label="Section / counter" value={employee.section?.name || (Array.isArray(employee.sellingPoints) && employee.sellingPoints.length ? 'See counters below' : 'Not assigned')} />
            <Field label="Phone" value={employee.phone ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{employee.phone}</span> : '—'} />
            <Field label="Email" value={employee.email || '—'} />
          </dl>
          {Array.isArray(employee.sellingPoints) && employee.sellingPoints.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Assigned counters</p>
              <div className="flex flex-wrap gap-1.5">
                {employee.sellingPoints.map((sp: any) => (
                  <span
                    key={sp.id}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      sp.isPrimary
                        ? 'bg-[#1346a1]/10 text-[#1346a1] border-[#1346a1]/30'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {sp.sellingPoint?.name || sp.name || sp.sellingPointId}
                    {sp.isPrimary ? ' · primary' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Exit / deactivation */}
        <Section title="Exit / deactivation record" icon={<UserX className="w-4 h-4" />} state="ready">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Last working date" value={formatDateSafe(exit?.lastWorkingDay || employee.exitDate)} />
            <Field label="Resignation / notice date" value={formatDateSafe(exit?.resignationDate)} />
            <Field label="Exit type" value={exit?.exitType || (isActive ? 'Not applicable' : 'Not recorded')} />
            <Field label="Settlement status" value={exit?.settlementStatus || '—'} />
          </dl>
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Deactivation / exit reason
            </p>
            {reasonText ? (
              <p className="text-xs text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                {reasonText}
              </p>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                No reason captured on this record yet — use “Mark inactive” to store one.
              </p>
            )}
          </div>
          {employee.remarks && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">HR remarks</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{employee.remarks}</p>
            </div>
          )}
        </Section>

        {/* Status change history from audit data */}
        <Section
          title="Who changed this and when (audit trail)"
          icon={<History className="w-4 h-4" />}
          state={historyState}
          error={historyError}
          onRetry={loadHistory}
        >
          {history.entries.length === 0 ? (
            <p className="text-xs text-slate-500">
              {history.limited
                ? 'No audit entries for this employee were found in the accessible audit window. The audit API does not filter by employee id yet, so only the most recent records could be inspected.'
                : 'No audited changes recorded for this employee.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {history.entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                  <ClipboardList className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{entry.summary}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatDateTimeSafe(entry.createdAt)} · by {entry.actor} · {entry.entityType}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Attendance history */}
        <Section
          title="Historical attendance"
          icon={<CalendarDays className="w-4 h-4" />}
          state={attendanceState}
          error={attendanceError}
          onRetry={loadAttendance}
        >
          {attendance.length === 0 ? (
            <p className="text-xs text-slate-500">No attendance rows stored for this employee.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[11px] min-w-[520px]">
                <thead className="text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="text-left py-1.5 px-1">Date</th>
                    <th className="text-left py-1.5 px-1">Status</th>
                    <th className="text-left py-1.5 px-1">Login</th>
                    <th className="text-left py-1.5 px-1">Logout</th>
                    <th className="text-right py-1.5 px-1">Worked</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-200">
                  {attendance.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 px-1 font-mono">{formatDateSafe(row.attendanceDate)}</td>
                      <td className="py-1.5 px-1">{row.status}</td>
                      <td className="py-1.5 px-1 font-mono">{row.actualLogin ? formatDateTimeSafe(row.actualLogin).split(' ')[1] || formatDateTimeSafe(row.actualLogin) : '—'}</td>
                      <td className="py-1.5 px-1 font-mono">{row.actualLogout ? formatDateTimeSafe(row.actualLogout).split(' ')[1] || formatDateTimeSafe(row.actualLogout) : '—'}</td>
                      <td className="py-1.5 px-1 text-right font-mono">
                        {row.totalWorkingSeconds ? `${Math.floor(row.totalWorkingSeconds / 3600)}h ${Math.floor((row.totalWorkingSeconds % 3600) / 60)}m` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Payroll history */}
        {canViewPayroll && (
          <Section
            title="Payroll history"
            icon={<Banknote className="w-4 h-4" />}
            state={payrollState}
            error={payrollError}
            onRetry={loadPayroll}
          >
            {payslips.length === 0 ? (
              <p className="text-xs text-slate-500">No payslip items found for this employee.</p>
            ) : (
              <ul className="space-y-1.5">
                {payslips.map((p: any) => (
                  <li key={p.id || p.itemId} className="flex items-center justify-between gap-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {p.monthName || p.month} {p.year}
                    </span>
                    <span className="text-slate-500 font-mono">
                      ₹{Number(p.netPaid ?? p.netSalary ?? p.netAmount ?? 0).toLocaleString('en-IN')}
                    </span>
                    <Badge variant={String(p.status).toUpperCase() === 'PAID' ? 'success' : 'warning'}>{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Documents */}
        {canViewDocuments && (
          <Section
            title="Documents"
            icon={<FileText className="w-4 h-4" />}
            state={docState}
            error={docError}
            onRetry={loadDocuments}
          >
            {documents.length === 0 ? (
              <p className="text-xs text-slate-500">No documents in this employee&apos;s dossier.</p>
            ) : (
              <ul className="space-y-1.5">
                {documents.map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{d.documentType || d.type}</span>
                    <span className="text-slate-500">{formatDateSafe(d.uploadedAt || d.createdAt)}</span>
                    <Badge variant={String(d.verificationStatus || d.status || '').toUpperCase() === 'VERIFIED' ? 'success' : 'gray'}>
                      {d.verificationStatus || d.status || 'uploaded'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Actions */}
        {canChangeStatus && (
          <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(employee)}>
              <UserCog className="w-4 h-4 mr-1" /> Edit master record
            </Button>
            {isActive ? (
              <Button type="button" size="sm" variant="danger" onClick={() => onDeactivate(employee)}>
                <Briefcase className="w-4 h-4 mr-1" /> Mark inactive
              </Button>
            ) : (
              <Button type="button" size="sm" variant="success" onClick={() => onReactivate(employee)}>
                <RefreshCw className="w-4 h-4 mr-1" /> Reactivate employee
              </Button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default InactiveEmployeeDrawer;
