import { runEmployeeDocumentsTests } from './employeeDocuments.test.js';
import { loginWithRetry } from './testAuth.js';

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

async function loginUser(email: string, password = 'password123'): Promise<string> {
  return loginWithRetry(email, password, { baseUrl: BASE_URL });
}

async function main() {
  console.log('--- Testing Employee Document Management Suite ---');
  const adminToken = await loginUser('admin@bsctextiles.com');
  const belagaviHrToken = await loginUser('rbac.hr@bsctextiles.com');
  const shivamoggaHrToken = await loginUser('vikram.singh@bsctextiles.com');
  console.log('Authenticated personas.');

  const results = await runEmployeeDocumentsTests(adminToken, belagaviHrToken, shivamoggaHrToken);
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
    console.log('All 12 Employee Document Management test specifications PASSED perfectly!');
  }
}

main().catch(console.error);
