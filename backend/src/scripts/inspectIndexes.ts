import { pool } from '../nativeDb';

async function main() {
  const [rows]: any = await pool.execute(`
    SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = 'bsc_textiles_hrms' 
      AND TABLE_NAME IN ('attendance', 'employee', 'employeebreak', 'holiday', 'incentivetransaction')
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);
  
  const tables: Record<string, Record<string, string[]>> = {};
  for (const r of rows) {
    if (!tables[r.TABLE_NAME]) tables[r.TABLE_NAME] = {};
    if (!tables[r.TABLE_NAME][r.INDEX_NAME]) tables[r.TABLE_NAME][r.INDEX_NAME] = [];
    tables[r.TABLE_NAME][r.INDEX_NAME].push(r.COLUMN_NAME);
  }

  console.log(JSON.stringify(tables, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
