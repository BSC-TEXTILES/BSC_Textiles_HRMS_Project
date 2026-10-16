'use client';

/**
 * Organization Management — Hierarchy Dashboard
 *
 * Replaces the old static departments page with a live, DB-backed hierarchy
 * explorer. Uses the new `/organization/dashboard` and `/organization/hierarchy`
 * endpoints which compute all counts from real employee + attendance data.
 *
 * Features:
 *  - Location selector (All Locations + BEL / DAV / SHI / HUB)
 *  - Drill-down navigation: Location → Floor → Department → Section → Work Area
 *  - Back navigation preserving the selected location filter
 *  - "Data unavailable" indicator when attendance data is missing (never fabricated)
 *  - Live updates via Socket.IO `organization:changed` event
 *  - Employee assignment & transfer modals (approval workflow)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useOrganizationSocket } from '@/hooks/useOrganizationSocket';
import { CreateRequestModal } from './CreateRequestModal';

/* --------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------- */

type NodeLevel = 'location' | 'floor' | 'department' | 'section' | 'workarea';

interface HierarchyNode {
  id: string;
  name: string;
  code?: string;
  level: NodeLevel;
  parentId?: string;
  parentName?: string;
  status?: string;
  employeeCount?: number;
  attendanceToday?: number | null;
  children?: HierarchyNode[];
}

interface Breadcrumb {
  level: NodeLevel;
  id: string;
  name: string;
}

/* --------------------------------------------------------------------------------
 * Small presentational helpers
 * -------------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  icon,
  color = 'blue',
  unavailable,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
  unavailable?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  return (
    <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </div>
      </div>
      <div className="my-1">
        {unavailable ? (
          <div className="text-lg font-bold text-slate-400 dark:text-slate-500">Data unavailable</div>
        ) : (
          <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{value}</div>
        )}
        {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------
 * Main page
 * -------------------------------------------------------------------------------- */

