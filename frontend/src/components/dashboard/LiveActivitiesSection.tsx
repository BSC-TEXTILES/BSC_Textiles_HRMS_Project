'use client';

/**
 * Live Activities — the real-time workforce feed below the executive calendar.
 *
 * Replaces the previous session-only strip, which generated ids with
 * `Date.now()+Math.random()`, kept eight items in memory, and re-added every
 * event it received again after a reconnect. Here the server supplies a
 * deterministic `dedupeKey` per event, so the merge below is idempotent and a
 * dropped socket cannot produce duplicates.
 *
 * Transport: the socket already owned by NotificationContext (a second
 * connection would be a second thing to leak on unmount). If it is not
 * connected, a 12-second poll takes over, and the header says which one is
 * active rather than pretending to be live.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotifications } from '@/context/NotificationContext';
import api from '@/lib/api';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';

export interface LiveEvent {
  id: string;
  dedupeKey: string;
  type: string;
  category: string;
  status: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  departmentId: string | null;
  locationId: string | null;
  occurredAt: string | null;
  businessDate: string;
  actionUrl: string | null;
  payload: Record<string, any>;
}

export interface LiveSummary {
  businessDate: string;
  arrivals: { total: number; onTime: number; late: number };
  presence: { present: number; absent: number; onLeave: number; weeklyOff: number; totalEmployees: number };
  assignments: { assigned: number; unassigned: number };
  overtime: { people: number; hours: number };
  missedPunches: number;
  incorrectPunches: number;
  lateArrivals: number;
  finesToday: number;
  lastEventAt: string | null;
  permissions: { canRegularize: boolean; canWaiveFine: boolean; canApproveOvertime: boolean; canRemark: boolean };
}

const TYPE_GROUPS: { value: string; label: string; types: string[] }[] = [
  { value: 'all', label: 'All activity', types: [] },
  { value: 'attendance', label: 'Punches', types: ['punch_in', 'punch_out'] },
  { value: 'exceptions', label: 'Exceptions', types: ['missed_in', 'missed_out', 'mismatch'] },
  { value: 'fines', label: 'Late & fines', types: ['late_arrival', 'early_departure'] },
  { value: 'overtime', label: 'Overtime', types: ['overtime_start', 'overtime_end'] },
  { value: 'leave', label: 'Leave & absence', types: ['leave', 'absence'] },
  { value: 'assignments', label: 'Assignments', types: ['assignment', 'shift_change'] },
  { value: 'corrections', label: 'Corrections', types: ['correction'] },
];

const ICONS: Record<string, string> = {
  punch_in: 'login', punch_out: 'logout', missed_in: 'alarm_off', missed_out: 'alarm_off',
  mismatch: 'report', late_arrival: 'schedule', early_departure: 'exit_to_app',
  assignment: 'assignment_ind', shift_change: 'swap_horiz', overtime_start: 'timer',
  overtime_end: 'timer_off', leave: 'beach_access', absence: 'person_off', correction: 'edit_note',
};

const TONE: Record<string, string> = {
  INFO: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  LOW: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  MEDIUM: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  HIGH: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  CRITICAL: 'bg-rose-600 text-white dark:bg-rose-600',
};

const POLL_MS = 12_000;
/** Events newer than this get the entry highlight, then it stops. */
const NEW_WINDOW_MS = 15_000;

