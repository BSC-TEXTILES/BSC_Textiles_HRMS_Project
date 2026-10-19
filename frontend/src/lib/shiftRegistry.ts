/**
 * Shared Shift Registry (Single Source of Truth)
 * Standardizes shift options across Executive Dashboard, Floor Shifts & Rosters,
 * Governance Reports, Late & Fine Management, and all other modules with a shift dropdown.
 */

import { SHIFT_I_LABEL } from '@/config/shiftPolicyConfig';
import { formatPunchTime12 } from './shiftHelpers';

export type ShiftType = 'default' | 'custom';

export interface Shift {
  id: string;                // Unique stable ID (MANDATORY for safe global deletion & sync)
  name: string;              // Original user-entered shift name (PRESERVE EXACTLY as entered)
  displayName?: string;      // Computed display name (for rendering only)
  label?: string;            // Optional display label (fallback to name)
  type: ShiftType;           // 'default' | 'custom'
  isCustom: boolean;         // true ONLY for user-created custom shifts
  isDeletable: boolean;      // true ONLY when type === 'custom'
  createdAt?: string | Date; // For traceability (optional)
  createdBy?: string;        // Optional (if user context exists)
}

export interface ShiftRegistryItem extends Shift {
  shiftId: string; // Alias to id for backward compatibility
  code?: string;
  locationId?: string;
  allLocationIds?: string[];
  punchIn: string; // 24-hr time e.g. "10:00"
  punchOut: string; // 24-hr time e.g. "21:30"
  punchInDisplay: string; // 12-hr time e.g. "10:00 AM"
  punchOutDisplay: string; // 12-hr time e.g. "9:30 PM"
  timeRange: string; // e.g. "10:00 AM – 9:30 PM"
  startTime?: string | Date;
  endTime?: string | Date;
  lunchMinutes: number; // Stored in minutes
  lunchDurationMinutes: number; // Stored in minutes
  teaMinutes: number; // Stored in minutes. 0 means "No Tea Break"
  teaDurationMinutes: number; // Stored in minutes
  teaSlot: 'None' | 'Morning' | 'Evening';
  teaBreakSlot?: string;
  status: 'Active' | 'Legacy' | 'Archived';
  source: 'Seed' | 'Custom' | 'Legacy';
  staffCount: number;
  noRosterInHub?: boolean;
}

export const SHIFTS_CHANGED_EVENT = 'bsc:shifts-changed';

/**
 * Dispatch cross-component and cross-tab event to notify all dropdowns
 * that a custom shift was created or updated.
 */
export function notifyShiftsChanged(createdShift?: any) {
  clearShiftRegistryCache();
  if (typeof window !== 'undefined') {
    if (createdShift) {
      try {
        const stored = JSON.parse(localStorage.getItem('bsc_custom_shifts') || '[]');
        if (!stored.some((s: any) => s.id === createdShift.id || (s.name && s.name.toLowerCase() === createdShift.name.toLowerCase()))) {
          stored.push(createdShift);
          localStorage.setItem('bsc_custom_shifts', JSON.stringify(stored));
        }
      } catch {}
    }
    window.dispatchEvent(
      new CustomEvent(SHIFTS_CHANGED_EVENT, { detail: createdShift })
    );
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('bsc_shifts_channel');
        bc.postMessage({ type: 'SHIFTS_CHANGED', detail: createdShift });
        bc.close();
      }
    } catch {
      // BroadcastChannel optional fallback
    }
  }
}

/** In-memory cache for shift registry to prevent repeat network requests */
let cachedRawShifts: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache, instantly invalidated upon shift creation

export function clearShiftRegistryCache() {
  cachedRawShifts = null;
  cacheTimestamp = 0;
}

export function getCachedRawShifts(): any[] | null {
  if (cachedRawShifts && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRawShifts;
  }
  return null;
}

export function setCachedRawShifts(shifts: any[]) {
  cachedRawShifts = shifts;
  cacheTimestamp = Date.now();
}

/**
 * Helper to format 24-hour time "HH:MM" from ISO string or time string
 */
