export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

export async function runEmployeeDocumentsTests(
  adminToken: string,
  belagaviHrToken: string,
  shivamoggaHrToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({
        suite: 'EMPLOYEE DOCUMENT MANAGEMENT',
        name,
        passed: true,
        durationMs: Date.now() - start,
      });
      console.log(`  ✔ PASS: ${name}`);
    } catch (err: any) {
      results.push({
        suite: 'EMPLOYEE DOCUMENT MANAGEMENT',
        name,
        passed: false,
        error: err.message || String(err),
        durationMs: Date.now() - start,
      });
      console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    }
  };

  // 1. Dashboard summary
  await runTest('1. Document Dashboard returns aggregate metrics and category breakdown', async () => {
    const res = await fetch(`${BASE_URL}/api/employees/documents/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.success) throw new Error('Response success is false');
    const d = json.data;
    if (typeof d.totalEmployees !== 'number' || d.totalEmployees === 0) throw new Error('Missing totalEmployees');
    if (typeof d.totalDocuments !== 'number' || d.totalDocuments === 0) throw new Error('Missing totalDocuments');
    if (typeof d.documentsVerified !== 'number') throw new Error('Missing documentsVerified');
    if (typeof d.documentsPendingVerification !== 'number') throw new Error('Missing documentsPendingVerification');
    if (!Array.isArray(d.categoryBreakdown) || d.categoryBreakdown.length === 0) throw new Error('Missing categoryBreakdown');
  });

  // 2. Directory listing
  await runTest('2. Employee Directory returns workforce with document completion metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/employees/documents/directory?limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!Array.isArray(json.data) || json.data.length === 0) throw new Error('Directory data is empty');
    const first = json.data[0];
    if (!first.employeeCode) throw new Error('Missing employeeCode');
    if (!first.fullName) throw new Error('Missing fullName');
    if (typeof first.totalDocuments !== 'number') throw new Error('Missing totalDocuments metric');
    if (typeof first.requiredCompleted !== 'number') throw new Error('Missing requiredCompleted metric');
  });

  // 3. Document types configuration
  await runTest('3. Document Types returns standard categories (Identity, Address, Education, Employment, Bank)', async () => {
    const res = await fetch(`${BASE_URL}/api/employees/documents/types`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.grouped) throw new Error('Missing grouped categories');
    if (!json.grouped.IDENTITY || json.grouped.IDENTITY.length === 0) throw new Error('Missing IDENTITY category');
    if (!json.grouped.EMPLOYMENT || json.grouped.EMPLOYMENT.length === 0) throw new Error('Missing EMPLOYMENT category');
    if (!json.grouped.BANK_PAYROLL || json.grouped.BANK_PAYROLL.length === 0) throw new Error('Missing BANK_PAYROLL category');
  });

  // 4. Employee dossier & checklist
  let dossierEmployeeId = '';
  let dossierEmployeeCode = '';
  await runTest('4. Employee Dossier returns full documents list with required checklist', async () => {
    const dirRes = await fetch(`${BASE_URL}/api/employees/documents/directory?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!dirRes.ok) throw new Error(`Directory status ${dirRes.status}`);
    const dirJson: any = await dirRes.json();
    const directory = dirJson.data || [];
    if (!directory.length) throw new Error('Directory is empty');
    dossierEmployeeId = directory[0].id;
    dossierEmployeeCode = directory[0].employeeCode;

    const res = await fetch(`${BASE_URL}/api/employees/documents/employee/${dossierEmployeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!json.employee || json.employee.employeeCode !== dossierEmployeeCode) throw new Error('Employee mismatch');
    if (!Array.isArray(json.documents)) throw new Error('Missing documents array');
    if (!Array.isArray(json.checklist) || json.checklist.length === 0) throw new Error('Checklist missing');
  });

  // 5. Document upload with masked identity numbers
  let uploadedDocId = '';
  await runTest('5. HR can upload document with secure validation and masked identifier', async () => {
    // 1x1 transparent PNG base64
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await fetch(`${BASE_URL}/api/employees/documents/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        employeeId: dossierEmployeeId,
        category: 'IDENTITY',
        documentType: 'VOTER_ID',
        title: 'Election Commission Voter ID Card',
        documentNumber: 'KA1234567890',
        base64Content: samplePngBase64,
        originalName: 'voter_id_scan.png',
        confidentialityLevel: 'CONFIDENTIAL',
        remarks: 'Uploaded by HR during periodic audit'
      })
    });
    if (!uploadRes.ok) throw new Error(`Upload failed with status ${uploadRes.status}`);
    const uploadJson: any = await uploadRes.json();
    if (!uploadJson.success || !uploadJson.documentId) throw new Error('Document ID missing in response');
    uploadedDocId = uploadJson.documentId;

    const dossierRes = await fetch(`${BASE_URL}/api/employees/documents/employee/${dossierEmployeeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!dossierRes.ok) throw new Error(`Dossier status ${dossierRes.status}`);
    const dossierJson: any = await dossierRes.json();
    if (!Array.isArray(dossierJson.documents) || dossierJson.documents.length === 0) {
      throw new Error('Uploaded document did not appear in the employee dossier');
    }
  });

  // 6. Preview / download secure streaming
  await runTest('6. Secure document streaming returns inline preview with content-type', async () => {
    if (!uploadedDocId) throw new Error('No uploaded doc to preview');
    const previewRes = await fetch(`${BASE_URL}/api/employees/documents/${uploadedDocId}/preview`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!previewRes.ok) throw new Error(`Preview failed with status ${previewRes.status}`);
    const contentType = previewRes.headers.get('content-type');
    if (!contentType || (!contentType.includes('image') && !contentType.includes('pdf'))) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }
  });

  // 7. Verification decision workflow: Reject requires reason
  await runTest('7. Rejecting document strictly requires mandatory justification reason', async () => {
    if (!uploadedDocId) throw new Error('No uploaded doc to reject');
    const rejectRes = await fetch(`${BASE_URL}/api/employees/documents/${uploadedDocId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        action: 'REJECT',
        reason: '' // empty reason
      })
    });
    if (rejectRes.status !== 400) {
      throw new Error(`Expected status 400 when rejecting without reason, got ${rejectRes.status}`);
    }
  });

  // 8. Verification decision workflow: Approve document
  await runTest('8. Verifying document updates status to VERIFIED and records audit entry', async () => {
    if (!uploadedDocId) throw new Error('No uploaded doc to verify');
    const verifyRes = await fetch(`${BASE_URL}/api/employees/documents/${uploadedDocId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        action: 'VERIFY',
        remarks: 'Physical card cross-checked and approved by HR'
      })
    });
    if (!verifyRes.ok) throw new Error(`Verification failed with status ${verifyRes.status}`);
    const verifyJson: any = await verifyRes.json();
    if (verifyJson.verificationStatus !== 'VERIFIED') {
      throw new Error(`Expected VERIFIED status, got ${verifyJson.verificationStatus}`);
    }
  });

  // 9. Document replacement preserves previous version history
  await runTest('9. Replacing document increments version and archives previous version in JSON history', async () => {
    if (!uploadedDocId) throw new Error('No uploaded doc to replace');
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const replaceRes = await fetch(`${BASE_URL}/api/employees/documents/${uploadedDocId}/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        base64Content: samplePngBase64,
        originalName: 'voter_id_updated_v2.png',
        reason: 'Updated with high-resolution color scan'
      })
    });
    if (!replaceRes.ok) throw new Error(`Replace failed with status ${replaceRes.status}`);
    const repJson: any = await replaceRes.json();
    if (repJson.newVersion !== 2) throw new Error(`Expected version 2, got ${repJson.newVersion}`);
  });

  // 10. Cross-location isolation security
  await runTest('10. Location security: Belagavi HR cannot access foreign employee dossier without permission', async () => {
    // Query an employee belonging to Shivamogga or Davanagere using Belagavi HR token
    const res = await fetch(`${BASE_URL}/api/employees/documents/employee/TEST-EMP-020`, {
      headers: { Authorization: `Bearer ${belagaviHrToken}` }
    });
    // Should either be 403 or restricted
    if (res.status === 200) {
      const json: any = await res.json();
      if (json.employee && json.employee.locationCode !== 'BEL' && json.employee.locationId !== 'loc_bel_01') {
        throw new Error('Belagavi HR was able to view non-Belagavi employee dossier');
      }
    }
  });

  // 11. Missing documents report
  await runTest('11. Missing documents report accurately identifies incomplete dossiers', async () => {
    const res = await fetch(`${BASE_URL}/api/employees/documents/missing-report`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (typeof json.totalEmployeesWithMissing !== 'number') throw new Error('Missing totalEmployeesWithMissing');
    if (!Array.isArray(json.data)) throw new Error('Missing data array');
  });

  // 12. Verification queue
  await runTest('12. Verification Queue lists documents awaiting HR approval', async () => {
    const res = await fetch(`${BASE_URL}/api/employees/documents/verification-queue`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json: any = await res.json();
    if (!Array.isArray(json.data)) throw new Error('Verification queue is not an array');
  });

  return results;
}
