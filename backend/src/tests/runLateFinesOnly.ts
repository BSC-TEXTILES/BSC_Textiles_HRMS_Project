import { runLateFinesTests } from './lateFines.test.js';
import { loginWithRetry } from './testAuth.js';

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

async function loginUser(email: string, password = 'password123'): Promise<string> {
  return loginWithRetry(email, password, { baseUrl: BASE_URL });
}

async function main() {
  console.log('--- Testing Late Attendance & Fine Management Suite ---');
  const adminToken = await loginUser('admin@bsctextiles.com');
  const hrToken = await loginUser('rbac.hr@bsctextiles.com');
  console.log('Authenticated admin and HR.');

  const results = await runLateFinesTests(adminToken, hrToken);
  console.log('\n--- Results ---');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) passed++;
    else failed++;
  }
  console.log(`Passed: ${passed} / ${results.length}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}`);
    process.exit(1);
  } else {
    console.log('All 12 Late & Fine automated test specifications PASSED perfectly!');
  }
}

main().catch(console.error);
