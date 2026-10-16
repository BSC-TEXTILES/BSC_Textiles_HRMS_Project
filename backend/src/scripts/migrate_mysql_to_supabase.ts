import mysql from 'mysql2/promise';
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

function mapMysqlTypeToPg(type: string, extra: string = ''): string {
  const lower = type.toLowerCase();
  const isAutoInc = extra.toLowerCase().includes('auto_increment');

  if (isAutoInc) {
    if (lower.startsWith('bigint')) return 'BIGSERIAL';
    return 'SERIAL';
  }

  if (lower.startsWith('varchar')) return lower;
  if (lower.startsWith('char')) return lower;
  if (lower.startsWith('text') || lower.startsWith('mediumtext') || lower.startsWith('longtext')) return 'text';
  if (lower.startsWith('tinyint(1)') || lower === 'boolean') return 'boolean';
  if (lower.startsWith('tinyint') || lower.startsWith('smallint')) return 'smallint';
  if (lower.startsWith('int') || lower.startsWith('mediumint')) return 'integer';
  if (lower.startsWith('bigint')) return 'bigint';
  if (lower.startsWith('decimal') || lower.startsWith('numeric')) return lower;
  if (lower.startsWith('float') || lower.startsWith('double')) return 'double precision';
  if (lower.startsWith('datetime') || lower.startsWith('timestamp')) return 'timestamptz';
  if (lower.startsWith('date')) return 'date';
  if (lower.startsWith('time')) return 'time';
  if (lower.startsWith('json')) return 'jsonb';
  if (lower.startsWith('enum')) return 'text';
  if (lower.startsWith('blob') || lower.startsWith('longblob')) return 'bytea';
  return 'text';
}

