import { pool } from '../nativeDb.js';

export async function runShiftMigration() {
  console.log('[ShiftMigration] Starting BSC Textiles HRMS Shift Directory Standardization...');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch all current shifts
    const [shifts]: any = await conn.query('SELECT id, name, code, locationId FROM shift');
    console.log(`[ShiftMigration] Found ${shifts.length} shifts to inspect.`);

    // Map of roman numeral variations to standard title case
    const standardNameMap: Record<string, string> = {
      'shift 1': 'Shift I',
      'shift i': 'Shift I',
      'shift 2': 'Shift II',
      'shift ii': 'Shift II',
      'shift 3': 'Shift III',
      'shift iii': 'Shift III',
      'shift 4': 'Shift IV',
      'shift iv': 'Shift IV',
      'shift 5': 'Shift V',
      'shift v': 'Shift V',
      'shift 6': 'Shift VI',
      'shift vi': 'Shift VI',
      'shift 7': 'Shift VII',
      'shift vii': 'Shift VII',
      'shift 8': 'Shift VIII',
      'shift viii': 'Shift VIII',
      'shift 9': 'Shift IX',
      'shift ix': 'Shift IX',
    };

    let updatedCount = 0;
    for (const s of shifts) {
      // Remove any 'custom' word/tags from name
      let cleanName = s.name
        .replace(/\bcustom\b/gi, '')
        .replace(/[-–:_()\[\]]+/g, ' ')
        .trim();

      // Check if matches standard shift name
      const lower = cleanName.toLowerCase().replace(/\s+/g, ' ');
      if (standardNameMap[lower]) {
        cleanName = standardNameMap[lower];
      }

      if (cleanName !== s.name) {
        console.log(`[ShiftMigration] Updating shift "${s.name}" (id: ${s.id}) -> "${cleanName}"`);
        await conn.query('UPDATE shift SET name = ? WHERE id = ?', [cleanName, s.id]);
        updatedCount++;
      }
    }

    await conn.commit();
    console.log(`[ShiftMigration] Successfully updated ${updatedCount} shifts to standard naming.`);
  } catch (err) {
    await conn.rollback();
    console.error('[ShiftMigration] Migration failed, rolled back:', err);
    throw err;
  } finally {
    conn.release();
  }
}

if (process.argv[1] && process.argv[1].includes('migrateShifts')) {
  runShiftMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
