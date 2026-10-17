'use client';

/**
 * Mismatch detail drawer — the single place a biometric mismatch is inspected
 * and decided. Shared by the device console and the executive dashboard so the
 * same record never presents two different resolution forms.
 *
 * The server owns every rule (scope, allowed actions, decided-record lock);
 * this component only renders the plan it returns and never assumes a decision
 * succeeded.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowRight, CheckCircle2, Search, XCircle } from 'lucide-react';

export interface MismatchRecord {
  id: string;
  mismatchType: string;
  severity: string;
  status: string;
  detectedBy: string;
  dedupeKey: string;
  deviceId: string | null;
  serialNumber: string | null;
  deviceName: string | null;
  floorName: string | null;
  sectionName: string | null;
  locationCode: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  biometricId: string | null;
  punchId: string | null;
  punchTime: string | null;
  expected: any;
  received: any;
  details: string | null;
  occurrenceCount: number;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolutionAction: string | null;
  remark: string | null;
}

interface ResolveResult {
  ok: boolean;
  message: string;
  dryRun?: boolean;
  changes?: Array<{ field: string; before: any; after: any }>;
  notes?: string[];
  remappedPunches?: number;
  record?: MismatchRecord | null;
}

const ACTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'RELINK', label: 'Relink PIN to employee', hint: 'Attach this biometric id to the correct employee and attribute held punches.' },
  { value: 'EDIT_EMPLOYEE', label: 'Edit employee / mapping', hint: 'Apply the employee details to the mapping without changing the fingerprint id.' },
  { value: 'EDIT_BIOMETRIC_ID', label: 'Correct biometric id', hint: 'Replace a wrong enrollment number with the id the terminal should use.' },
  { value: 'REASSIGN_DEVICE', label: 'Reassign terminal', hint: 'Point the employee mapping at another registered terminal.' },
  { value: 'RESYNC_TO_DEVICE', label: 'Push to device', hint: 'Queue a USERINFO update so the terminal learns the corrected record.' },
  { value: 'RESYNC_FROM_DEVICE', label: 'Pull from device', hint: 'Queue USERINFO + ATTLOG queries and process the reply.' },
  { value: 'RESOLVE', label: 'Mark resolved', hint: 'Close the record when the problem has already been fixed elsewhere.' },
  { value: 'IGNORE', label: 'Ignore', hint: 'Close the record as intentional; future detections create a fresh record.' },
];

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  MEDIUM: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  LOW: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function when(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function pretty(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function EmployeeSearch({ value, onPick }: { value: string | null; onPick: (employee: { id: string; employeeCode: string | null; fullName: string | null } | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; employeeCode: string | null; fullName: string | null }>>([]);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees', { params: { search: query.trim(), limit: 6 } });
        const list = data?.employees || data?.data || [];
        setResults(list.slice(0, 6));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employee by name or code…"
            className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 pl-8 pr-2 py-1.5"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => { onPick(null); setPickedLabel(null); }}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            clear
          </button>
        )}
      </div>
      {value && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Selected: {pickedLabel || value}
        </p>
      )}
      {results.map((employee) => (
        <button
          key={employee.id}
          type="button"
          onClick={() => {
            onPick(employee);
            setPickedLabel(`${employee.fullName || employee.employeeCode || employee.id}${employee.employeeCode ? ` (${employee.employeeCode})` : ''}`);
            setResults([]);
            setQuery('');
          }}
          className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#0058be] dark:text-blue-300"
        >
          {employee.fullName || 'Unnamed'} {employee.employeeCode ? `· ${employee.employeeCode}` : ''}
        </button>
      ))}
    </div>
  );
}

export function MismatchDetailDrawer({
  mismatchId,
  locationCode,
  onClose,
  onDecided,
}: {
  mismatchId: string | null;
  locationCode?: string;
  onClose: () => void;
  onDecided?: () => void;
}) {
  const [record, setRecord] = useState<MismatchRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ResolveResult | null>(null);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [action, setAction] = useState('RELINK');
  const [remark, setRemark] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [retirePreviousMapping, setRetirePreviousMapping] = useState(false);
  const [remapPastPunches, setRemapPastPunches] = useState(true);

  useEffect(() => {
    setRecord(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setRemark('');
    setEmployeeId(null);
    setEnrollmentNumber('');
    setSerialNumber('');
    setRetirePreviousMapping(false);
    setRemapPastPunches(true);
    if (!mismatchId) return;
    setAction('RELINK');
    setLoading(true);
    api
      .get(`/devices/mismatches/${mismatchId}`, { params: { locationCode } })
      .then(({ data }) => setRecord(data.mismatch))
      .catch((err: any) => setError(err?.response?.data?.error || 'Could not load this mismatch'))
      .finally(() => setLoading(false));
  }, [mismatchId, locationCode]);

  const isOpen = Boolean(record && record.status === 'OPEN');
  const activeAction = useMemo(() => ACTIONS.find((entry) => entry.value === action) ?? ACTIONS[0], [action]);

  const payload = useCallback(() => ({
    action,
    remark: remark.trim() || undefined,
    employeeId: employeeId || undefined,
    enrollmentNumber: enrollmentNumber.trim() || undefined,
    serialNumber: serialNumber.trim() || undefined,
    retirePreviousMapping,
    remapPastPunches,
    locationCode,
  }), [action, remark, employeeId, enrollmentNumber, serialNumber, retirePreviousMapping, remapPastPunches, locationCode]);

  const send = async (dryRun: boolean) => {
    if (!mismatchId) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/devices/mismatches/${mismatchId}/resolve`, { ...payload(), dryRun });
      if (dryRun) {
        setPreview(data);
        if (!data.ok) toast.error(data.message);
      } else {
        setResult(data);
        if (data.ok) {
          toast.success(data.message);
          if (data.record) setRecord(data.record);
          onDecided?.();
        } else {
          toast.error(data.message);
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data?.message || 'Resolution failed';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const decided = record ? record.status !== 'OPEN' : false;

  return (
    <Drawer open={Boolean(mismatchId)} onClose={onClose} title="Biometric mismatch" size="md">
      {loading && <p className="text-sm text-gray-500">Loading record…</p>}
      {!loading && error && !record && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {record && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_TONE[record.severity] || SEVERITY_TONE.LOW}`}>
              <AlertTriangle className="w-3 h-3" /> {record.severity}
            </span>
            <Badge variant={record.status === 'OPEN' ? 'warning' : record.status === 'RESOLVED' ? 'success' : 'gray'}>
              {record.status}
            </Badge>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{typeLabel(record.mismatchType)}</span>
            <span className="ml-auto text-xs text-gray-500">×{record.occurrenceCount}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase text-gray-400">Employee</p>
              <p className="text-gray-900 dark:text-white">{record.employeeName || 'unmapped'}</p>
              <p className="text-xs text-gray-500">{record.employeeCode || record.employeeId || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Biometric id</p>
              <p className="font-mono text-gray-900 dark:text-white">{record.biometricId || '—'}</p>
              <p className="text-xs text-gray-500">recorded via {record.detectedBy}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Terminal</p>
              <p className="text-gray-900 dark:text-white">{record.deviceName || 'unregistered'}</p>
              <p className="text-xs text-gray-500">{record.serialNumber || '—'} · {record.locationCode || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400">Location detail</p>
              <p className="text-gray-900 dark:text-white">{record.floorName || 'floor not set'} / {record.sectionName || 'section not set'}</p>
              <p className="text-xs text-gray-500">{record.punchTime ? `punch ${when(record.punchTime)}` : `first ${when(record.firstDetectedAt)} · last ${when(record.lastDetectedAt)}`}</p>
            </div>
          </div>

          {record.details && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200">
              {record.details}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-gray-400 mb-1">Expected</p>
              <pre className="text-xs whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-gray-900 p-3 max-h-52 overflow-y-auto">{pretty(record.expected)}</pre>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-400 mb-1">Received</p>
              <pre className="text-xs whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-gray-900 p-3 max-h-52 overflow-y-auto">{pretty(record.received)}</pre>
            </div>
          </div>

          {decided && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
              <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                {record.status === 'RESOLVED' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-gray-500" />}
                Decided {record.resolutionAction ? `via ${record.resolutionAction}` : ''} on {when(record.resolvedAt)}
              </p>
              {record.remark && <p className="text-xs text-gray-500 mt-1">Remark: {record.remark}</p>}
              <p className="text-xs text-gray-400 mt-1">Reopening is not supported; a recurring problem produces a new record.</p>
            </div>
          )}

          {isOpen && (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div>
                <label className="text-xs uppercase text-gray-400">Resolution</label>
                <select
                  value={action}
                  onChange={(event) => { setAction(event.target.value); setPreview(null); setResult(null); }}
                  className="mt-1 w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {ACTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">{activeAction.hint}</p>
              </div>

              {(action === 'RELINK' || action === 'EDIT_EMPLOYEE' || action === 'EDIT_BIOMETRIC_ID') && (
                <div className="space-y-2">
                  <EmployeeSearch value={employeeId} onPick={(employee) => setEmployeeId(employee?.id ?? null)} />
                  <label className="text-xs text-gray-500 block">Biometric id / enrollment number</label>
                  <input
                    value={enrollmentNumber}
                    onChange={(event) => setEnrollmentNumber(event.target.value)}
                    placeholder={record.biometricId || 'e.g. 200208'}
                    className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-1.5"
                  />
                </div>
              )}

              {(action === 'REASSIGN_DEVICE' || action === 'RESYNC_TO_DEVICE' || action === 'RESYNC_FROM_DEVICE') && (
                <div>
                  <label className="text-xs text-gray-500 block">Serial number (leave blank for the current terminal)</label>
                  <input
                    value={serialNumber}
                    onChange={(event) => setSerialNumber(event.target.value)}
                    placeholder={record.serialNumber || 'e.g. JNP2252300795'}
                    className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-1.5"
                  />
                </div>
              )}

              {(action === 'RELINK' || action === 'EDIT_EMPLOYEE' || action === 'EDIT_BIOMETRIC_ID') && (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={retirePreviousMapping} onChange={(event) => setRetirePreviousMapping(event.target.checked)} />
                  Revoke an existing mapping that already owns this id
                </label>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={remapPastPunches} onChange={(event) => setRemapPastPunches(event.target.checked)} />
                Re-attribute held punches where the change allows it
              </label>

              <div>
                <label className="text-xs text-gray-500 block">Remark (written to the immutable audit trail)</label>
                <textarea
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  rows={2}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-1.5"
                  placeholder="Why this decision is correct…"
                />
              </div>

              {preview && (
                <div className={`rounded-lg border p-3 text-sm ${preview.ok ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                  <p className="font-medium">{preview.message}</p>
                  {(preview.changes || []).map((change, index) => (
                    <p key={index} className="text-xs flex items-center gap-1 mt-1 text-gray-600 dark:text-gray-300">
                      {change.field}: <span className="line-through text-gray-400">{pretty(change.before)}</span>
                      <ArrowRight className="w-3 h-3" /> <span>{pretty(change.after)}</span>
                    </p>
                  ))}
                  {(preview.notes || []).map((note, index) => (
                    <p key={index} className="text-xs text-amber-700 dark:text-amber-300 mt-1">{note}</p>
                  ))}
                </div>
              )}

              {result && !preview && (
                <div className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                  {result.message}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void send(true)} loading={busy}>
                  Preview changes
                </Button>
                <Button className="bg-[#0058be] text-white" onClick={() => void send(false)} loading={busy}>
                  Apply {activeAction.label.toLowerCase()}
                </Button>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