export async function runMigration(supabaseConnString: string) {
  console.log('================================================================');
  console.log('BSC TEXTILES HRMS — COMPLETE MYSQL TO SUPABASE POSTGRES MIGRATION');
  console.log('================================================================');
  
  const mysqlConn = await mysql.createConnection(
    process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms'
  );
  console.log('✓ Connected to local MySQL (bsc_textiles_hrms)');

  const pgClient = new Client({
    connectionString: supabaseConnString,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();
  console.log('✓ Connected to Supabase PostgreSQL 17 on session pooler');

  const [tablesResult] = await mysqlConn.query('SHOW TABLES');
  const tableNames = (tablesResult as any[]).map(r => Object.values(r)[0] as string);
  console.log(`Found ${tableNames.length} tables in MySQL to migrate.`);

  // Phase 1: Create all tables in Supabase Postgres
  console.log('\n--- Phase 1: Creating Tables in Supabase ---');
  const tableColumnMeta: Record<string, { name: string; type: string; isBool: boolean; isJson: boolean; isDate: boolean }[]> = {};

  for (const table of tableNames) {
    try {
      const [columns] = await mysqlConn.query(`DESCRIBE \`${table}\``);
      const colDefs: string[] = [];
      const primaryKeys: string[] = [];
      const colMetaList: { name: string; type: string; isBool: boolean; isJson: boolean; isDate: boolean }[] = [];

      for (const col of columns as any[]) {
        const fieldName = `"${col.Field}"`;
        const pgType = mapMysqlTypeToPg(col.Type, col.Extra || '');
        const isNullable = col.Null === 'YES' || col.Extra?.includes('auto_increment') ? '' : ' NOT NULL';
        
        let def = `${fieldName} ${pgType}${isNullable}`;
        if (col.Key === 'PRI' && !col.Extra?.includes('auto_increment')) {
          primaryKeys.push(fieldName);
        }

        colMetaList.push({
          name: col.Field,
          type: pgType,
          isBool: pgType === 'boolean',
          isJson: pgType === 'jsonb',
          isDate: pgType === 'timestamptz' || pgType === 'date'
        });

        colDefs.push(def);
      }

      tableColumnMeta[table] = colMetaList;

      let createSql = `CREATE TABLE IF NOT EXISTS public."${table}" (\n  ${colDefs.join(',\n  ')}`;
      if (primaryKeys.length > 0) {
        createSql += `,\n  PRIMARY KEY (${primaryKeys.join(', ')})`;
      }
      createSql += '\n);';

      await pgClient.query(createSql);

      for (const col of colMetaList) {
        try {
          await pgClient.query(`ALTER TABLE public."${table}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type};`);
        } catch {
          // ignore
        }
      }

      console.log(`  ✓ Table public."${table}" created/reconciled`);
    } catch (err: any) {
      console.error(`  ✗ Error creating table "${table}":`, err.message);
    }
  }

  // Phase 2: Disable triggers and insert all data
  console.log('\n--- Phase 2: Migrating Table Data ---');
  await pgClient.query('SET session_replication_role = replica;');

  let totalMigratedRows = 0;
  let successfulTables = 0;

  for (const table of tableNames) {
    try {
      const [countRes] = await mysqlConn.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
      const rowCount = (countRes as any[])[0].cnt;
      if (rowCount === 0) {
        successfulTables++;
        continue;
      }

      const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);
      const rowList = rows as any[];
      if (rowList.length === 0) continue;

      try {
        await pgClient.query(`TRUNCATE TABLE public."${table}" CASCADE;`);
      } catch {
        // ignore
      }

      const meta = tableColumnMeta[table] || [];
      const colKeys = meta.map(m => m.name);
      const quotedCols = colKeys.map(c => `"${c}"`).join(', ');

      const batchSize = 100;
      for (let i = 0; i < rowList.length; i += batchSize) {
        const batch = rowList.slice(i, i + batchSize);
        const valuePlaceholders: string[] = [];
        const flatValues: any[] = [];

        let paramIdx = 1;
        for (const row of batch) {
          const rowPlaceholders: string[] = [];
          for (const m of meta) {
            let val = row[m.name];
            
            // Format conversions
            if (val === undefined || val === null) {
              val = null;
            } else if (m.isBool) {
              val = val === 1 || val === true || val === '1';
            } else if (m.isDate) {
              if (val instanceof Date) {
                if (isNaN(val.getTime())) {
                  val = null;
                }
              } else if (typeof val === 'string' && (val.startsWith('0000-00-00') || val.includes('NaN') || val === '')) {
                val = null;
              }
              if (val === null && (m.name === 'updatedAt' || m.name === 'createdAt')) {
                val = new Date().toISOString();
              }
            } else if (m.isJson) {
              if (typeof val === 'object') {
                val = JSON.stringify(val);
              }
            } else if (typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
              val = JSON.stringify(val);
            }

            flatValues.push(val);
            rowPlaceholders.push(`$${paramIdx++}`);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        }

        const insertSql = `INSERT INTO public."${table}" (${quotedCols}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT DO NOTHING;`;
        await pgClient.query(insertSql, flatValues);
      }

      totalMigratedRows += rowList.length;
      successfulTables++;
      console.log(`  ✓ Migrated ${table.padEnd(35)} : ${rowList.length} rows`);
    } catch (err: any) {
      console.error(`  ✗ Data copy failed for ${table}:`, err.message);
    }
  }

  // Phase 3: Re-enable replication role
  await pgClient.query('SET session_replication_role = DEFAULT;');

  // Phase 4: Sync sequences for SERIAL columns
  console.log('\n--- Phase 3: Synchronizing Sequences ---');
  for (const table of tableNames) {
    try {
      const seqCheck = await pgClient.query(`
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_default LIKE 'nextval%';
      `, [table]);

      for (const row of seqCheck.rows) {
        const col = row.column_name;
        await pgClient.query(`
          SELECT setval(pg_get_serial_sequence('public."${table}"', '${col}'), COALESCE((SELECT MAX("${col}") FROM public."${table}"), 1));
        `);
      }
    } catch (err: any) {
      // Ignored for tables without sequences
    }
  }

  console.log('\n================================================================');
  console.log(`MIGRATION COMPLETE!`);
  console.log(`Total Tables Processed: ${successfulTables} / ${tableNames.length}`);
  console.log(`Total Rows Transferred: ${totalMigratedRows}`);
  console.log('================================================================');

  await mysqlConn.end();
  await pgClient.end();
}

const targetConn = process.argv[2] || process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

runMigration(targetConn).catch(err => {
  console.error('Migration aborted:', err);
  process.exit(1);
});
