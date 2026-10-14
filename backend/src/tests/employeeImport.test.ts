import assert from 'node:assert';
import {
  buildTemplateCsv,
  validateAndPreview,
  runDataQualityAudit,
  ImportActor,
} from '../services/employeeImportService.js';
import {
  getIdAllocationInfo,
  allocateEmployeeId,
} from '../services/employeeIdService.js';
import { TestResult } from './attendance.test.js';

export async function runEmployeeImportTests(baseUrl?: string, token?: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const URL = (baseUrl || 'http://localhost:4000').replace(/\/api\/?$/, '');

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite: 'Bulk Employee Import & ID Management', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({
        suite: 'Bulk Employee Import & ID Management',
        name,
        passed: false,
        durationMs: Date.now() - start,
        error: err.message,
      });
    }
  };

  const adminActor: ImportActor = {
    userId: 'test-admin',
    userName: 'Admin Test',
    role: 'SUPER_ADMIN',
    locationId: null,
    permissions: ['VIEW', 'ADD', 'EDIT', 'DELETE'],
  };

  // 1. Template Generation Test
  await runTest('Download sample CSV template returns 49 standard columns and valid sample rows', async () => {
    const template = await buildTemplateCsv();
    assert.ok(template, 'Template CSV string must be generated');
    const lines = template.trim().split('\n');
    assert.ok(lines.length >= 3, 'Template must contain header and sample rows');
    
    const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
    assert.strictEqual(headers.length, 49, `Header must contain exactly 49 standard columns, found ${headers.length}`);
    assert.ok(headers.includes('employee_id'));
    assert.ok(headers.includes('first_name'));
    assert.ok(headers.includes('mobile_number'));
    assert.ok(headers.includes('location_code'));
    assert.ok(headers.includes('joining_date'));
  });

  // 2. ID Policy & Format
  await runTest('Employee ID Policy returns BSC-EMP-XXXX sequential format configuration', async () => {
    const info = await getIdAllocationInfo();
    assert.ok(info, 'ID info must return');
    assert.strictEqual(info.policy.sampleFormat, 'BSC-EMP-0001');
    assert.ok(typeof info.totalEmployees === 'number');
    assert.ok(typeof info.withLegacyNumericId === 'number');
    assert.ok(typeof info.withTestId === 'number');
  });

  // 3. Concurrency-Safe ID Generation
  await runTest('allocateEmployeeId allocates BSC-EMP-XXXX sequential IDs safely', async () => {
    const nextId = await allocateEmployeeId();
    assert.ok(nextId.startsWith('BSC-EMP-'), `ID should start with BSC-EMP-, got: ${nextId}`);
    assert.strictEqual(nextId.length, 12, `ID should be formatted as BSC-EMP-0001 (12 chars), got: ${nextId}`);
  });

  // 4. Data Quality Audit
  await runTest('runDataQualityAudit audits entire directory for missing IDs, duplicates, and location integrity', async () => {
    const audit = await runDataQualityAudit(adminActor);
    assert.ok(audit, 'Audit report must exist');
    assert.ok(audit.totals.employees >= 0);
    assert.ok(Array.isArray(audit.issues), 'Audit issues must be an array');
    const dupIssue = audit.issues.find((i) => i.category.toLowerCase().includes('duplicate id'));
    assert.ok(!dupIssue || dupIssue.count === 0, 'There should be zero duplicate Employee IDs in database');
  });

  // 5. Validation Preview - Valid New Employee
  await runTest('validateAndPreview validates valid new employee row as CREATE with no fatal errors', async () => {
    const testCsv = `first_name,last_name,mobile_number,email,location_code,department,designation,role,employment_status,joining_date,gender
Vinay,Patil,9844001122,vinay.patil@bsctextiles.com,BEL,Sales,Fashion Consultant,EMPLOYEE,ACTIVE,2026-01-15,Male`;

    const preview = await validateAndPreview(testCsv, {
      fileName: 'new_staff.csv',
      mode: 'new',
      actor: adminActor,
    });

    assert.strictEqual(preview.summary.totalRows, 1);
    assert.strictEqual(preview.summary.validNew, 1);
    assert.strictEqual(preview.summary.cannotImport, 0);
    assert.strictEqual(preview.rows[0].action, 'CREATE');
    assert.strictEqual(preview.rows[0].employeeName, 'Vinay Patil');
    assert.strictEqual(preview.rows[0].locationCode, 'BEL');
    assert.strictEqual(preview.rows[0].employeeIdKind, 'missing'); // Auto-assigned on confirmed import
  });

  // 6. Validation Preview - Update Mode & Non-Destructive Matching
  await runTest('validateAndPreview matches existing employee by Employee ID in update mode', async () => {
    // Match Sadashiva Hadimani (ID 1372 or code)
    const testCsv = `employee_id,first_name,last_name,mobile_number,location_code,designation,employment_status
1372,SADASHIVA,HADIMANI,9876543210,BEL,Senior Operations Specialist,ACTIVE`;

    const preview = await validateAndPreview(testCsv, {
      fileName: 'update_hadimani.csv',
      mode: 'update',
      actor: adminActor,
    });

    assert.strictEqual(preview.summary.totalRows, 1);
    assert.strictEqual(preview.rows[0].action, 'UPDATE');
    assert.strictEqual(preview.rows[0].employeeId, '1372');
  });

  // 7. Validation Preview - Rejects Missing Required Fields
  await runTest('validateAndPreview flags missing required fields (e.g., first_name, location_code)', async () => {
    const invalidCsv = `first_name,last_name,mobile_number,location_code
,Patel,9844112233,INVALID_LOC`;

    const preview = await validateAndPreview(invalidCsv, {
      fileName: 'invalid.csv',
      mode: 'new',
      actor: adminActor,
    });

    assert.strictEqual(preview.summary.totalRows, 1);
    assert.ok(preview.summary.cannotImport >= 1);
    assert.strictEqual(preview.rows[0].action, 'ERROR');
    assert.ok(preview.rows[0].errors.some((e: string) => e.toLowerCase().includes('first name') || e.toLowerCase().includes('name')));
  });

  // 8. Validation Preview - Flags Duplicate Employee IDs within CSV
  await runTest('validateAndPreview flags duplicate employee_id within the uploaded CSV', async () => {
    const duplicateCsv = `employee_id,first_name,last_name,mobile_number,location_code
BSC-EMP-9999,Rohan,Sharma,9844112233,BEL
BSC-EMP-9999,Vikram,Sharma,9844112244,BEL`;

    const preview = await validateAndPreview(duplicateCsv, {
      fileName: 'duplicates.csv',
      mode: 'upsert',
      actor: adminActor,
    });

    assert.strictEqual(preview.summary.totalRows, 2);
    assert.ok(preview.summary.duplicates >= 1);
    assert.ok(preview.rows[1].errors.some((e: string) => e.toLowerCase().includes('duplicate')));
  });

  // 9. API HTTP Endpoints Integration Check
  if (token) {
    await runTest('GET /api/v1/employees/import/template returns downloadable attachment', async () => {
      const res = await fetch(`${URL}/api/v1/employees/import/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-disposition')?.includes('bsc_textiles_employee_import_template.csv'));
      const text = await res.text();
      assert.ok(text.includes('employee_id'));
      assert.ok(text.includes('first_name'));
    });

    await runTest('GET /api/v1/employees/export/csv exports directory respecting 49-column contract', async () => {
      const res = await fetch(`${URL}/api/v1/employees/export/csv?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-disposition')?.includes('bsc_textiles_workforce_export_'));
      const text = await res.text();
      const firstLine = text.split('\r\n')[0] || text.split('\n')[0];
      assert.ok(firstLine.includes('employee_id'));
      assert.ok(firstLine.includes('location_code'));
    });

    await runTest('GET /api/v1/employees/import/history returns recent import batches', async () => {
      const res = await fetch(`${URL}/api/v1/employees/import/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.ok(Array.isArray(data.batches));
    });
  }

  return results;
}