export function extractTime24(timeVal: any, fallback = '09:00'): string {
  if (!timeVal) return fallback;
  if (typeof timeVal === 'string') {
    const match = timeVal.match(/(\d{2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}`;
  }
  try {
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  } catch {}
  return fallback;
}

/**
 * Canonical fixed values for Shift I and Shift 2
 */
export const SEED_SHIFT_SPECS = {
  shift1: {
    name: SHIFT_I_LABEL,
    punchIn: '10:00',
    punchOut: '21:30',
    punchInDisplay: '10:00 AM',
    punchOutDisplay: '9:30 PM',
    timeRange: '10:00 AM – 9:30 PM',
    lunchMinutes: 100,
    teaMinutes: 20,
    teaSlot: 'Evening' as const,
  },
  shift2: {
    name: 'Shift 2',
    punchIn: '11:00',
    punchOut: '21:00',
    punchInDisplay: '11:00 AM',
    punchOutDisplay: '9:00 PM',
    timeRange: '11:00 AM – 9:00 PM',
    lunchMinutes: 45,
    teaMinutes: 10,
    teaSlot: 'None' as const,
  },
};

/**
 * Exactly 4 shift options that are strictly removed project-wide from all "All Shifts" dropdowns/lists:
 * 1. General Shift
 * 2. Morning Shift
 * 3. Evening Shift
 * 4. Night Shift
 *
 * All other shifts (Shift 1, Shift 2, Shift 3, Shift 4, Shift 5, Test Shift To Archive,
 * and any user-created custom shifts) MUST remain untouched and visible in their original order.
 */
export const EXCLUDED_SHIFT_NAMES = [
  'general shift',
  'morning shift',
  'evening shift',
  'night shift',
] as const;

export function isExcludedShiftName(nameOrLabel?: string | null): boolean {
  if (!nameOrLabel) return false;
  const normalized = nameOrLabel.trim().toLowerCase();
  return (
    normalized === 'general shift' ||
    normalized === 'morning shift' ||
    normalized === 'evening shift' ||
    normalized === 'night shift' ||
    normalized === 'night shift (batch)'
  );
}

export function filterStandardShifts<T extends { name?: string; label?: string }>(shifts: T[]): T[] {
  if (!Array.isArray(shifts)) return [];
  return shifts.filter((s) => !isExcludedShiftName(s.name || s.label));
}

/**
 * Strips any "Custom" keyword, prefix, suffix, or tags from shift display at view-level only,
 * returning the exact clean user-entered shift name.
 * Never mutates original data or stored shift name in API/state.
 */
export function formatShiftDisplayName(nameOrLabel?: string | null): string {
  if (!nameOrLabel) return '';
  const cleaned = nameOrLabel
    .replace(/^custom\s*[-–:]*\s*/i, '')
    .replace(/\s*[-–:]*\s*custom$/i, '')
    .replace(/\s*[\(\[]\s*custom\s*[\)\]]/gi, '')
    .trim();
  return cleaned || nameOrLabel;
}

/**
 * Checks whether a shift represents an immutable System / Default shift.
 * Default shifts cannot be deleted, while custom shifts can.
 */
export function isSystemOrDefaultShift(s: { name?: string | null; code?: string | null; isCustom?: boolean | null }): boolean {
  if (s.isCustom === true) return false;
  const nameLower = (s.name || '').trim().toLowerCase();
  const codeUpper = (s.code || '').trim().toUpperCase();

  const DEFAULT_SYSTEM_NAMES = [
    'shift i',
    'shift 1',
    'shift 2',
    'shift ii',
    'shift 3',
    'shift iii',
    'shift 4',
    'shift iv',
    'shift 5',
    'shift v',
    'test shift to archive',
    'morning shift',
    'general shift',
    'evening shift',
    'night shift',
    'night shift (batch)',
  ];

  if (DEFAULT_SYSTEM_NAMES.includes(nameLower)) return true;
  if (/^shift\s*([1-5]|i{1,3}|iv|v)\b/i.test(nameLower)) return true;
  if (/^SHIFT[_-]?([1-5]|I{1,3}|IV|V)\b/i.test(codeUpper)) return true;
  if (codeUpper.includes('MORNING') || codeUpper.includes('GENERAL') || codeUpper.includes('EVENING') || codeUpper.includes('NIGHT')) return true;
  return false;
}

/**
 * Normalizes raw shift records into the standardized Registry structure.
 * Groups by canonical shift identity across location hubs, preserving:
 * 1. Active Shifts: Shift I, Shift 2, then System & Custom shifts (sorted by createdAt)
 * 2. Legacy Shifts: Morning Shift, General Shift, Evening Shift, Night Shift
 */
export function buildShiftRegistry(
  rawShifts: any[],
  selectedLocation?: string
): {
  activeShifts: ShiftRegistryItem[];
  legacyShifts: ShiftRegistryItem[];
  allOptions: ShiftRegistryItem[];
  resetOption: ShiftRegistryItem;
  rawAllOptions: ShiftRegistryItem[];
} {
  const isAllHubs = !selectedLocation || selectedLocation === 'all' || selectedLocation === 'ALL';

  // Merge any locally stored custom shifts (for persistent availability across modules & reloads)
  const effectiveShifts: any[] = Array.isArray(rawShifts) ? [...rawShifts] : [];
  if (typeof window !== 'undefined') {
    try {
      const stored: any[] = JSON.parse(localStorage.getItem('bsc_custom_shifts') || '[]');
      for (const customS of stored) {
        if (!effectiveShifts.some((s) => s.id === customS.id || (s.name && customS.name && s.name.toLowerCase() === customS.name.toLowerCase()))) {
          effectiveShifts.push(customS);
        }
      }
    } catch {}
  }

  // Group raw shifts by canonical key
  const groups = new Map<string, any[]>();
  for (const s of effectiveShifts) {
    const nameLower = (s.name || '').trim().toLowerCase();
    const codeUpper = (s.code || '').trim().toUpperCase();

    let key = '';
    if (nameLower === 'shift i' || nameLower === 'shift 1' || codeUpper.startsWith('SHIFT_I')) {
      key = 'SHIFT_I';
    } else if (nameLower === 'shift 2' || nameLower === 'shift ii' || codeUpper.startsWith('SHIFT_2')) {
      key = 'SHIFT_2';
    } else if (nameLower.includes('morning') || codeUpper.includes('MORNING')) {
      key = 'LEGACY_MORNING';
    } else if (nameLower.includes('general') || codeUpper.includes('GENERAL')) {
      key = 'LEGACY_GENERAL';
    } else if (nameLower.includes('evening') || codeUpper.includes('EVENING')) {
      key = 'LEGACY_EVENING';
    } else if (nameLower.includes('night') || codeUpper.includes('NIGHT')) {
      key = 'LEGACY_NIGHT';
    } else if (isSystemOrDefaultShift(s)) {
      key = `SYSTEM_${s.id || nameLower}`;
    } else {
      // Custom shift: key by unique ID or distinct name
      key = `CUSTOM_${s.id}`;
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  // Helper to pick shift record for location and compute staff count
  const resolveGroup = (
    key: string,
    list: any[],
    options: {
      defaultName: string;
      defaultPunchIn?: string;
      defaultPunchOut?: string;
      defaultLunch?: number;
      defaultTea?: number;
      defaultTeaSlot?: 'None' | 'Morning' | 'Evening';
      source: 'Seed' | 'Custom' | 'Legacy';
      status: 'Active' | 'Legacy' | 'Archived';
      isCustom: boolean;
    }
  ): ShiftRegistryItem => {
    // Find matching shift for selected location
    let matchingRecord: any = null;
    let existsInSelectedHub = true;

    if (!isAllHubs) {
      matchingRecord = list.find(
        (s) =>
          s.locationId === selectedLocation ||
          s.location?.code === selectedLocation ||
          s.location?.id === selectedLocation
      );
      existsInSelectedHub = Boolean(matchingRecord);
    }

    if (!matchingRecord) {
      matchingRecord = list[0] || {};
    }

    const allLocationIds = list.map((s) => s.id).filter(Boolean);
    const chosenShiftId = isAllHubs
      ? allLocationIds.length > 1
        ? allLocationIds.join(',')
        : matchingRecord.id || key
      : matchingRecord.id || key;

    const staffCount = isAllHubs
      ? list.reduce((acc, s) => acc + (s._count?.employees ?? s.staffCount ?? 0), 0)
      : matchingRecord._count?.employees ?? matchingRecord.staffCount ?? 0;

    const punchIn =
      options.defaultPunchIn || extractTime24(matchingRecord.startTime, '09:00');
    const punchOut =
      options.defaultPunchOut || extractTime24(matchingRecord.endTime, '18:00');

    const punchInDisplay = formatPunchTime12(punchIn);
    const punchOutDisplay = formatPunchTime12(punchOut);
    const timeRange = `${punchInDisplay} – ${punchOutDisplay}`;

    const lunchMinutes =
      options.defaultLunch !== undefined
        ? options.defaultLunch
        : matchingRecord.lunchDurationMinutes ?? 45;
    const teaMinutes =
      options.defaultTea !== undefined
        ? options.defaultTea
        : matchingRecord.teaDurationMinutes ?? 0;
    const teaSlot =
      options.defaultTeaSlot ||
      matchingRecord.teaBreakSlot ||
      (teaMinutes > 0 ? 'Evening' : 'None');

    const displayName =
      key === 'SHIFT_I'
        ? SHIFT_I_LABEL
        : matchingRecord.name || options.defaultName;

    const isCustom = Boolean(options.isCustom);
    const type: ShiftType = isCustom ? 'custom' : 'default';
    const isDeletable = isCustom; // true ONLY when type === 'custom'
    const computedDisplayName = formatShiftDisplayName(displayName);

    return {
      id: chosenShiftId,
      shiftId: chosenShiftId,
      name: displayName,
      displayName: computedDisplayName,
      label: computedDisplayName,
      type,
      isCustom,
      isDeletable,
      code: matchingRecord.code,
      locationId: matchingRecord.locationId,
      allLocationIds,
      punchIn,
      punchOut,
      punchInDisplay,
      punchOutDisplay,
      timeRange,
      startTime: punchIn,
      endTime: punchOut,
      lunchMinutes,
      lunchDurationMinutes: lunchMinutes,
      teaMinutes,
      teaDurationMinutes: teaMinutes,
      teaSlot,
      teaBreakSlot: teaSlot,
      status: options.status,
      source: options.source,
      staffCount,
      createdAt: matchingRecord.createdAt,
      createdBy: matchingRecord.createdBy,
      noRosterInHub: !isAllHubs && !existsInSelectedHub,
    };
  };

  const activeShifts: ShiftRegistryItem[] = [];
  const legacyShifts: ShiftRegistryItem[] = [];

  // 1. Shift I (Active Seed)
  const shift1List = groups.get('SHIFT_I') || [];
  const isShift1Archived =
    shift1List.length > 0 &&
    shift1List.every((s) => s.status === 'ARCHIVED' || s.status === 'INACTIVE');
  if (!isShift1Archived) {
    activeShifts.push(
      resolveGroup('SHIFT_I', shift1List, {
        defaultName: SHIFT_I_LABEL,
        defaultPunchIn: SEED_SHIFT_SPECS.shift1.punchIn,
        defaultPunchOut: SEED_SHIFT_SPECS.shift1.punchOut,
        defaultLunch: SEED_SHIFT_SPECS.shift1.lunchMinutes,
        defaultTea: SEED_SHIFT_SPECS.shift1.teaMinutes,
        defaultTeaSlot: SEED_SHIFT_SPECS.shift1.teaSlot,
        source: 'Seed',
        status: 'Active',
        isCustom: false,
      })
    );
  }

  // 2. Shift 2 (Active Seed)
  const shift2List = groups.get('SHIFT_2') || [];
  const isShift2Archived =
    shift2List.length > 0 &&
    shift2List.every((s) => s.status === 'ARCHIVED' || s.status === 'INACTIVE');
  if (!isShift2Archived) {
    activeShifts.push(
      resolveGroup('SHIFT_2', shift2List, {
        defaultName: 'Shift 2',
        defaultPunchIn: SEED_SHIFT_SPECS.shift2.punchIn,
        defaultPunchOut: SEED_SHIFT_SPECS.shift2.punchOut,
        defaultLunch: SEED_SHIFT_SPECS.shift2.lunchMinutes,
        defaultTea: SEED_SHIFT_SPECS.shift2.teaMinutes,
        defaultTeaSlot: SEED_SHIFT_SPECS.shift2.teaSlot,
        source: 'Seed',
        status: 'Active',
        isCustom: false,
      })
    );
  }

  // 3. System & User Custom shifts (in creation order)
  const systemEntries: ShiftRegistryItem[] = [];
  const customEntries: ShiftRegistryItem[] = [];
  for (const [key, list] of groups.entries()) {
    if (key.startsWith('SYSTEM_')) {
      const isArchived =
        list.length > 0 &&
        list.every((s) => s.status === 'ARCHIVED' || s.status === 'INACTIVE');
      const item = resolveGroup(key, list, {
        defaultName: list[0]?.name || 'System Shift',
        source: 'Seed',
        status: isArchived ? 'Archived' : 'Active',
        isCustom: false,
      });
      if (item.status !== 'Archived') {
        systemEntries.push(item);
      }
    } else if (key.startsWith('CUSTOM_')) {
      const isArchived =
        list.length > 0 &&
        list.every((s) => s.status === 'ARCHIVED' || s.status === 'INACTIVE');
      const item = resolveGroup(key, list, {
        defaultName: list[0]?.name || 'Custom Shift',
        source: 'Custom',
        status: isArchived ? 'Archived' : 'Active',
        isCustom: true,
      });
      if (item.status !== 'Archived') {
        customEntries.push(item);
      }
    }
  }

  // Preserve order: system defaults first, then custom shifts by createdAt ascending
  activeShifts.push(...systemEntries);

  customEntries.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });
  activeShifts.push(...customEntries);

  // 4. Legacy Shifts: Morning Shift, General Shift, Evening Shift, Night Shift
  const legacySpecs: Array<{
    key: string;
    defaultName: string;
    punchIn: string;
    punchOut: string;
    lunchMinutes: number;
    teaMinutes: number;
    teaSlot: 'None' | 'Morning' | 'Evening';
  }> = [
    {
      key: 'LEGACY_MORNING',
      defaultName: 'Morning Shift',
      punchIn: '06:00',
      punchOut: '14:00',
      lunchMinutes: 45,
      teaMinutes: 15,
      teaSlot: 'Morning',
    },
    {
      key: 'LEGACY_GENERAL',
      defaultName: 'General Shift',
      punchIn: '09:00',
      punchOut: '18:00',
      lunchMinutes: 45,
      teaMinutes: 15,
      teaSlot: 'Morning',
    },
    {
      key: 'LEGACY_EVENING',
      defaultName: 'Evening Shift',
      punchIn: '14:00',
      punchOut: '22:00',
      lunchMinutes: 45,
      teaMinutes: 15,
      teaSlot: 'Evening',
    },
    {
      key: 'LEGACY_NIGHT',
      defaultName: 'Night Shift',
      punchIn: '22:00',
      punchOut: '06:00',
      lunchMinutes: 45,
      teaMinutes: 15,
      teaSlot: 'None',
    },
  ];

  for (const spec of legacySpecs) {
    const list = groups.get(spec.key) || [];
    legacyShifts.push(
      resolveGroup(spec.key, list, {
        defaultName: spec.defaultName,
        defaultPunchIn: spec.punchIn,
        defaultPunchOut: spec.punchOut,
        defaultLunch: spec.lunchMinutes,
        defaultTea: spec.teaMinutes,
        defaultTeaSlot: spec.teaSlot,
        source: 'Legacy',
        status: 'Legacy',
        isCustom: false,
      })
    );
  }

  const resetOption: ShiftRegistryItem = {
    id: 'all',
    shiftId: 'all',
    name: 'All Shifts',
    displayName: 'All Shifts',
    label: 'All Shifts',
    type: 'default',
    isCustom: false,
    isDeletable: false,
    punchIn: '',
    punchOut: '',
    punchInDisplay: '',
    punchOutDisplay: '',
    timeRange: 'All active & legacy rosters combined',
    startTime: '',
    endTime: '',
    lunchMinutes: 0,
    lunchDurationMinutes: 0,
    teaMinutes: 0,
    teaDurationMinutes: 0,
    teaSlot: 'None',
    teaBreakSlot: 'None',
    status: 'Active',
    source: 'Seed',
    staffCount: activeShifts.reduce((acc, s) => acc + s.staffCount, 0),
  };

  const rawAllOptions = [...activeShifts, ...legacyShifts];
  const allOptions = filterStandardShifts(rawAllOptions);

  return {
    rawAllOptions,
    activeShifts: filterStandardShifts(activeShifts),
    legacyShifts: filterStandardShifts(legacyShifts),
    allOptions,
    resetOption,
  };
}

/**
 * Soft delete / Archive a shift by ID.
 * Sends PATCH /shifts/:id/archive to the backend, clears registry cache,
 * and notifies all components across tabs.
 */
export async function archiveShiftRegistryItem(
  shiftId: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string; shiftId: string; name: string }> {
  const { api } = await import('@/lib/api');
  try {
    const res = await api.patch(
      `/shifts/${encodeURIComponent(shiftId)}/archive`,
      {},
      { signal }
    );
    clearShiftRegistryCache();
    notifyShiftsChanged({ action: 'DELETE', shiftId, name: res.data?.name });
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const delRes = await api.delete(`/shifts/${encodeURIComponent(shiftId)}`, { signal });
      clearShiftRegistryCache();
      notifyShiftsChanged({ action: 'DELETE', shiftId });
      return { success: true, message: 'Shift deleted successfully', shiftId, name: '' };
    }
    throw err;
  }
}

