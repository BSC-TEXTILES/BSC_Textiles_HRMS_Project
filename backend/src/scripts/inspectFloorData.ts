import { pool } from '../nativeDb.js';

async function main() {
  const [items]: any = await pool.query('SELECT * FROM payrollitem WHERE id != "pi_bsc_1372_aug2026" LIMIT 2');
  console.log('Sample Payroll Item:');
  console.log(items[0]);
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