export default function OrganizationHierarchyPage() {
  /* ---- data state ---- */
  const [dashboard, setDashboard] = useState<any>(null);
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  /* ---- navigation state ---- */
  const [selectedLocation, setSelectedLocation] = useState<string>(''); // '' = All Locations
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [activeLevel, setActiveLevel] = useState<NodeLevel>('location');

  /* ---- UI state ---- */
  const [liveUpdates, setLiveUpdates] = useState(true);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestModalType, setRequestModalType] = useState<'ASSIGN' | 'TRANSFER' | 'CREATE'>('CREATE');
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null);

  /* ---- socket ---- */
  const handleSocketChange = useCallback(() => {
    setLastSync(new Date());
    fetchAll();
  }, [selectedLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const { connected } = useOrganizationSocket({
    onChange: handleSocketChange,
    locationId: selectedLocation || undefined,
    enabled: liveUpdates,
  });

  /* ---- fetchers ---- */
  const fetchDashboard = useCallback(async () => {
    try {
      const qs = selectedLocation ? `?locationId=${selectedLocation}` : '';
      const res = await api.get(`/organization/dashboard${qs}`);
      setDashboard(res.data?.data ?? res.data);
    } catch (e: any) {
      console.error('Failed to load dashboard:', e);
    }
  }, [selectedLocation]);

  const fetchHierarchy = useCallback(async () => {
    try {
      const qs = selectedLocation ? `?locationId=${selectedLocation}` : '';
      const res = await api.get(`/organization/hierarchy${qs}`);
      const data = res.data?.data ?? res.data;
      setHierarchy(data?.locations ?? []);
    } catch (e: any) {
      console.error('Failed to load hierarchy:', e);
    }
  }, [selectedLocation]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchDashboard(), fetchHierarchy()]);
      setLastSync(new Date());
    } finally {
      setLoading(false);
    }
  }, [fetchDashboard, fetchHierarchy]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ---- navigation helpers ---- */
  const drillInto = useCallback((node: HierarchyNode) => {
    setSelectedNode(node);
    setBreadcrumbs((prev) => [...prev, { level: node.level, id: node.id, name: node.name }]);
    setActiveLevel(node.level);
  }, []);

  const navigateToBreadcrumb = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    if (index < 0) {
      setActiveLevel('location');
      setSelectedNode(null);
    } else {
      setActiveLevel(breadcrumbs[index]?.level ?? 'location');
      setSelectedNode(null);
    }
  }, [breadcrumbs]);

  const handleLocationSelect = useCallback((locId: string) => {
    setSelectedLocation(locId);
    setBreadcrumbs([]);
    setActiveLevel('location');
    setSelectedNode(null);
  }, []);

  /* ---- derived: children of the current drill-down node ---- */
  const currentChildren = useMemo<HierarchyNode[]>(() => {
    if (breadcrumbs.length === 0) {
      // Top level: show locations (or the single selected location's floors)
      if (selectedLocation) {
        const loc = hierarchy.find((l) => l.id === selectedLocation);
        return loc?.children ?? [];
      }
      return hierarchy;
    }
    // Walk the tree following breadcrumbs
    let nodes = hierarchy;
    let current: HierarchyNode | undefined;
    for (const crumb of breadcrumbs) {
      current = nodes.find((n) => n.id === crumb.id);
      if (!current) break;
      nodes = current.children ?? [];
    }
    return nodes;
  }, [hierarchy, breadcrumbs, selectedLocation]);

  /* ---- derived: dashboard scope label ---- */
  const scopeLabel = useMemo(() => {
    if (breadcrumbs.length > 0) return breadcrumbs[breadcrumbs.length - 1].name;
    if (selectedLocation) {
      const loc = hierarchy.find((l) => l.id === selectedLocation);
      return loc?.name ?? 'Selected Location';
    }
    return 'All Locations';
  }, [breadcrumbs, selectedLocation, hierarchy]);

  /* ---- level label helper ---- */
  const childLevelLabel = useMemo(() => {
    switch (activeLevel) {
      case 'location': return 'Floors';
      case 'floor': return 'Departments';
      case 'department': return 'Sections';
      case 'section': return 'Work Areas';
      default: return 'Items';
    }
  }, [activeLevel]);

  const childIcon = useMemo(() => {
    switch (activeLevel) {
      case 'location': return 'layers';
      case 'floor': return 'corporate_fare';
      case 'department': return 'account_tree';
      case 'section': return 'view_quilt';
      default: return 'grid_view';
    }
  }, [activeLevel]);

  /* ---- request modal ---- */
  const openRequestModal = useCallback((type: 'ASSIGN' | 'TRANSFER' | 'CREATE') => {
    setRequestModalType(type);
    setIsRequestModalOpen(true);
  }, []);

  /* ---- format helpers ---- */
  const fmtTime = (d: Date | null) => {
    if (!d) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  /* ---- location list for the selector ---- */
  const locationOptions = useMemo(() => hierarchy, [hierarchy]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] uppercase tracking-wider font-bold">
              <span>Organization Management</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#1346a1] dark:text-[#E8DCC6]">Hierarchy Dashboard</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#0b1c30] dark:text-white tracking-tight">
                Organization Hierarchy
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F8F4F1] dark:bg-slate-800 text-[#1346a1] dark:text-[#E8DCC6] text-[10px] font-bold uppercase tracking-wider border border-[#E5D5D7] dark:border-slate-700 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${connected && liveUpdates ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {connected && liveUpdates ? 'Live' : 'Static'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Store → Floor → Department → Section → Work Area. All counts are computed from live employee and attendance data.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live updates toggle */}
            <button
              onClick={() => setLiveUpdates((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                liveUpdates
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
              }`}
              title={liveUpdates ? 'Live updates enabled' : 'Live updates disabled'}
            >
              <span className="material-symbols-outlined text-[16px]">
                {liveUpdates ? 'sync' : 'sync_disabled'}
              </span>
              {liveUpdates ? 'Live Updates On' : 'Live Updates Off'}
            </button>

            {/* New request buttons */}
            <button
              onClick={() => openRequestModal('CREATE')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-md shadow-[#1346a1]/20 transition-all text-xs font-bold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Request</span>
            </button>
          </div>
        </div>

        {/* Last sync timestamp */}
        {lastSync && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            Last synchronized: {fmtTime(lastSync)}
          </div>
        )}

        {/* Breadcrumb navigation */}
        {breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap" aria-label="Hierarchy breadcrumb">
            <button
              onClick={() => { setBreadcrumbs([]); setActiveLevel('location'); setSelectedNode(null); }}
              className="hover:text-[#1346a1] dark:hover:text-[#E8DCC6] font-semibold transition-colors"
            >
              All Locations
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                <button
                  onClick={() => navigateToBreadcrumb(i)}
                  className={`hover:text-[#1346a1] dark:hover:text-[#E8DCC6] transition-colors ${
                    i === breadcrumbs.length - 1 ? 'text-[#1346a1] dark:text-[#E8DCC6] font-bold' : 'font-semibold'
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        {/* KPI cards */}
        {loading && !dashboard ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs animate-pulse h-[100px]" />
            ))}
          </div>
        ) : dashboard ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Locations"
              value={dashboard.totalLocations ?? 0}
              sub="Retail & Weaving Centers"
              icon="domain"
              color="blue"
            />
            <StatCard
              label="Total Employees"
              value={dashboard.totalEmployees ?? 0}
              sub="Across all active locations"
              icon="badge"
              color="emerald"
            />
            <StatCard
              label="Present Today"
              value={dashboard.presentToday ?? 0}
              sub={dashboard.attendanceAvailable ? 'Live attendance count' : 'Attendance data unavailable'}
              icon="how_to_reg"
              color={dashboard.attendanceAvailable ? 'emerald' : 'slate'}
              unavailable={!dashboard.attendanceAvailable}
            />
            <StatCard
              label="Pending Approvals"
              value={dashboard.pendingApprovals ?? 0}
              sub="Awaiting review"
              icon="pending_actions"
              color={dashboard.pendingApprovals > 0 ? 'amber' : 'slate'}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0e172a] p-6 rounded-xl border border-slate-200/80 dark:border-slate-800 text-center text-sm text-slate-500">
            Failed to load dashboard data. Please check your connection and try again.
          </div>
        )}

        {/* Location selector */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-[#0b1c30] dark:text-white">Location:</span>
            <div className="flex flex-wrap gap-2">
              {/* All Locations button */}
              <button
                onClick={() => handleLocationSelect('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  selectedLocation === ''
                    ? 'bg-[#1346a1] text-white border-[#1346a1] shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
                }`}
              >
                All Locations
              </button>
              {locationOptions.map((loc) => {
                const isSelected = selectedLocation === loc.id;
                return (
                  <button
                    key={loc.id}
                    onClick={() => handleLocationSelect(loc.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#1346a1] text-white border-[#1346a1] shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
                    }`}
                    title={loc.name}
                  >
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    {loc.code || loc.name}
                    {typeof loc.employeeCount === 'number' && (
                      <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        {loc.employeeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hierarchy grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#0b1c30] dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#1346a1] dark:text-[#E8DCC6]">{childIcon}</span>
              {childLevelLabel}
              <span className="text-[11px] font-normal text-slate-400">({currentChildren.length})</span>
            </h2>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">{scopeLabel}</span>
          </div>

          {loading && currentChildren.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs animate-pulse h-[120px]" />
              ))}
            </div>
          ) : currentChildren.length === 0 ? (
            <div className="bg-white dark:bg-[#0e172a] p-8 rounded-xl border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">folder_open</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">No {childLevelLabel.toLowerCase()} found for this selection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {currentChildren.map((node) => {
                const hasChildren = (node.children?.length ?? 0) > 0;
                const attAvailable = node.attendanceToday !== null && node.attendanceToday !== undefined;
                return (
                  <button
                    key={node.id}
                    onClick={() => drillInto(node)}
                    className="group text-left bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-[#1346a1]/60 dark:hover:border-[#E8DCC6]/60 hover:shadow-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1]"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-[#0b1c30] dark:text-white truncate">{node.name}</div>
                        {node.code && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{node.code}</div>
                        )}
                      </div>
                      {node.status && node.status !== 'ACTIVE' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                          {node.status}
                        </span>
                      )}
                      {hasChildren && (
                        <span className="material-symbols-outlined text-[18px] text-slate-300 dark:text-slate-600 group-hover:text-[#1346a1] dark:group-hover:text-[#E8DCC6] transition-colors ml-1">
                          chevron_right
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">badge</span>
                        {node.employeeCount ?? 0} employees
                      </span>
                      {activeLevel !== 'section' && activeLevel !== 'workarea' && (
                        <span className={`flex items-center gap-1 ${!attAvailable ? 'text-slate-400 dark:text-slate-500' : ''}`}>
                          <span className="material-symbols-outlined text-[14px]">how_to_reg</span>
                          {attAvailable ? `${node.attendanceToday} present` : 'Data unavailable'}
                        </span>
                      )}
                    </div>

                    {hasChildren && (
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-[#1346a1] dark:text-[#E8DCC6] font-semibold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        Drill down →
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        {dashboard?.recentActivity && dashboard.recentActivity.length > 0 && (
          <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <h3 className="text-sm font-bold text-[#0b1c30] dark:text-white flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-[#1346a1] dark:text-[#E8DCC6]">history</span>
              Recent Approved Changes
            </h3>
            <div className="space-y-2">
              {dashboard.recentActivity.slice(0, 5).map((item: any, i: number) => (
                <div key={item.id || i} className="flex items-center gap-3 text-xs py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                  <span className="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[#0b1c30] dark:text-white">{item.title || item.requestType}</span>
                    <span className="text-slate-400 dark:text-slate-500 ml-2">{item.requestedBy}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {item.appliedAt ? new Date(item.appliedAt).toLocaleDateString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create / Assign / Transfer modal */}
        {isRequestModalOpen && (
          <CreateRequestModal
            isOpen={isRequestModalOpen}
            mode={requestModalType}
            selectedLocation={selectedLocation}
            selectedNode={selectedNode}
            onClose={() => setIsRequestModalOpen(false)}
            onSuccess={() => {
              setIsRequestModalOpen(false);
              fetchAll();
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