function timeOfDay(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

export function LiveActivitiesSection({ selectedDate }: { selectedDate?: string }) {
  const { socket } = useNotifications();
  const [date, setDate] = useState<string>(selectedDate || '');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [department, setDepartment] = useState('all');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<LiveEvent | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  const socketUp = Boolean(socket?.connected);
  const requestIdRef = useRef(0);
  // Debounce the search box; typing must not fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    const group = TYPE_GROUPS.find((g) => g.value === typeFilter);
    if (group?.types.length) params.set('types', group.types.join(','));
    if (department !== 'all') params.set('departments', department);
    if (debouncedSearch) params.set('search', debouncedSearch);
    return params;
  }, [date, typeFilter, department, debouncedSearch]);

  const refresh = useCallback(async () => {
    const myRequest = ++requestIdRef.current;
    try {
      const [eventsRes, summaryRes] = await Promise.all([
        api.get(`/live-activities/events?${query.toString()}&limit=50`),
        api.get(`/live-activities/summary?${new URLSearchParams(date ? { date } : {}).toString()}`),
      ]);
      if (myRequest !== requestIdRef.current) return; // a newer response landed

      const incoming: LiveEvent[] = eventsRes.data?.events || [];
      setSummary(summaryRes.data || null);
      setCursor(eventsRes.data?.nextCursor || null);
      setHasMore(Boolean(eventsRes.data?.hasMore));
      setError(null);
      setLastSync(new Date().toISOString());

      // Idempotent merge keyed on dedupeKey: reconnects, polls and socket pushes
      // for the same occurrence collapse to one row.
      setEvents((previous) => {
        const byKey = new Map(previous.map((e) => [e.dedupeKey, e]));
        const freshKeys = new Set<string>();
        for (const event of incoming) {
          if (!byKey.has(event.dedupeKey)) freshKeys.add(event.dedupeKey);
          byKey.set(event.dedupeKey, event);
        }
        const merged = Array.from(byKey.values()).sort(
          (a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime()
        );
        if (freshKeys.size) {
          setFlash((current) => {
            const next = new Set(current);
            freshKeys.forEach((k) => next.add(k));
            return next;
          });
        }
        return merged;
      });
    } catch (err: any) {
      if (myRequest !== requestIdRef.current) return;
      setError(err?.response?.data?.message || 'Could not load live activities.');
    } finally {
      if (myRequest === requestIdRef.current) setLoading(false);
    }
  }, [query, date]);

  // Initial + filter-driven load.
  useEffect(() => {
    setLoading(true);
    setEvents([]);
    refresh();
  }, [refresh]);

  // Poll only while the socket is down; otherwise the socket is the push
  // channel and a 12s poll would be duplicate traffic for no benefit.
  useEffect(() => {
    if (socketUp) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [socketUp, refresh]);

  // Live push. `live:activity` carries one event; `live:activity:bulk` would be
  // a future optimisation, so the single-event shape is the contract here.
  useEffect(() => {
    if (!socket) return;
    const onActivity = (payload: any) => {
      const event: LiveEvent | undefined = payload?.event || payload;
      if (!event?.dedupeKey) return;
      setEvents((previous) => {
        if (previous.some((e) => e.dedupeKey === event.dedupeKey)) return previous;
        return [event, ...previous];
      });
      setFlash((current) => new Set(current).add(event.dedupeKey));
      setLastSync(new Date().toISOString());
    };
    socket.on('live:activity', onActivity);
    return () => {
      socket.off('live:activity', onActivity);
    };
  }, [socket]);

  // The highlight is transient; clear it so old rows stop shimmering.
  useEffect(() => {
    if (!flash.size) return;
    const timer = setTimeout(() => setFlash(new Set()), NEW_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    api.get('/live-activities/filters')
      .then((res) => setDepartments(res.data?.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await api.get(`/live-activities/events?${query.toString()}&limit=50&cursor=${encodeURIComponent(cursor)}`);
      const older: LiveEvent[] = res.data?.events || [];
      setEvents((previous) => {
        const seen = new Set(previous.map((e) => e.dedupeKey));
        return [...previous, ...older.filter((e) => !seen.has(e.dedupeKey))];
      });
      setCursor(res.data?.nextCursor || null);
      setHasMore(Boolean(res.data?.hasMore));
    } finally {
      setLoadingMore(false);
    }
  };

  const tiles = summary
    ? [
        { label: 'Arrived', value: summary.arrivals.total, sub: `${summary.arrivals.onTime} on time · ${summary.arrivals.late} late`, icon: 'groups' },
        { label: 'Present now', value: summary.presence.present, sub: `of ${summary.presence.totalEmployees} on roster`, icon: 'badge' },
        { label: 'Absent', value: summary.presence.absent, sub: `${summary.presence.onLeave} on leave`, icon: 'person_off' },
        { label: 'Assigned', value: summary.assignments.assigned, sub: `${summary.assignments.unassigned} unassigned`, icon: 'assignment_ind' },
        { label: 'Overtime', value: summary.overtime.people, sub: `${summary.overtime.hours} h today`, icon: 'timer' },
        { label: 'Missed punches', value: summary.missedPunches, sub: 'no in or out', icon: 'alarm_off' },
        { label: 'Incorrect punches', value: summary.incorrectPunches, sub: 'needs review', icon: 'report' },
        { label: 'Late fines today', value: `₹${summary.finesToday}`, sub: `${summary.lateArrivals} late arrivals`, icon: 'payments' },
      ]
    : [];

  return (
    <section
      aria-label="Live activities"
      className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden"
    >
      {/* Header: title, connection truth, date, manual refresh */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">bolt</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">Live Activities</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {socketUp ? 'Streaming' : 'Polling every 12s'}
              {lastSync ? ` · updated ${timeOfDay(lastSync)}` : ''}
            </p>
          </div>
          <span
            className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
              socketUp
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
            title={socketUp ? 'WebSocket connected' : 'WebSocket down — falling back to polling'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${socketUp ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {socketUp ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="sr-only" htmlFor="live-activity-date">Activity date</label>
          <input
            id="live-activity-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1526] text-[#0b1c30] dark:text-slate-100"
          />
          <button
            type="button"
            onClick={refresh}
            className="h-8 px-3 text-xs font-semibold text-[#0058be] dark:text-blue-400 bg-[#eff4ff] dark:bg-blue-950/60 hover:bg-[#dce9ff] dark:hover:bg-blue-900/60 rounded-lg transition-colors border border-[#dce9ff] dark:border-blue-900/50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-px bg-slate-100 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-white dark:bg-[#0e172a] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <span className="material-symbols-outlined text-[13px]">{tile.icon}</span>
              <span className="truncate">{tile.label}</span>
            </div>
            <div className="text-lg font-bold text-[#0b1c30] dark:text-slate-100 tabular-nums">
              {loading && !summary ? <span className="text-slate-300">—</span> : tile.value}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400">search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, code or activity…"
            aria-label="Search activities"
            className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1526] text-[#0b1c30] dark:text-slate-100"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by event type"
          className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1526] text-[#0b1c30] dark:text-slate-100"
        >
          {TYPE_GROUPS.map((group) => (
            <option key={group.value} value={group.value}>{group.label}</option>
          ))}
        </select>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Filter by department"
          className="h-8 px-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1526] text-[#0b1c30] dark:text-slate-100"
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" className="px-4 py-3 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[15px]">error</span>
            {error}
          </span>
          <button type="button" onClick={refresh} className="font-semibold underline">Retry</button>
        </div>
      )}

      {/* Feed */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
        {loading && !events.length ? (
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="p-3 flex items-center gap-3 animate-pulse">
              <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <span className="flex-1 space-y-2">
                <span className="block h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
                <span className="block h-2.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
              </span>
            </li>
          ))
        ) : !events.length ? (
          <li className="p-8 text-center">
            <span className="material-symbols-outlined text-[28px] text-slate-300 dark:text-slate-600">inbox</span>
            <p className="text-sm font-semibold text-[#0b1c30] dark:text-slate-200 mt-1">Nothing recorded for this day yet</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {date && date !== summary?.businessDate ? 'Try another date or clear the filters.' : 'Punches, exceptions and assignments appear here as they happen.'}
            </p>
          </li>
        ) : (
          events.map((event) => (
            <li key={event.dedupeKey}>
              <button
                type="button"
                onClick={() => setOpenEvent(event)}
                aria-label={`Open details for ${event.summary}`}
                className={`w-full text-left px-3 sm:px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                  flash.has(event.dedupeKey) ? 'bg-[#eff4ff] dark:bg-blue-950/40' : ''
                }`}
              >
                <span className={`shrink-0 w-8 h-8 rounded-lg grid place-items-center ${TONE[event.severity] || TONE.INFO}`}>
                  <span className="material-symbols-outlined text-[16px]">{ICONS[event.type] || 'notifications'}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[#0b1c30] dark:text-slate-100 truncate">{event.summary}</span>
                  <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    {[event.employeeCode, event.type.replace(/_/g, ' '), event.status !== 'OPEN' ? event.status.toLowerCase().replace(/_/g, ' ') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{timeOfDay(event.occurredAt)}</span>
                  <span className="block text-[10px] text-[#0058be] dark:text-blue-400 font-medium">Open</span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      {hasMore && (
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="text-xs font-semibold text-[#0058be] dark:text-blue-400 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load earlier activity'}
          </button>
        </div>
      )}

      <ActivityDetailDrawer
        event={openEvent}
        onClose={() => setOpenEvent(null)}
        permissions={summary?.permissions}
        onDecided={(updated) => {
          if (!updated) return;
          setEvents((previous) => previous.map((e) => (e.dedupeKey === updated.dedupeKey ? { ...e, ...updated } : e)));
          setOpenEvent((current) => (current && current.dedupeKey === updated.dedupeKey ? { ...current, ...updated } : current));
        }}
      />
    </section>
  );
}

export default LiveActivitiesSection;
