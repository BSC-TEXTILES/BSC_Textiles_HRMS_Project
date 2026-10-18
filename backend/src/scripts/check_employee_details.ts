import ExcelJS from 'exceljs';
import { pool } from '../nativeDb.js';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('../HRXL.xlsx');
  const sheet = wb.getWorksheet(1);
  if (!sheet) throw new Error('Sheet1 not found');

  const excelRows: any[] = [];
  sheet.eachRow((r, rowNum) => {
    if (rowNum === 1) return;
    const v = r.values as any[];
    excelRows.push({
      empNo: String(v[1]).trim(),
      empName: String(v[2] || '').trim(),
      dept: String(v[3] || '').trim(),
      desig: String(v[4] || '').trim(),
      floor: String(v[5] || '').trim(),
      division: String(v[6] || '').trim(),
      doj: v[7],
      basic: Number(v[8]) || 0,
      hra: Number(v[9]) || 0,
      curAddr1: String(v[10] || '').trim(),
      curAddr2: String(v[11] || '').trim(),
      curCity: String(v[12] || '').trim(),
      curState: String(v[13] || '').trim(),
      perAddr1: String(v[14] || '').trim(),
      perAddr2: String(v[15] || '').trim(),
      perCity: String(v[16] || '').trim(),
      perState: String(v[17] || '').trim(),
      batch: String(v[18] || '').trim(),
      gender: String(v[20] || '').trim().toUpperCase(),
    });
  });

  console.log(`Excel has ${excelRows.length} rows.`);

  const [dbRows]: any = await pool.query("SELECT *, DATE_FORMAT(joiningDate, '%Y-%m-%d') as formattedDate FROM employee ORDER BY CAST(employeeCode AS UNSIGNED)");
  console.log(`DB has ${dbRows.length} employees.`);

  const discrepancies: any[] = [];
  for (const er of excelRows) {
    const dr = dbRows.find((d: any) => String(d.employeeCode) === er.empNo);
    if (!dr) {
      discrepancies.push({ empNo: er.empNo, issue: 'Missing in DB' });
      continue;
    }
    // Check fields
    const diffs: string[] = [];
    if (Number(dr.basicSalary) !== er.basic) diffs.push(`basicSalary: db=${dr.basicSalary} vs xl=${er.basic}`);
    if (Number(dr.hra) !== er.hra) diffs.push(`hra: db=${dr.hra} vs xl=${er.hra}`);
    if (dr.batch !== er.batch) diffs.push(`batch: db=${dr.batch} vs xl=${er.batch}`);
    if (dr.gender !== er.gender) diffs.push(`gender: db=${dr.gender} vs xl=${er.gender}`);
    if (dr.designation !== er.desig) diffs.push(`desig: db=${dr.designation} vs xl=${er.desig}`);
    if (dr.employeeCategory !== er.division) diffs.push(`division: db=${dr.employeeCategory} vs xl=${er.division}`);

    // Check DOJ
    let expectedDoj = '2026-02-01';
    if (er.doj) {
      if (er.doj instanceof Date) expectedDoj = er.doj.toISOString().split('T')[0];
      else if (typeof er.doj === 'string') {
        const parts = er.doj.trim().split('/');
        if (parts.length === 3) expectedDoj = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    if (dr.formattedDate !== expectedDoj) {
      diffs.push(`DOJ: db=${dr.formattedDate} vs xl=${expectedDoj} (raw xl: ${er.doj})`);
    }

    if (diffs.length > 0) {
      discrepancies.push({ empNo: er.empNo, name: er.empName, diffs });
    }
  }

  console.log('Discrepancies found:', discrepancies.length);
  if (discrepancies.length > 0) {
    console.log(JSON.stringify(discrepancies, null, 2));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
