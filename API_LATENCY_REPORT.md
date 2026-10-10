# BSC Textiles HRMS — API Latency & Benchmark Report

## 1. Test Environment Specifications

- **Operating System**: Windows 11 Enterprise (AMD64)
- **Node.js Runtime**: v20.10.0
- **Database Engine**: MySQL 8.0.36 Community Server
- **ORM / Driver**: Prisma ORM v5.7.0 with `mysql2` connection pooling (pool size: 20, wait timeout: 10,000 ms)
- **Backend Server**: Express 4.18.2 with TypeScript (`tsx watch` with exclusions) on Port 4000
- **Frontend Server**: Next.js 15.5.27 on Port 3000
- **Concurrency Level**: 4 concurrent client connections
- **Warmup Phase**: 3 pre-flight requests per endpoint prior to measurement
- **Iterations**: 40–50 requests per endpoint
- **Measurement Script**: `backend/src/tests/benchmarkApis.ts` (using `process.hrtime.bigint()` nanosecond precision)

---

## 2. Comprehensive Latency Benchmark Matrix

| Endpoint | HTTP Method | Workload Type | P50 (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) | RPS | Target P95 | Target Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /health` | `GET` | Health Check | 8.77 | **19.84** | 23.92 | 3.35 | 23.92 | 278.1 | < 50 ms | ✅ PASS |
| `GET /api/health` | `GET` | Health & DB Check | 8.37 | **22.77** | 24.83 | 3.71 | 24.83 | 265.4 | < 50 ms | ✅ PASS |
| `GET /api/locations/all` | `GET` | Cached Reference | 8.56 | **13.02** | 14.89 | 4.07 | 14.89 | 293.3 | < 100 ms | ✅ PASS |
| `GET /api/departments` | `GET` | Cached Reference | 15.37 | **22.19** | 24.36 | 13.24 | 24.36 | 212.6 | < 100 ms | ✅ PASS |
| `GET /api/shifts` | `GET` | Cached Reference | 15.49 | **17.56** | 17.98 | 13.72 | 17.98 | 225.1 | < 100 ms | ✅ PASS |
| `GET /api/holidays` | `GET` | Cached Reference | 16.56 | **18.60** | 19.55 | 11.88 | 19.55 | 216.3 | < 100 ms | ✅ PASS |
| `GET /api/employees/lookup` | `GET` | Lightweight Read | 22.91 | **25.42** | 33.78 | 20.87 | 33.78 | 154.6 | < 50 ms | ✅ PASS |
| `GET /api/employees` | `GET` | Indexed Read (take=20)| 49.61 | **62.54** | 78.09 | 42.28 | 78.09 | 73.8 | < 100 ms | ✅ PASS |
| `GET /api/attendance` | `GET` | Indexed Read (take=16)| 40.08 | **55.80** | 58.53 | 35.87 | 58.53 | 88.2 | < 100 ms | ✅ PASS |
| `GET /api/face-verification` | `GET` | Indexed Read (take=16)| 33.34 | **37.10** | 38.06 | 29.76 | 38.06 | 111.7 | < 100 ms | ✅ PASS |
| `GET /api/qr-codes/scans` | `GET` | Indexed Read (take=16)| 20.84 | **23.54** | 24.92 | 17.68 | 24.92 | 177.2 | < 100 ms | ✅ PASS |
| `GET /api/breaks` | `GET` | Indexed Read (take=16)| 21.70 | **24.78** | 25.91 | 19.03 | 25.91 | 170.3 | < 100 ms | ✅ PASS |
| `GET /api/incentives/transactions` | `GET` | Indexed Read (take=16)| 14.76 | **28.17** | 29.47 | 5.52 | 29.47 | 203.0 | < 100 ms | ✅ PASS |
| `GET /api/reports/dashboard-summary` | `GET` | Consolidated Summary | 8.44 | **20.12** | 24.93 | 3.78 | 24.93 | 297.4 | < 100 ms | ✅ PASS |
| `POST /api/auth/login` | `POST` | Argon2id Hashing | 367.77 | **419.29** | 425.01 | 333.71 | 425.01 | 5.3 | Workload Specific | 🔒 OWASP Pass |

---

## 3. Analysis of Target Achievements

### 3.1 100% Target Attainment for Lightweight & Indexed APIs
- **Target**: P95 < 100 ms for eligible endpoints under defined environment.
- **Result**: **14 out of 14** eligible routes achieved P95 latency below 65 ms, with reference endpoints clocking between **13 ms and 25 ms**.
- **Consolidated Dashboard**: `GET /api/reports/dashboard-summary` reached **20.12 ms P95** and **8.44 ms P50**, delivering a sub-25ms response time for executive overview screens.

### 3.2 Authentication Rationale: Why `POST /api/auth/login` Exceeds 100 ms
- `POST /api/auth/login` intentionally uses **Argon2id** password hashing (`@node-rs/argon2`) configured according to current OWASP password storage cheat sheet guidelines:
  - Memory cost: 64 MB (65,536 KiB)
  - Iterations (time cost): 3
  - Parallelism: 4 threads
- This deliberate cryptographic work-factor ensures defense-in-depth against offline GPU-based dictionary attacks.
- Once authenticated, all subsequent requests use Bearer JWT / Cookie session tokens which validate in **< 0.1 ms** via cached token inspection.

---

## 4. Tracing & Timing Headers

The backend now exposes W3C-compliant `Server-Timing` headers on all responses:
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
ETag: "9b3c4a1789c1..."
Cache-Control: public, max-age=60, stale-while-revalidate=30
X-Request-Id: req-m5o3k9-x8j2a
X-Correlation-Id: req-m5o3k9-x8j2a
X-Response-Time: 14.28ms
Server-Timing: total;dur=14.28, db;dur=6.12
```

This allows developers to inspect frontend-to-network vs server-processing vs database-query time directly inside DevTools Network panels.
