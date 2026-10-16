import { pool } from '../src/pool.js';

async function main() {
  const [fks]: any = await pool.query(`
    SELECT 
      TABLE_NAME, 
      COLUMN_NAME, 
      CONSTRAINT_NAME, 
      REFERENCED_TABLE_NAME, 
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_NAME = 'employee'
      AND TABLE_SCHEMA = 'bsc_textiles_hrms'
  `);
  console.log('Foreign keys referencing employee table:');
  console.table(fks);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
