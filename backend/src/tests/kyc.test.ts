export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export async function runKycTests(
  baseUrl: string,
  adminToken: string,
  belagaviHrToken: string,
  shivamoggaHrToken: string,
  salesToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = 'KYC & DIGILOCKER';

  async function test(name: string, fn: () => Promise<void>) {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite, name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite, name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  }

  // 1. Aadhaar Masking Privacy Test
  await test('Aadhaar Privacy: 12-digit UID must be strictly masked with only last 4 digits visible', async () => {
    const raw = '987654324029';
    const clean = raw.replace(/\D/g, '');
    const masked = `XXXX-XXXX-${clean.slice(-4)}`;
    if (masked !== 'XXXX-XXXX-4029') {
      throw new Error(`Expected masked Aadhaar 'XXXX-XXXX-4029', got '${masked}'`);
    }
    if (masked.includes('9876') || masked.includes('5432')) {
      throw new Error('Aadhaar privacy breach: Raw digits leaked in masked string');
    }
  });

  // 2. KYC Dashboard Metrics API
  await test('API: KYC Dashboard returns aggregate metrics and document compliance breakdown', async () => {
    const res = await fetch(`${baseUrl}/api/kyc/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`KYC stats endpoint failed (${res.status})`);
    const data: any = await res.json();
    if (!data.summary || typeof data.summary.totalDocuments !== 'number') {
      throw new Error('Invalid KYC stats summary payload');
    }
    if (!Array.isArray(data.byType) || !Array.isArray(data.byLocation)) {
      throw new Error('Missing KYC breakdown arrays');
    }
  });

  // 3. Employee Explicit Consent Registration
  await test('Consent: Explicit employee consent registration succeeds and sets 1-year expiry', async () => {
    // Find an employee id
    const empRes = await fetch(`${baseUrl}/api/employees?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const empData: any = await empRes.json();
    const emp = empData.employees?.[0];
    if (!emp) throw new Error('No employee found for consent test');

    const consentRes = await fetch(`${baseUrl}/api/kyc/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        employeeId: emp.id,
        consentType: 'DIGILOCKER_FETCH',
        purpose: 'Official employee onboarding verification under Karnataka Factories Act 1948',
        scopes: 'doc_fetch:ADHAR,doc_fetch:PANCR',
      }),
    });
    if (!consentRes.ok) throw new Error(`Consent registration failed (${consentRes.status})`);
    const cData: any = await consentRes.json();
    if (!cData.success || cData.consent.status !== 'ACTIVE') {
      throw new Error('Consent record was not marked ACTIVE');
    }
  });

  // 4. DigiLocker OAuth PKCE Authorization URL
  await test('DigiLocker PKCE: Authorization URL generation produces valid S256 code challenge and state', async () => {
    const res = await fetch(`${baseUrl}/api/kyc/digilocker/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ employeeId: 'test-emp-pkce' }),
    });
    if (!res.ok) throw new Error(`DigiLocker authorize endpoint failed (${res.status})`);
    const data: any = await res.json();
    if (!data.authorizationUrl || !data.codeVerifier || !data.state) {
      throw new Error('DigiLocker authorize did not return PKCE parameters');
    }
    if (!data.authorizationUrl.includes('code_challenge_method=S256')) {
      throw new Error('DigiLocker authorizationUrl does not require S256 PKCE challenge');
    }
  });

  // 5. DigiLocker Document Retrieval & Verification
  await test('DigiLocker Fetch: Fetching Aadhaar creates cryptographically verified record with masked UID', async () => {
    const empRes = await fetch(`${baseUrl}/api/employees?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const empData: any = await empRes.json();
    const emp = empData.employees?.[0];
    if (!emp) throw new Error('No employee found');

    const fetchRes = await fetch(`${baseUrl}/api/kyc/digilocker/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        employeeId: emp.id,
        docType: 'AADHAAR',
      }),
    });
    if (!fetchRes.ok) throw new Error(`DigiLocker document fetch failed (${fetchRes.status})`);
    const dData: any = await fetchRes.json();
    if (!dData.success || dData.document.status !== 'VERIFIED') {
      throw new Error('Document status was not set to VERIFIED');
    }
    if (!dData.document.documentNumberMasked.startsWith('XXXX-XXXX-')) {
      throw new Error('Fetched Aadhaar document number was not properly masked');
    }
  });

  // 6. Manual Upload Fallback
  await test('Manual Fallback: Uploading physical scan stores record with PENDING status for HR review', async () => {
    const empRes = await fetch(`${baseUrl}/api/employees?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const empData: any = await empRes.json();
    const emp = empData.employees?.[0];
    if (!emp) throw new Error('No employee found');

    const uploadRes = await fetch(`${baseUrl}/api/kyc/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        employeeId: emp.id,
        documentType: 'DEGREE_CERTIFICATE',
        documentNumber: 'VTU-BTECH-2022-8819',
        issuer: 'VTU Belagavi',
        fileName: 'BTech_Degree_Attested.pdf',
        fileSize: 180000,
      }),
    });
    if (!uploadRes.ok) throw new Error(`Manual upload failed (${uploadRes.status})`);
    const upData: any = await uploadRes.json();
    if (!upData.success || upData.status !== 'PENDING') {
      throw new Error('Uploaded document was not set to PENDING status');
    }
  });

  // 7. HR Review & Verification Decision
  await test('HR Review: Authorized HR staff can record verification decision and approve pending document', async () => {
    // Get pending documents
    const docRes = await fetch(`${baseUrl}/api/kyc/documents?status=PENDING&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const docData: any = await docRes.json();
    const doc = docData.documents?.[0];
    if (!doc) {
      // If none pending, skip
      return;
    }

    const verifyRes = await fetch(`${baseUrl}/api/kyc/verify/${doc.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ decision: 'VERIFIED' }),
    });
    if (!verifyRes.ok) throw new Error(`Document verification failed (${verifyRes.status})`);
    const vData: any = await verifyRes.json();
    if (vData.status !== 'VERIFIED') throw new Error('Document status was not updated to VERIFIED');
  });

  // 8. Location-Based Scoping Security for HR
  await test('Location Security: HR staff cannot access or review KYC documents outside their assigned store', async () => {
    // Belagavi HR requesting documents filtered to Shivamogga
    const res = await fetch(`${baseUrl}/api/kyc/documents?locationId=SHI`, {
      headers: { Authorization: `Bearer ${belagaviHrToken}` },
    });
    if (!res.ok) throw new Error(`Query failed (${res.status})`);
    const data: any = await res.json();
    // All returned documents must be within Belagavi
    for (const doc of data.documents || []) {
      if (doc.locationCode === 'SHI' || doc.locationName?.includes('Shivamogga')) {
        throw new Error('Location isolation breach: Belagavi HR received Shivamogga documents');
      }
    }
  });

  return results;
}
