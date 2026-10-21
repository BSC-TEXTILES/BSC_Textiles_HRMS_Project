import { pool } from '../nativeDb.js';

async function runTests() {
  console.log('=== RUNNING EXECUTIVE SHIFT TESTS ===');

  // Test Database Standard Shift Records
  const [standardShifts]: any = await pool.query(
    "SELECT * FROM shift WHERE name IN ('Shift II', 'Shift III', 'Shift IV', 'Shift VIII', 'Shift IX') AND status = 'ACTIVE'"
  );
  if (!standardShifts || standardShifts.length === 0) throw new Error('Standard shifts must exist in DB');
  console.log(`Test Passed: Standard shifts found in DB (${standardShifts.length} records).`);
  for (const s of standardShifts) {
    console.log(`  - ${s.name} (${s.code})`);
  }

  console.log('=== ALL EXECUTIVE SHIFT TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
