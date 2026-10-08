async function testAll() {
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bsctextiles.com', password: 'password123' })
  });
  const { token } = await loginRes.json();
  const headers = { Authorization: 'Bearer ' + token };

  const endpoints = [
    '/reports/dashboard-summary',
    '/employees?limit=10',
    '/locations/all',
    '/departments',
    '/attendance?limit=10',
    '/breaks/active',
    '/breaks/rules',
    '/face-verification/records?limit=10',
    '/face-verification/stats',
    '/incentives/rules',
    '/payroll/runs',
    '/users?limit=10',
    '/roles',
    '/settings',
    '/audit/logs?limit=10',
    '/live-streams'
  ];

  console.log('Testing major backend API endpoints:');
  for (const ep of endpoints) {
    try {
      const res = await fetch('http://localhost:4000/api' + ep, { headers });
      const statusIcon = res.status === 200 ? '✅' : '❌';
      console.log(`  ${statusIcon} [${res.status}] ${ep}`);
      if (res.status !== 200) {
        const text = await res.text();
        console.log('     Response:', text.substring(0, 150));
      }
    } catch (e) {
      console.log(`  ❌ [FAIL] ${ep}: ${e.message}`);
    }
  }
}

testAll().catch(console.error);
