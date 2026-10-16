import { pool } from '../nativeDb.js';

async function runTests() {
  console.log('=== RUNNING EXECUTIVE SHIFT TESTS ===');

  // Test Database Seed Records for Shift I and Shift 2
  const [shiftIRows]: any = await pool.query('SELECT * FROM shift WHERE name = ?', ['Shift I']);
  if (!shiftIRows || shiftIRows.length === 0) throw new Error('Shift I must exist in DB');
  console.log(`Test Passed: Shift I found in DB (${shiftIRows.length} records).`);

  const [shift2Rows]: any = await pool.query('SELECT * FROM shift WHERE name = ?', ['Shift 2']);
  if (!shift2Rows || shift2Rows.length === 0) throw new Error('Shift 2 must exist in DB');
  console.log(`Test Passed: Shift 2 found in DB (${shift2Rows.length} records).`);

  console.log('=== ALL EXECUTIVE SHIFT TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
