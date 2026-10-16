/**
 * Identity-only description of the hubs the employee directory expects to exist.
 *
 * This is a fallback used when `GET /locations/all` has not answered yet, so the
 * filter dropdown and the drawer shell can still render. It deliberately carries
 * NO headcount, attendance or manager fields: those come from the API only. If a
 * metric is missing the UI shows "—" rather than a fabricated zero.
 *
 * `id` mirrors `code` because the backend issues cuids; matching is done on
 * `code`, which is stable across both the legacy and current location tables.
 */
export interface CanonicalHubStore {
  id: string;
  code: string;
  name: string;
  city: string;
  status: 'ACTIVE';
}

export const CANONICAL_HUB_STORES: CanonicalHubStore[] = [
  { id: 'BEL', code: 'BEL', name: 'Belagavi', city: 'Belagavi', status: 'ACTIVE' },
  { id: 'DAV', code: 'DAV', name: 'Davanagere', city: 'Davanagere', status: 'ACTIVE' },
  { id: 'SHI', code: 'SHI', name: 'Shivamogga', city: 'Shivamogga', status: 'ACTIVE' },
];

export interface StoreHubItem {
  id: string;
  code: string;
  name: string;
  location: string;
  city: string;
  address: string;
  /** All roster rows attached to this location. */
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  /**
   * Staff with an attendance row today (null when live attendance was not
   * supplied — the drawer then shows "—" instead of guessing).
   */
  presentOnFloor: number | null;
  departmentsAvailable: string;
  terminalCount: number;
  managerName: string;
  hrContactName: string;
  status: 'ACTIVE' | 'INACTIVE' | string;
}
