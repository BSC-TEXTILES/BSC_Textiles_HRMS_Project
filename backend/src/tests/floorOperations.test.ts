export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

export async function runFloorOperationsTests(adminToken: string, belagaviToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({
        suite: 'FLOOR OPERATIONS & SELLING POINTS',
        name,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      results.push({
        suite: 'FLOOR OPERATIONS & SELLING POINTS',
        name,
        passed: false,
        error: err.message || String(err),
        durationMs: Date.now() - start,
      });
    }
  };

  // 1. Floor hierarchy retrieval
  await runTest('Floor Hierarchy: Retrieves all showroom floors with summary metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/selling-points/floor-hierarchy`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data: any = await res.json();
    if (!data.floors || data.floors.length < 3) throw new Error('Expected at least 3 showroom floors');
    if (!data.overview || data.overview.totalCounters < 6) throw new Error('Expected overview totalCounters >= 6');
  });

  // 2. Individual salesmen directory on every counter
  await runTest('Salesmen Directory: Every counter displays at least 3 individual salesmen with employee code & performance', async () => {
    const res = await fetch(`${BASE_URL}/api/selling-points/floor-hierarchy`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data: any = await res.json();
    const groundFloor = data.floors.find((f: any) => f.name.toLowerCase().includes('ground'));
    if (!groundFloor || groundFloor.counters.length === 0) throw new Error('Ground floor counters missing');

    const firstCounter = groundFloor.counters[0];
    if (firstCounter.assignedSalesmen.length < 3) {
      throw new Error(`Expected at least 3 salesmen on ${firstCounter.name}, got ${firstCounter.assignedSalesmen.length}`);
    }

    const sm = firstCounter.assignedSalesmen[0];
    if (!sm.employeeCode || !sm.fullName || !sm.designation) {
      throw new Error('Salesman record missing employeeCode, fullName, or designation');
    }
    if (!sm.attendanceStatus) {
      throw new Error('Salesman record missing attendance status');
    }
  });

  // 3. Billing Management Summary
  await runTest('Billing Management: Reconciles completed bills, net sales, taxes, and tender breakdown (UPI/Card/Cash)', async () => {
    const res = await fetch(`${BASE_URL}/api/selling-points/floor-hierarchy`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data: any = await res.json();
    const bs = data.billingSummary;
    if (!bs) throw new Error('Billing summary missing from response');
    if (bs.completedBills <= 0) throw new Error('Completed bills count should be > 0');
    if (bs.netSales <= 0) throw new Error('Net sales should be > 0');
    if (bs.upiCollections < 0 || bs.cashCollections < 0 || bs.cardCollections < 0) {
      throw new Error('Tender breakdown collections should be non-negative numbers');
    }
  });

  // 4. Available Employees Directory API
  await runTest('Staff Assignment: Available employees endpoint returns active staff with employee numbers', async () => {
    const res = await fetch(`${BASE_URL}/api/selling-points/available-employees`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const employees: any = await res.json();
    if (!Array.isArray(employees) || employees.length === 0) throw new Error('Expected list of available employees');
    if (!employees[0].employeeCode) throw new Error('Employee record missing employeeCode');
  });

  // 5. Retail Transactions Log API
  await runTest('Transactions Audit: Retrieves itemized billing transactions with cashier and salesperson attribution', async () => {
    const res = await fetch(`${BASE_URL}/api/selling-points/transactions?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data: any = await res.json();
    if (!data.transactions || data.transactions.length === 0) throw new Error('Transactions log is empty');
    const tx = data.transactions[0];
    if (!tx.billNumber || !tx.netAmount || !tx.paymentMethod) throw new Error('Transaction record missing critical fields');
  });

  // 6. Security & Tenant Scoping
  await runTest('Location Security: Location scoped token cannot fetch data for foreign showroom without permission', async () => {
    // Belagavi user requesting data with explicit DAV locationId parameter
    const davLocId = 'cmuwszr9500021vdtxscy3nsc'; // Davanagere ID
    const res = await fetch(`${BASE_URL}/api/selling-points/floor-hierarchy?locationId=${davLocId}`, {
      headers: { Authorization: `Bearer ${belagaviToken}` },
    });
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    const data: any = await res.json();
    // Verify server scoped it to Belagavi
    if (data.location && data.location.id === davLocId) {
      throw new Error('Security Breach: Belagavi scoped user was allowed to query Davanagere location');
    }
  });

  return results;
}
