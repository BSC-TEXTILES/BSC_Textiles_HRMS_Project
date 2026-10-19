import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://localhost:4000';
const FRONTEND_BASE = 'http://localhost:3000';

interface CheckResult {
  section: string;
  endpoint: string;
  method: string;
  status: number;
  ok: boolean;
  notes?: string;
}

async function runVerification() {
  console.log('========================================================================');
  console.log('🔍 BSC TEXTILES HRMS — FULL PLATFORM INTEGRITY & 200 OK VERIFICATION');
  console.log('========================================================================\n');

  const results: CheckResult[] = [];

  // 1. Authenticate to get Bearer Token
  let token = '';
  let sampleEmployeeId = '';
  try {
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@bsctextiles.com', password: 'password123' }),
    });
    const loginData: any = await loginRes.json();
    token = loginData.token || '';
    results.push({
      section: 'Authentication',
      endpoint: '/api/auth/login',
      method: 'POST',
      status: loginRes.status,
      ok: loginRes.status === 200,
      notes: loginData.user?.role ? `Authenticated as ${loginData.user.role}` : 'Login OK',
    });
  } catch (err: any) {
    results.push({
      section: 'Authentication',
      endpoint: '/api/auth/login',
      method: 'POST',
      status: 0,
      ok: false,
      notes: err.message,
    });
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Fetch sample employee ID for contextual sub-routes
  try {
    const empRes = await fetch(`${API_BASE}/api/v1/employees?page=1&limit=1`, { headers: authHeaders });
    const empData: any = await empRes.json();
    if (empData.employees && empData.employees.length > 0) {
      sampleEmployeeId = empData.employees[0].id;
    }
  } catch (e) {
    // fallback
  }

  // 2. Comprehensive Test Endpoints List across All Sections
  const testCases: Array<{
    section: string;
    url: string;
    method?: string;
    headers?: Record<string, string>;
    expectedStatus?: number;
  }> = [
    // System & Health
    { section: 'System Health', url: `${API_BASE}/health` },
    { section: 'System Health', url: `${API_BASE}/api/health` },
    { section: 'System Readiness', url: `${API_BASE}/ready` },
    { section: 'System Readiness', url: `${API_BASE}/api/ready` },
    { section: 'OpenAPI Documentation', url: `${API_BASE}/api/docs/` },

    // Workforce Directory & Employees
    { section: 'Workforce Master', url: `${API_BASE}/api/v1/employees?page=1&limit=10`, headers: authHeaders },
    { section: 'Workforce Bulk Import Template', url: `${API_BASE}/api/v1/employees/import/template`, headers: authHeaders },
    { section: 'Workforce Import History', url: `${API_BASE}/api/v1/employees/import/history`, headers: authHeaders },
    { section: 'Workforce ID Policy', url: `${API_BASE}/api/v1/employees/import/id-policy`, headers: authHeaders },
    { section: 'Workforce Data Quality Audit', url: `${API_BASE}/api/v1/employees/import/data-quality`, headers: authHeaders },
    { section: 'Workforce Column Guide', url: `${API_BASE}/api/v1/employees/import/columns`, headers: authHeaders },
    { section: 'Workforce Live Data Export (49-Col)', url: `${API_BASE}/api/v1/employees/export/csv`, headers: authHeaders },

    // HR Workforce Analytics & Telemetry
    { section: 'HR Analytics Summary', url: `${API_BASE}/api/v1/analysis/summary?preset=today`, headers: authHeaders },
    { section: 'HR Analytics Connected Dots', url: `${API_BASE}/api/v1/analysis/timeline?preset=today`, headers: authHeaders },
    { section: 'HR Analytics Hourly Distribution', url: `${API_BASE}/api/v1/analysis/hourly?preset=today`, headers: authHeaders },
    { section: 'HR Analytics Punctuality Trends', url: `${API_BASE}/api/v1/analysis/punctuality?preset=today`, headers: authHeaders },
    { section: 'HR Analytics Hub Comparison', url: `${API_BASE}/api/v1/analysis/locations?preset=today`, headers: authHeaders },
    { section: 'HR Analytics Long-Term History', url: `${API_BASE}/api/v1/analysis/history-tenure?preset=30d`, headers: authHeaders },
    { section: 'HR Analytics Employee Deep Dive', url: `${API_BASE}/api/v1/analysis/employee/${sampleEmployeeId || '1'}?preset=today`, headers: authHeaders },
    { section: 'HR Analytics Drilldown Records', url: `${API_BASE}/api/v1/analysis/drilldown?type=all_employees`, headers: authHeaders },

    // Organization Topology (Hubs, Departments, Shifts)
    { section: 'Organization Retail Hubs', url: `${API_BASE}/api/v1/locations`, headers: authHeaders },
    { section: 'Organization Departments', url: `${API_BASE}/api/v1/departments`, headers: authHeaders },
    { section: 'Organization Shifts', url: `${API_BASE}/api/v1/shifts`, headers: authHeaders },
    { section: 'Organization Floors', url: `${API_BASE}/api/v1/floors`, headers: authHeaders },

    // Attendance & Punches
    { section: 'Attendance Master', url: `${API_BASE}/api/v1/attendance?page=1&limit=10`, headers: authHeaders },
    { section: 'Attendance Breaks', url: `${API_BASE}/api/v1/breaks?page=1&limit=10`, headers: authHeaders },

    // Payroll Operations
    { section: 'Payroll Runs Master', url: `${API_BASE}/api/v1/payroll/runs?page=1&limit=10`, headers: authHeaders },
    { section: 'Payroll Salary Structures', url: `${API_BASE}/api/v1/payroll/salary-structures`, headers: authHeaders },

    // Compliance, KYC & Former Employees
    { section: 'KYC & DigiLocker Compliance', url: `${API_BASE}/api/v1/kyc/stats`, headers: authHeaders },
    { section: 'Former Staff & F&F Settlement', url: `${API_BASE}/api/v1/exits/stats`, headers: authHeaders },
    { section: 'Former Employees Master', url: `${API_BASE}/api/v1/exits/former-employees?page=1&limit=10`, headers: authHeaders },

    // Frontend Next.js Public & Auth Endpoints
    { section: 'Frontend Login Page', url: `${FRONTEND_BASE}/login` },
    { section: 'Frontend Root Redirection', url: `${FRONTEND_BASE}/`, expectedStatus: 200 },
    { section: 'Frontend NextAuth CSRF', url: `${FRONTEND_BASE}/api/auth/csrf` },
    { section: 'Frontend NextAuth Providers', url: `${FRONTEND_BASE}/api/auth/providers` },
  ];

  for (const tc of testCases) {
    const method = tc.method || 'GET';
    try {
      const res = await fetch(tc.url, {
        method,
        headers: tc.headers,
        redirect: 'follow',
      });
      const expected = tc.expectedStatus || 200;
      const isOk = res.status === expected;
      results.push({
        section: tc.section,
        endpoint: tc.url.replace(API_BASE, '').replace(FRONTEND_BASE, 'frontend:'),
        method,
        status: res.status,
        ok: isOk,
        notes: isOk ? 'Verified 200 OK' : `Expected ${expected}, got ${res.status}`,
      });
    } catch (err: any) {
      results.push({
        section: tc.section,
        endpoint: tc.url.replace(API_BASE, '').replace(FRONTEND_BASE, 'frontend:'),
        method,
        status: 0,
        ok: false,
        notes: `Network error: ${err.message}`,
      });
    }
  }

  // Summary Table
  console.log('| Status | Section | Method | Endpoint | HTTP Code | Notes |');
  console.log('|---|---|---|---|---|---|');
  let passed = 0;
  for (const r of results) {
    const mark = r.ok ? '✅ 200 OK' : '❌ FAIL';
    console.log(`| ${mark} | ${r.section} | ${r.method} | ${r.endpoint} | ${r.status} | ${r.notes || ''} |`);
    if (r.ok) passed++;
  }

  console.log(`\nResults: ${passed}/${results.length} endpoints returned 200 OK (${((passed / results.length) * 100).toFixed(1)}%)`);

  if (passed === results.length) {
    console.log('\n🎉 ALL 100% OF SECTIONS AND ENDPOINTS ARE FULLY OPERATIONAL AND RETURNING 200 OK!');
  } else {
    console.log('\n⚠️ Some endpoints failed. Review table above.');
  }
}

runVerification().catch(console.error);
