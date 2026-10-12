import axios from 'axios';

async function runTest() {
  const BASE_URL = 'http://localhost:4000/api';

  console.log('--- 1. Testing RBAC Access Restriction on Floor Overview ---');
  // Floor manager login (Amit Patel)
  const floorMgrLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'amit.patel@bsctextiles.com',
    password: 'password123'
  });
  const floorMgrToken = floorMgrLogin.data.token;
  console.log('Logged in as Floor Manager:', floorMgrLogin.data.user.fullName, 'Role:', floorMgrLogin.data.user.role);

  try {
    await axios.get(`${BASE_URL}/payroll/floor-salary-overview`, {
      headers: { Authorization: `Bearer ${floorMgrToken}` }
    });
    console.error('FAIL: Floor manager should NOT have access!');
    process.exit(1);
  } catch (err: any) {
    if (err.response?.status === 403) {
      console.log('PASS: Access correctly denied for Floor Manager (Status 403 Forbidden).');
      console.log('Error message:', err.response?.data?.error);
    } else {
      console.error('Unexpected error status:', err.response?.status, err.message);
      process.exit(1);
    }
  }

  console.log('\n--- 2. Testing Authorized HR Access (Kavita Bhat) ---');
  const hrLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'kavita.bhat@bsctextiles.com',
    password: 'password123'
  });
  const hrToken = hrLogin.data.token;
  console.log('Logged in as HR:', hrLogin.data.user.fullName, 'Role:', hrLogin.data.user.role);

  const overviewRes = await axios.get(`${BASE_URL}/payroll/floor-salary-overview`, {
    headers: { Authorization: `Bearer ${hrToken}` },
    params: { month: 'Aug', year: 2026 }
  });

  const data = overviewRes.data;
  console.log('\nOverall Summary:');
  console.log('  Total Locations:', data.overallSummary.totalLocations);
  console.log('  Total Floors:', data.overallSummary.totalFloors);
  console.log('  Total Staff:', data.overallSummary.totalEmployees);
  console.log('  Total Gross:', '₹' + data.overallSummary.totalGrossSalary.toLocaleString());
  console.log('  Total Deductions:', '₹' + data.overallSummary.totalDeductions.toLocaleString());
  console.log('  Total Net Payable:', '₹' + data.overallSummary.totalNetPayable.toLocaleString());
  console.log('  Total Employer Contributions:', '₹' + data.overallSummary.totalEmployerContrib.toLocaleString());
  console.log('  Total CTC:', '₹' + data.overallSummary.totalCtc.toLocaleString());

  console.log('\nLocation & Floor Breakdown:');
  for (const loc of data.locations) {
    console.log(`\n▶ Showroom: [${loc.code}] ${loc.name} (${loc.city}) - Staff: ${loc.summary.totalEmployees}, Gross: ₹${loc.summary.totalGrossSalary.toLocaleString()}`);
    for (const fl of loc.floors) {
      const mgr = fl.floorManager ? `${fl.floorManager.fullName} (EMP: ${fl.floorManager.employeeCode})` : 'Unassigned';
      console.log(`   └─ Floor ${fl.floorNumber}: ${fl.name} | Mgr: ${mgr} | Staff: ${fl.summary.totalEmployees} | Net: ₹${fl.summary.totalNetPayable.toLocaleString()} | Employer Contrib: ₹${fl.summary.totalEmployerContrib.toLocaleString()}`);
      if (fl.sections.length > 0) {
        console.log(`      Sections: ${fl.sections.map((s: any) => `${s.name} (${s.employeeCount} staff)`).join(', ')}`);
      }
    }
  }

  console.log('\n--- 3. Testing Location Filter (DAV only) ---');
  const davRes = await axios.get(`${BASE_URL}/payroll/floor-salary-overview`, {
    headers: { Authorization: `Bearer ${hrToken}` },
    params: { locationCode: 'DAV', month: 'Aug', year: 2026 }
  });
  console.log('DAV Location Result Count:', davRes.data.locations.length, 'Code:', davRes.data.locations[0]?.code);
  console.log('DAV Floors Count:', davRes.data.locations[0]?.floors.length);

  console.log('\nALL BACKEND API TESTS PASSED SUCCESSFULLY!');
}

runTest().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err.response?.data || err.message);
  process.exit(1);
});
