/**
 * BSC Textiles HRMS — API Performance & Latency Benchmark Runner
 * Measures P50, P95, P99, Min, Max, and Throughput across core endpoints
 */

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:4000';

interface MetricResult {
  endpoint: string;
  category: string;
  targetP95: number;
  totalRequests: number;
  successRate: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
  rps: number;
  targetMet: boolean;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Number(sorted[Math.max(0, Math.min(index, sorted.length - 1))].toFixed(2));
}

async function benchmarkEndpoint(
  name: string,
  category: string,
  targetP95: number,
  path: string,
  token: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any,
  iterations = 40,
  concurrency = 4
): Promise<MetricResult> {
  const timings: number[] = [];
  let successful = 0;
  let failed = 0;

  // Warmup requests
  for (let w = 0; w < 3; w++) {
    try {
      await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {}
  }

  const overallStart = process.hrtime.bigint();

  // Run batches
  const batches = Math.ceil(iterations / concurrency);
  for (let b = 0; b < batches; b++) {
    const promises: Promise<void>[] = [];
    const countInBatch = Math.min(concurrency, iterations - b * concurrency);

    for (let c = 0; c < countInBatch; c++) {
      promises.push((async () => {
        const start = process.hrtime.bigint();
        try {
          const res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          const end = process.hrtime.bigint();
          const ms = Number(end - start) / 1_000_000;
          timings.push(ms);
          if (res.ok) {
            successful++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      })());
    }
    await Promise.all(promises);
  }

  const overallEnd = process.hrtime.bigint();
  const overallSec = Number(overallEnd - overallStart) / 1_000_000_000;

  timings.sort((a, b) => a - b);
  const min = Number((timings[0] || 0).toFixed(2));
  const max = Number((timings[timings.length - 1] || 0).toFixed(2));
  const avg = Number((timings.reduce((sum, v) => sum + v, 0) / (timings.length || 1)).toFixed(2));
  const p50 = calculatePercentile(timings, 50);
  const p95 = calculatePercentile(timings, 95);
  const p99 = calculatePercentile(timings, 99);
  const rps = Number((iterations / (overallSec || 0.001)).toFixed(1));

  return {
    endpoint: name,
    category,
    targetP95,
    totalRequests: iterations,
    successRate: Number(((successful / iterations) * 100).toFixed(1)),
    min,
    p50,
    p95,
    p99,
    max,
    avg,
    rps,
    targetMet: p95 <= targetP95,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('⚡ BSC TEXTILES HRMS — API PERFORMANCE BENCHMARK & LATENCY AUDIT');
  console.log('========================================================================');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);

  // 1. Authenticate to get benchmark token
  const authStart = process.hrtime.bigint();
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bsctextiles.com', password: 'password123' }),
  });
  const authEnd = process.hrtime.bigint();
  const authDuration = Number(authEnd - authStart) / 1_000_000;

  if (!loginRes.ok) {
    console.error('Failed to authenticate benchmark persona:', await loginRes.text());
    process.exit(1);
  }
  const { token } = (await loginRes.json()) as any;
  console.log(`Authentication verified in ${authDuration.toFixed(2)} ms. Starting benchmark...\n`);

  const results: MetricResult[] = [];

  const endpointsToTest: Array<{
    name: string;
    category: string;
    targetP95: number;
    path: string;
    method?: 'GET' | 'POST';
    body?: any;
    iterations?: number;
    concurrency?: number;
  }> = [
    { name: 'GET /health', category: 'Health & Diagnostics', targetP95: 50, path: '/health', iterations: 50 },
    { name: 'GET /api/health', category: 'Health & Diagnostics', targetP95: 50, path: '/api/health', iterations: 50 },
    { name: 'GET /api/locations/all', category: 'Reference & Config', targetP95: 100, path: '/api/locations/all', iterations: 40 },
    { name: 'GET /api/departments', category: 'Reference & Config', targetP95: 100, path: '/api/departments', iterations: 40 },
    { name: 'GET /api/shifts', category: 'Reference & Config', targetP95: 100, path: '/api/shifts', iterations: 40 },
    { name: 'GET /api/holidays', category: 'Reference & Config', targetP95: 100, path: '/api/holidays?limit=50', iterations: 40 },
    { name: 'GET /api/employees/lookup', category: 'Lightweight Reference Read', targetP95: 50, path: '/api/employees/lookup', iterations: 40 },
    { name: 'GET /api/employees', category: 'Database Read (Indexed)', targetP95: 100, path: '/api/employees?limit=20', iterations: 40 },
    { name: 'GET /api/attendance', category: 'Database Read (Indexed)', targetP95: 100, path: '/api/attendance?limit=16', iterations: 40 },
    { name: 'GET /api/face-verification', category: 'Database Read (Indexed)', targetP95: 100, path: '/api/face-verification?limit=16', iterations: 40 },
    { name: 'GET /api/qr-codes/scans', category: 'Database Read (Indexed)', targetP95: 100, path: '/api/qr-codes/scans?limit=16', iterations: 40 },
    { name: 'GET /api/breaks', category: 'Database Read (Indexed)', targetP95: 100, path: '/api/breaks?limit=16', iterations: 40 },
    { name: 'GET /api/incentives/transactions', category: 'Database Read (Indexed)', targetP95: 100, path: '/api/incentives/transactions?limit=16', iterations: 40 },
    { name: 'GET /api/reports/dashboard-summary', category: 'Dashboard Summary', targetP95: 100, path: '/api/reports/dashboard-summary', iterations: 40 },
    {
      name: 'POST /api/auth/login',
      category: 'Authentication (Argon2id)',
      targetP95: 250, // Password hashing intentionally cost-calibrated
      path: '/api/auth/login',
      method: 'POST',
      body: { email: 'admin@bsctextiles.com', password: 'password123' },
      iterations: 20,
      concurrency: 2,
    },
  ];

  for (const ep of endpointsToTest) {
    process.stdout.write(`Benchmarking ${ep.name}... `);
    const res = await benchmarkEndpoint(
      ep.name,
      ep.category,
      ep.targetP95,
      ep.path,
      token,
      ep.method || 'GET',
      ep.body,
      ep.iterations || 40,
      ep.concurrency || 4
    );
    results.push(res);
    console.log(`P50: ${res.p50}ms | P95: ${res.p95}ms | RPS: ${res.rps} | ${res.targetMet ? '✅ PASS' : '⚠️ TARGET MISSED'}`);
  }

  console.log('\n========================================================================');
  console.log('📊 BENCHMARK LATENCY REPORT (TABULAR FORMAT)');
  console.log('========================================================================\n');
  console.log('| Endpoint | Category | Target P95 | Min | P50 | P95 | P99 | Max | Req/sec | Status |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const r of results) {
    console.log(
      `| \`${r.endpoint}\` | ${r.category} | ${r.targetP95} ms | ${r.min} ms | ${r.p50} ms | ${r.p95} ms | ${r.p99} ms | ${r.max} ms | ${r.rps} | ${r.targetMet ? '✅ PASS' : '❌ EXCEEDS'} |`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
