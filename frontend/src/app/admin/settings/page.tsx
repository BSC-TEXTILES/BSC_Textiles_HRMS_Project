'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { 
  Shield, Coffee, 
  Save, Lock, Users, Key, CheckCircle2, XCircle, AlertCircle, Eye, 
  Edit3, Plus, RefreshCw, ChevronRight, UserCheck, Search, Sparkles, 
  SlidersHorizontal, Layers, ShieldCheck, Check, ShieldQuestion, HelpCircle,
  FolderLock, UserCog, CheckSquare, Square
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useMyAccess, canEditModule, canViewModule, invalidateMyAccessCache, RBAC_MODULES, type RbacModule, type AccessLevel } from '@/lib/rbac';
import { CreateEditRoleModal, type RbacRole } from '../roles/components/CreateEditRoleModal';
import { AssignUserRoleModal } from '../roles/components/AssignUserRoleModal';
import { PermissionSummary } from '../roles/components/PermissionMatrix';

// System model categories for clean visual grouping
const MODULE_CATEGORY_INFO: Record<string, { group: string; color: string }> = {
  DASHBOARD: { group: 'Analytics & Executive', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  STORES: { group: 'Store Operations', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  USERS: { group: 'HR & Workforce', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SELLING_POINTS: { group: 'Store Operations', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  BILLING_TERMINALS: { group: 'Store Operations', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  STATUTORY_MUSTER: { group: 'Compliance & Statutory', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  ATTENDANCE_CORRECTIONS: { group: 'HR & Workforce', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  LATE_FINES: { group: 'HR & Workforce', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  DOCUMENT_MANAGEMENT: { group: 'Compliance & Statutory', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  SALARY_CADRES: { group: 'Payroll & Compensation', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  BIOMETRIC_POLICY: { group: 'Security & Biometric', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  BREAK_POLICIES: { group: 'Store Operations', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  ROLES_PERMISSIONS: { group: 'Security & Governance', color: 'bg-primary-50 text-primary-700 border-primary-200' },
  AUDIT_LOGS: { group: 'Security & Governance', color: 'bg-slate-100 text-slate-700 border-slate-300' },
};

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const access = useMyAccess();

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // RBAC State & Management
  const [rbacRoles, setRbacRoles] = useState<RbacRole[]>([]);
  const [rbacUsers, setRbacUsers] = useState<any[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [selectedUserForAccess, setSelectedUserForAccess] = useState<any>(null);
  const [userSelectedRoleIds, setUserSelectedRoleIds] = useState<string[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [moduleFilterGroup, setModuleFilterGroup] = useState<string>('ALL');
  const [savingUserRole, setSavingUserRole] = useState(false);

  // RBAC Modals
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const actorIsSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN';
  const canManageRoles = actorIsSuperAdmin || access.canManageRoles || access.source !== 'rbac';

  const [settings, setSettings] = useState({
    faceVerificationThreshold: 85,
    gracePeriodMinutes: 5,
    lateThresholdMinutes: 5,
    earlyLoginIncentiveEnabled: true,
    earlyLoginRatePerMinute: 1,
    earlyLoginRatePerSecond: 1,
    latePenaltyEnabled: true,
    latePenaltyRatePerMinute: 1,
    latePenaltyRatePerSecond: 1,
    maleLunchMinutes: 100,
    femaleLunchMinutes: 40,
    maleTeaMinutes: 20,
    femaleTeaMinutes: 15,
  });

  // Module-level RBAC: view hides a card entirely, view-only locks its inputs.
  const canSeeBiometric = canViewModule(access, 'BIOMETRIC_POLICY');
  const canSeeBreak = canViewModule(access, 'BREAK_POLICIES');
  const canSeeRoles = canViewModule(access, 'ROLES_PERMISSIONS');
  const canEditBiometric = canEditModule(access, 'BIOMETRIC_POLICY');
  const canEditBreak = canEditModule(access, 'BREAK_POLICIES');
  const canEditGeneral =
    (session?.user?.permissions || []).includes('CONFIGURE') ||
    (session?.user as any)?.role === 'SUPER_ADMIN' ||
    access.source !== 'rbac';

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      loadSettings(selectedLocation);
    }
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations/all');
      const locs = res.data || [];
      setLocations(locs);
      if (locs.length > 0) {
        setSelectedLocation(locs[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async (locId: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/settings?locationId=${locId}`);
      if (res.data?.settings) {
        const s = res.data.settings;
        setSettings({
          faceVerificationThreshold: s.faceVerificationThreshold ?? 85,
          gracePeriodMinutes: s.gracePeriodMinutes ?? 5,
          lateThresholdMinutes: s.lateThresholdMinutes ?? 5,
          earlyLoginIncentiveEnabled: s.earlyLoginIncentiveEnabled ?? true,
          earlyLoginRatePerMinute: Number(s.earlyLoginRatePerMinute ?? s.earlyLoginRatePerSecond ?? 1),
          earlyLoginRatePerSecond: Number(s.earlyLoginRatePerMinute ?? s.earlyLoginRatePerSecond ?? 1),
          latePenaltyEnabled: s.latePenaltyEnabled ?? true,
          latePenaltyRatePerMinute: Number(s.latePenaltyRatePerMinute ?? s.latePenaltyRatePerSecond ?? 1),
          latePenaltyRatePerSecond: Number(s.latePenaltyRatePerMinute ?? s.latePenaltyRatePerSecond ?? 1),
          maleLunchMinutes: s.maleLunchMinutes ?? 100,
          femaleLunchMinutes: s.femaleLunchMinutes ?? 40,
          maleTeaMinutes: s.maleTeaMinutes ?? 20,
          femaleTeaMinutes: s.femaleTeaMinutes ?? 15,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Load RBAC Roles and Users Data
  const loadRbacData = async () => {
    try {
      setRbacLoading(true);
      const [rolesRes, usersRes] = await Promise.all([
        api.get('/roles/rbac/roles'),
        api.get('/roles/rbac/users'),
      ]);
      const fetchedRoles = rolesRes.data?.roles || [];
      const fetchedUsers = usersRes.data?.users || [];
      setRbacRoles(fetchedRoles);
      setRbacUsers(fetchedUsers);

      // Auto-select first user if none currently selected
      if (fetchedUsers.length > 0) {
        setSelectedUserForAccess((prev: any) => {
          const user = prev ? fetchedUsers.find((u: any) => u.id === prev.id) || fetchedUsers[0] : fetchedUsers[0];
          setUserSelectedRoleIds(user.rbacRoles ? user.rbacRoles.map((r: any) => r.roleId) : []);
          return user;
        });
      }
    } catch (e) {
      console.error('Failed to load RBAC data in settings:', e);
    } finally {
      setRbacLoading(false);
    }
  };

  useEffect(() => {
    loadRbacData();
  }, []);

  const selectUser = (u: any) => {
    setSelectedUserForAccess(u);
    setUserSelectedRoleIds(u.rbacRoles ? u.rbacRoles.map((r: any) => r.roleId) : []);
  };

  const toggleUserRole = (roleId: string) => {
    setUserSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSaveUserAccess = async () => {
    if (!selectedUserForAccess) return;
    try {
      setSavingUserRole(true);
      await api.put(`/roles/rbac/users/${selectedUserForAccess.id}/roles`, {
        roleIds: userSelectedRoleIds,
      });
      invalidateMyAccessCache();
      toast.success(`Role & module access updated for ${selectedUserForAccess.fullName || selectedUserForAccess.email}!`);
      loadRbacData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update user roles');
    } finally {
      setSavingUserRole(false);
    }
  };

  // Compute live effective module access across all 15 models for selected user
  const effectiveUserAccess = useMemo(() => {
    const map: Record<string, AccessLevel> = {};
    for (const m of RBAC_MODULES) map[m.key] = 'none';

    if (!selectedUserForAccess) return map;

    // Super Admin gets Edit across all 15 modules
    const hasSuperAdmin =
      selectedUserForAccess.role === 'SUPER_ADMIN' ||
      userSelectedRoleIds.some((rid) => rbacRoles.find((r) => r.id === rid)?.name === 'SUPER_ADMIN');

    if (hasSuperAdmin) {
      for (const m of RBAC_MODULES) map[m.key] = 'edit';
      return map;
    }

    // Combine permissions of all selected roles (edit > view > none)
    for (const roleId of userSelectedRoleIds) {
      const r = rbacRoles.find((role) => role.id === roleId);
      if (!r || !r.permissions) continue;
      for (const m of RBAC_MODULES) {
        const currentLevel = map[m.key] || 'none';
        const roleLevel = r.permissions[m.key] || 'none';
        if (roleLevel === 'edit' || currentLevel === 'edit') {
          map[m.key] = 'edit';
        } else if (roleLevel === 'view' || currentLevel === 'view') {
          map[m.key] = 'view';
        }
      }
    }

    return map;
  }, [selectedUserForAccess, userSelectedRoleIds, rbacRoles]);

  // Counts of effective access for the selected user
  const effectiveCounts = useMemo(() => {
    const counts = { edit: 0, view: 0, none: 0 };
    for (const m of RBAC_MODULES) {
      const level = effectiveUserAccess[m.key] || 'none';
      counts[level]++;
    }
    return counts;
  }, [effectiveUserAccess]);

  const filteredUsers = useMemo(() => {
    if (!userSearchTerm.trim()) return rbacUsers;
    const q = userSearchTerm.toLowerCase();
    return rbacUsers.filter(
      (u) =>
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q))
    );
  }, [rbacUsers, userSearchTerm]);

  const filteredModules = useMemo(() => {
    if (moduleFilterGroup === 'ALL') return RBAC_MODULES;
    return RBAC_MODULES.filter((m) => MODULE_CATEGORY_INFO[m.key]?.group === moduleFilterGroup);
  }, [moduleFilterGroup]);

  const moduleGroups = useMemo(() => {
    const set = new Set<string>();
    RBAC_MODULES.forEach((m) => {
      const info = MODULE_CATEGORY_INFO[m.key];
      if (info) set.add(info.group);
    });
    return Array.from(set);
  }, []);

  const restrictedByRbac = access.source === 'rbac';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      // RBAC-restricted users only submit the field groups they may edit;
      // the backend preserves the values of everything else.
      const payload: Record<string, unknown> = { locationId: selectedLocation };
      if (!restrictedByRbac) {
        Object.assign(payload, settings);
      } else {
        if (canEditBiometric) payload.faceVerificationThreshold = settings.faceVerificationThreshold;
        if (canEditBreak) {
          payload.maleLunchMinutes = settings.maleLunchMinutes;
          payload.femaleLunchMinutes = settings.femaleLunchMinutes;
          payload.maleTeaMinutes = settings.maleTeaMinutes;
          payload.femaleTeaMinutes = settings.femaleTeaMinutes;
        }
        if (canEditGeneral) {
          payload.gracePeriodMinutes = settings.gracePeriodMinutes;
          payload.lateThresholdMinutes = settings.lateThresholdMinutes;
          payload.earlyLoginIncentiveEnabled = settings.earlyLoginIncentiveEnabled;
          payload.earlyLoginRatePerMinute = settings.earlyLoginRatePerMinute;
          payload.earlyLoginRatePerSecond = settings.earlyLoginRatePerMinute;
          payload.latePenaltyEnabled = settings.latePenaltyEnabled;
          payload.latePenaltyRatePerMinute = settings.latePenaltyRatePerSecond;
          payload.latePenaltyRatePerSecond = settings.latePenaltyRatePerSecond;
        }
      }
      await api.put('/settings', payload);
      toast.success('Admin Control Center settings saved successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const readOnlyBadge = (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
      <Lock className="w-3 h-3" /> READ-ONLY
    </span>
  );

  const renderRestrictedCard = (title: string, description: string, Icon: typeof Shield) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 opacity-70">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <Lock className="w-5 h-5 text-gray-400" />
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">{title} 🔒</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
        <Icon className="w-4 h-4 text-gray-400" />
        <span>This section is restricted by your role. Contact an administrator if you need access.</span>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
            <p className="text-sm text-gray-500 mt-1">
              Global system configuration, biometric thresholds, and break rules
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white font-medium"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
              ))}
            </select>
          </div>
        </div>

        {restrictedByRbac && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <Lock className="w-4 h-4 shrink-0" />
            Your role applies module-level restrictions: locked sections are read-only and hidden sections are not
            accessible to you.
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Card 1: Face Verification Threshold */}
          {canSeeBiometric ? (
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${canEditBiometric ? '' : 'opacity-80'}`}>
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-primary-600" />
                  <div>
                    <h3 className="font-bold text-gray-900">Biometric Face Verification Threshold</h3>
                    <p className="text-xs text-gray-500">Security threshold required for automatic verification approval</p>
                  </div>
                </div>
                {!canEditBiometric && readOnlyBadge}
              </div>

              <div className="mt-6 max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700">Minimum Match Confidence</label>
                  <span className="text-sm font-mono font-bold text-primary-700">{settings.faceVerificationThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="99"
                  disabled={!canEditBiometric}
                  value={settings.faceVerificationThreshold}
                  onChange={(e) => setSettings({ ...settings, faceVerificationThreshold: Number(e.target.value) })}
                  className="w-full accent-primary-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-[11px] text-gray-500 mt-2">
                  Face scans yielding confidence scores equal or above {settings.faceVerificationThreshold}% are marked VERIFIED. Any scan below this threshold is rejected as FAILED.
                </p>
              </div>
            </div>
          ) : (
            renderRestrictedCard('Biometric Face Verification Threshold', 'Minimum match confidence settings', Shield)
          )}

          {/* Card 2: Break Allowances */}
          {canSeeBreak ? (
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${canEditBreak ? '' : 'opacity-80'}`}>
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Coffee className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="font-bold text-gray-900">Break Duration Policies</h3>
                    <p className="text-xs text-gray-500">Standard allowances stored in database policy records</p>
                  </div>
                </div>
                {!canEditBreak && readOnlyBadge}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Male Group Lunch (Minutes)</label>
                  <input
                    type="number"
                    disabled={!canEditBreak}
                    value={settings.maleLunchMinutes}
                    onChange={(e) => setSettings({ ...settings, maleLunchMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Female Group Lunch (Minutes)</label>
                  <input
                    type="number"
                    disabled={!canEditBreak}
                    value={settings.femaleLunchMinutes}
                    onChange={(e) => setSettings({ ...settings, femaleLunchMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Male Group Tea (Minutes)</label>
                  <input
                    type="number"
                    disabled={!canEditBreak}
                    value={settings.maleTeaMinutes}
                    onChange={(e) => setSettings({ ...settings, maleTeaMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Female Group Tea (Minutes)</label>
                  <input
                    type="number"
                    disabled={!canEditBreak}
                    value={settings.femaleTeaMinutes}
                    onChange={(e) => setSettings({ ...settings, femaleTeaMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            renderRestrictedCard('Break Duration Policies', 'Male / Female lunch & tea allowances', Coffee)
          )}

          {/* Card 4: Roles & System Module Access Controller (15 Operational Models) */}
          {canSeeRoles ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-900 text-lg">Roles & System Module Access Controller</h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-50 text-primary-700 border border-primary-200">
                        <Layers className="w-3.5 h-3.5" /> 15 System Models
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <Key className="w-3.5 h-3.5" /> {rbacRoles.length} Roles
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Users className="w-3.5 h-3.5" /> {rbacUsers.length} Staff Mapped
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Control granular user privileges and edit/view access across all 15 core operational modules of the HRMS
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={loadRbacData}
                    disabled={rbacLoading}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
                    title="Refresh Roles & Users"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rbacLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>

                  {canManageRoles && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRole(null);
                          setRoleModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create New Role
                      </button>

                      <button
                        type="button"
                        onClick={() => setAssignModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary-300 text-primary-700 bg-primary-50 hover:bg-primary-100 flex items-center gap-1.5 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Assign Role Modal
                      </button>
                    </>
                  )}

                  <Link
                    href="/admin/roles"
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1 transition-colors"
                  >
                    Full Matrix <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* Interactive Workbench: 2-Column Split (Left: Staff Directory, Right: Live Access Controller) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Staff Selector */}
                <div className="lg:col-span-5 border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary-600" /> Select Staff Member
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {filteredUsers.length} staff
                    </span>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search by name, email, or role..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* User List */}
                  <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                    {filteredUsers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-500 bg-white rounded-lg border border-gray-100">
                        No staff members found matching query.
                      </div>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelected = selectedUserForAccess?.id === u.id;
                        const roleCount = u.rbacRoles?.length || 0;
                        return (
                          <div
                            key={u.id}
                            onClick={() => selectUser(u)}
                            className={`p-3 rounded-lg border transition-all cursor-pointer text-left flex items-start justify-between gap-2 ${
                              isSelected
                                ? 'bg-primary-50/80 border-primary-500 shadow-sm ring-1 ring-primary-500'
                                : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-gray-900 truncate">
                                  {u.fullName || 'Unnamed Employee'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-gray-100 text-gray-600">
                                  {u.role}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">{u.email}</p>
                              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                {u.rbacRoles && u.rbacRoles.length > 0 ? (
                                  u.rbacRoles.map((r: any) => (
                                    <span
                                      key={r.roleId}
                                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                                    >
                                      {r.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">No custom RBAC roles</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 pt-0.5">
                              {isSelected ? (
                                <CheckCircle2 className="w-4 h-4 text-primary-600" />
                              ) : (
                                <span className="w-4 h-4 rounded-full border border-gray-300 block" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Live Access Controller & Model Matrix */}
                <div className="lg:col-span-7 border border-gray-200 rounded-xl p-5 bg-white space-y-5 flex flex-col justify-between">
                  {selectedUserForAccess ? (
                    <div className="space-y-5">
                      {/* Selected user card & action button */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-gray-50 via-slate-50 to-primary-50/30 border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900 text-sm">
                              {selectedUserForAccess.fullName || 'Unnamed Staff'}
                            </h4>
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-white border border-gray-200 text-gray-700">
                              {selectedUserForAccess.role}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{selectedUserForAccess.email}</p>
                        </div>

                        {canManageRoles && (
                          <button
                            type="button"
                            onClick={handleSaveUserAccess}
                            disabled={savingUserRole}
                            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-1.5 px-4 rounded-lg shadow-sm text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {savingUserRole ? 'Saving...' : 'Save User Access'}
                          </button>
                        )}
                      </div>

                      {/* Role Checkboxes for this user */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-primary-600" /> Grant / Revoke Assigned Roles
                          </label>
                          <span className="text-[11px] text-gray-500">
                            {userSelectedRoleIds.length} roles active
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {rbacRoles.map((role) => {
                            const isChecked = userSelectedRoleIds.includes(role.id);
                            return (
                              <label
                                key={role.id}
                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-purple-50/70 border-purple-300 text-purple-950 font-medium'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!canManageRoles}
                                  checked={isChecked}
                                  onChange={() => toggleUserRole(role.id)}
                                  className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold truncate">{role.name}</span>
                                    {role.isSystem && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-gray-100 text-gray-600 font-mono">
                                        SYSTEM
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
                                    {role.description || 'Configured access role'}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live Effective Model Access Status */}
                      <div className="space-y-3 pt-2 border-t border-gray-100">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <h5 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                              Live Effective Access (15 System Models)
                            </h5>
                            <p className="text-[11px] text-gray-500">
                              Resolved from all assigned roles (Full Edit &gt; View Only &gt; No Access)
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {effectiveCounts.edit} Edit
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              {effectiveCounts.view} View
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                              {effectiveCounts.none} None
                            </span>
                          </div>
                        </div>

                        {/* Category filter pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setModuleFilterGroup('ALL')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                              moduleFilterGroup === 'ALL'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            All (15)
                          </button>
                          {moduleGroups.map((grp) => (
                            <button
                              key={grp}
                              type="button"
                              onClick={() => setModuleFilterGroup(grp)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                                moduleFilterGroup === grp
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {grp}
                            </button>
                          ))}
                        </div>

                        {/* 15 Models Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                          {filteredModules.map((m) => {
                            const level = effectiveUserAccess[m.key] || 'none';
                            const category = MODULE_CATEGORY_INFO[m.key];
                            return (
                              <div
                                key={m.key}
                                className="p-2.5 rounded-lg border border-gray-100 bg-gray-50/60 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-xs text-gray-900 truncate">
                                      {m.label}
                                    </span>
                                  </div>
                                  <span
                                    className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-medium border mt-0.5 ${
                                      category ? category.color : 'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}
                                  >
                                    {category?.group || 'System'}
                                  </span>
                                </div>

                                <div className="shrink-0">
                                  {level === 'edit' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3" /> FULL EDIT
                                    </span>
                                  )}
                                  {level === 'view' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                      <Eye className="w-3 h-3" /> VIEW ONLY
                                    </span>
                                  )}
                                  {level === 'none' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                                      <XCircle className="w-3 h-3" /> NO ACCESS
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-sm text-gray-500">
                      Select a staff member from the left directory to inspect and assign role access.
                    </div>
                  )}
                </div>
              </div>

              {/* Configured Roles Overview Table */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary-600" />
                      Configured System Roles & Module Matrix
                    </h4>
                    <p className="text-xs text-gray-500">
                      Overview of role permission presets applied across the organization
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3">Role Name</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-center">Assigned Staff</th>
                        <th className="px-4 py-3">Permission Breakdown (15 Models)</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rbacRoles.map((role) => (
                        <tr key={role.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{role.name}</span>
                              {role.isSystem && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-gray-100 text-gray-600 border border-gray-200">
                                  SYSTEM
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                            {role.description || '—'}
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-gray-700">
                            {role.userCount || 0}
                          </td>
                          <td className="px-4 py-3">
                            <PermissionSummary modules={RBAC_MODULES} value={role.permissions} />
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {canManageRoles ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRole(role);
                                  setRoleModalOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded text-primary-600 hover:bg-primary-50 border border-primary-200 transition-colors"
                              >
                                Edit Matrix
                              </button>
                            ) : (
                              <span className="text-[11px] text-gray-400">Read-only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            renderRestrictedCard(
              'Roles & System Module Access Controller',
              'Access controller across all 15 operational business models',
              ShieldCheck
            )
          )}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving || loading || (restrictedByRbac && !canEditBiometric && !canEditBreak && !canEditGeneral)}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 px-6 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save All Settings'}
            </button>
          </div>
        </form>

        {/* Create / Edit Role Modal */}
        <CreateEditRoleModal
          open={roleModalOpen}
          role={editingRole}
          modules={RBAC_MODULES}
          onClose={() => {
            setRoleModalOpen(false);
            setEditingRole(null);
          }}
          onSaved={loadRbacData}
        />

        {/* Assign User Role Modal */}
        <AssignUserRoleModal
          open={assignModalOpen}
          roles={rbacRoles}
          actorIsSuperAdmin={actorIsSuperAdmin}
          onClose={() => setAssignModalOpen(false)}
          onSaved={loadRbacData}
        />
      </div>
    </DashboardLayout>
  );
}
