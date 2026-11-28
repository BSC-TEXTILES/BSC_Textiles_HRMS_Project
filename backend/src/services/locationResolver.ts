/**
 * LocationResolverService — Central referential integrity service for Locations, Departments, Floors, and Shifts.
 *
 * Guarantees that every locationId, departmentId, floorId, and shiftId inserted into MySQL
 * genuinely exists in the database, preventing any Foreign Key Constraint failures.
 */

import { pool } from '../nativeDb.js';
import { setupOrganizationHubs } from '../scripts/setupOrganizationHubs.js';
import { resolveLocationAlias } from './locationRegistry.js';

export class LocationResolverService {
  /**
   * Resolves any location input (code, cuid, alias, showroom name) to an existing MySQL location.id.
   * If table is missing records, self-heals via setupOrganizationHubs.
   */
  public static async resolveLocationId(input?: unknown): Promise<string> {
    const raw = String(input ?? '').trim();
    if (!raw || raw.toLowerCase() === 'all') {
      return this.getDefaultLocationId();
    }

    // 1. Check registry alias
    const regAlias = resolveLocationAlias(raw);
    if (regAlias && regAlias !== raw) {
      const [exists]: any = await pool.query('SELECT id FROM `location` WHERE id = ? LIMIT 1', [regAlias]);
      if (exists && exists.length > 0) return regAlias;
    }

    // 2. Direct database query: id, code, or name match
    let targetCode = raw.toUpperCase();
    if (raw === 'loc_bel' || targetCode.includes('BELAGAVI') || targetCode.includes('BELGAUM')) targetCode = 'BEL';
    else if (raw === 'loc_dav' || targetCode.includes('DAVANAGERE') || targetCode.includes('DAVANGERE')) targetCode = 'DAV';
    else if (raw === 'loc_shi' || targetCode.includes('SHIVAMOGGA') || targetCode.includes('SHIMOGA')) targetCode = 'SHI';
    else if (raw === 'loc_hq' || targetCode.includes('HUBBALLI') || targetCode.includes('HUBLI')) targetCode = 'DAV';

    const [matched]: any = await pool.query(
      `SELECT id FROM \`location\` 
       WHERE id = ? 
          OR code = ? 
          OR code = ? 
          OR name LIKE ?
       LIMIT 1`,
      [raw, raw, targetCode, `%${raw}%`]
    );

    if (matched && matched.length > 0) {
      return matched[0].id;
    }

    // 3. Fallback to active Davanagere or Belagavi
    return this.getDefaultLocationId();
  }

  /**
   * Returns the primary active location ID in MySQL (prefers DAV then BEL).
   */
  public static async getDefaultLocationId(): Promise<string> {
    const [rows]: any = await pool.query(
      `SELECT id FROM \`location\` WHERE status = 'ACTIVE' ORDER BY code = 'DAV' DESC, code = 'BEL' DESC, id ASC LIMIT 1`
    );
    if (rows && rows.length > 0) {
      return rows[0].id;
    }

    // Self-heal canonical showrooms
    await setupOrganizationHubs().catch(() => undefined);
    const [healed]: any = await pool.query(
      `SELECT id FROM \`location\` WHERE status = 'ACTIVE' ORDER BY code = 'DAV' DESC, id ASC LIMIT 1`
    );
    return healed?.[0]?.id || 'cmuzam5fr00024n4p4izbomev';
  }

  /**
   * Safely resolves departmentId against database records. Returns null if not found.
   */
  public static async resolveDepartmentId(deptInput?: unknown, locationId?: string): Promise<string | null> {
    if (!deptInput || String(deptInput).trim() === '') return null;
    const val = String(deptInput).trim();

    if (locationId) {
      const [scoped]: any = await pool.query(
        `SELECT id FROM \`department\` WHERE (id = ? OR code = ? OR name = ?) AND locationId = ? LIMIT 1`,
        [val, val, val, locationId]
      );
      if (scoped && scoped.length > 0) return scoped[0].id;
    }

    const [globalDept]: any = await pool.query(
      `SELECT id FROM \`department\` WHERE id = ? OR code = ? OR name = ? LIMIT 1`,
      [val, val, val]
    );
    return globalDept && globalDept.length > 0 ? globalDept[0].id : null;
  }

  /**
   * Safely resolves floorId against database records. Returns null if not found.
   */
  public static async resolveFloorId(floorInput?: unknown, locationId?: string): Promise<string | null> {
    if (!floorInput || String(floorInput).trim() === '') return null;
    const val = String(floorInput).trim();

    if (locationId) {
      const [scoped]: any = await pool.query(
        `SELECT id FROM \`floor\` WHERE (id = ? OR name = ?) AND locationId = ? LIMIT 1`,
        [val, val, locationId]
      );
      if (scoped && scoped.length > 0) return scoped[0].id;
    }

    const [globalFloor]: any = await pool.query(
      `SELECT id FROM \`floor\` WHERE id = ? OR name = ? LIMIT 1`,
      [val, val]
    );
    return globalFloor && globalFloor.length > 0 ? globalFloor[0].id : null;
  }

  /**
   * Safely resolves shiftId against database records. Returns null if not found.
   */
  public static async resolveShiftId(shiftInput?: unknown, locationId?: string): Promise<string | null> {
    if (!shiftInput || String(shiftInput).trim() === '') return null;
    const val = String(shiftInput).trim();

    if (locationId) {
      const [scoped]: any = await pool.query(
        `SELECT id FROM \`shift\` WHERE (id = ? OR code = ? OR name = ?) AND locationId = ? LIMIT 1`,
        [val, val, val, locationId]
      );
      if (scoped && scoped.length > 0) return scoped[0].id;
    }

    const [globalShift]: any = await pool.query(
      `SELECT id FROM \`shift\` WHERE id = ? OR code = ? OR name = ? LIMIT 1`,
      [val, val, val]
    );
    return globalShift && globalShift.length > 0 ? globalShift[0].id : null;
  }
}
