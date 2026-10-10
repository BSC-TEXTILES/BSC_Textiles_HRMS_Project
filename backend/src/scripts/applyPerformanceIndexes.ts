import { pool } from '../nativeDb.js';

interface IndexDefinition {
  table: string;
  name: string;
  columns: string[];
}

const INDEXES: IndexDefinition[] = [
  { table: 'attendance', name: 'idx_att_loc_date_status', columns: ['locationId', 'attendanceDate', 'status'] },
  { table: 'attendance', name: 'idx_att_date_status', columns: ['attendanceDate', 'status'] },
  { table: 'attendance', name: 'idx_att_shift_date', columns: ['shiftId', 'attendanceDate'] },
  { table: 'faceverification', name: 'idx_face_loc_time_res', columns: ['locationId', 'verifiedAt', 'result'] },
  { table: 'faceverification', name: 'idx_face_time_res', columns: ['verifiedAt', 'result'] },
  { table: 'qrscanrecord', name: 'idx_qr_loc_time_res', columns: ['locationId', 'scannedAt', 'result'] },
  { table: 'qrscanrecord', name: 'idx_qr_time_res', columns: ['scannedAt', 'result'] },
  { table: 'employeebreak', name: 'idx_eb_emp_date', columns: ['employeeId', 'breakDate'] },
  { table: 'employeebreak', name: 'idx_eb_status_date', columns: ['status', 'breakDate'] },
  { table: 'incentivetransaction', name: 'idx_it_tx_date', columns: ['transactionDate'] },
  { table: 'incentivetransaction', name: 'idx_it_emp_date', columns: ['employeeId', 'transactionDate'] },
  { table: 'penaltytransaction', name: 'idx_pt_tx_date', columns: ['transactionDate'] },
  { table: 'penaltytransaction', name: 'idx_pt_emp_date', columns: ['employeeId', 'transactionDate'] },
  { table: 'employee', name: 'idx_emp_status_loc', columns: ['status', 'locationId'] },
  { table: 'employee', name: 'idx_emp_status_dept', columns: ['status', 'departmentId'] },
  { table: 'observation', name: 'idx_obs_loc_status_level', columns: ['locationId', 'status', 'level'] },
  { table: 'observation', name: 'idx_obs_status_level', columns: ['status', 'level'] },
];

async function applyIndexes() {
  console.log('Verifying & applying high-performance composite indexes...');
  const connection = await pool.getConnection();
  try {
    for (const idx of INDEXES) {
      const [existing]: any = await connection.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [idx.table, idx.name]
      );

      if (existing.length === 0) {
        const cols = idx.columns.map(c => `\`${c}\``).join(', ');
        const sql = `CREATE INDEX \`${idx.name}\` ON \`${idx.table}\` (${cols})`;
        await connection.query(sql);
        console.log(`✅ Created index: ${idx.name} on ${idx.table} (${idx.columns.join(', ')})`);
      } else {
        console.log(`✓ Already exists: ${idx.name} on ${idx.table}`);
      }
    }
    console.log('All composite performance indexes verified and active.');
  } finally {
    connection.release();
  }
}

applyIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to apply indexes:', err);
    process.exit(1);
  });
