# BSC Textiles HRMS — Technical Requirements & Specifications

**Project Name:** BSC Textiles Human Resource Management System (HRMS)  
**System Classification:** Enterprise Retail Workforce Governance  
**Target Environment:** On-Premise Store Server & Cloud Production Hybrid  

---

## 1. System Technology Stack

| Layer | Component | Technology / Version | Justification & Role |
|---|---|---|---|
| **Frontend** | Framework | Next.js 15.5+ (React 18 / 19) | Server-Side Rendering (SSR), React Server Components, App Router |
| | Styling | Tailwind CSS & CSS Custom Properties | Scalable design tokens, responsive layout, dark/light themes |
| | Icons | Lucide React | High-performance tree-shakeable SVG enterprise iconography |
| | Real-time | Socket.IO Client 4.8+ | Sub-second punch notifications, break count monitors |
| **Backend** | Runtime | Node.js >= 20.0.0 LTS | Asynchronous event loop, high concurrency I/O |
| | Server | Express.js 4.18+ | Robust RESTful HTTP API routing and enterprise middleware pipeline |
| | Language | TypeScript 5.3+ | End-to-end type safety, interfaces, strict compilation |
| | Security | Argon2id (`@node-rs/argon2`) | Memory-hard cryptographic hashing resistant to GPU/ASIC brute force |
| | Tokenization | JSON Web Tokens (`jsonwebtoken` 9.0+) | Stateless role & location claims, cryptographic signing |
| | Validation | Zod 3.22+ | Runtime schema validation on query, body, and route params |
| | Real-time | Socket.IO Server 4.7+ | Location and user scoped WebSocket broadcast channels |
| | Document Gen | PDFKit 0.20+ | Form T statutory payslip & Full and Final settlement PDF generation |
| **Database** | RDBMS | MySQL 8.0.36+ Community / Enterprise | Native ACID relational storage with foreign key cascade integrity |
| | Driver | `mysql2/promise` 3.24+ | Zero-ORM direct parameterized queries and connection pooling |
| | Character Set | `utf8mb4` (`utf8mb4_unicode_ci`) | Full multilingual, Indian name symbols, and emoji compatibility |
| | Engine | InnoDB (`ROW_FORMAT=DYNAMIC`) | Row-level locking, high concurrency, crash recovery guarantees |

---

## 2. Infrastructure & Hardware Prerequisites

### Minimum Server Specifications (Development & Store Node)
- **CPU:** 4 Cores (x86_64 or ARM64)
- **RAM:** 8 GB DDR4
- **Disk:** 50 GB NVMe SSD storage
- **Operating System:** Windows Server / Windows 11 / Ubuntu 22.04 LTS / Debian 12

### Recommended Production Specifications (Multi-Store Central Cluster)
- **CPU:** 8 Cores (3.0 GHz+)
- **RAM:** 16 GB DDR4/DDR5
- **Disk:** 250 GB NVMe SSD (RAID-1 or managed cloud SSD with automated snapshots)
- **Network Bandwidth:** 100 Mbps symmetric dedicated uplink

---

## 3. Network & Port Allocation Matrix

| Service | Port | Protocol | Binding | Purpose |
|---|---|---|---|---|
| Next.js Frontend | `3000` | HTTP / HTTPS | `0.0.0.0` | Client web interface and PWA access |
| Express API & Socket.IO | `4000` | HTTP / WSS | `0.0.0.0` | REST API endpoints and WebSocket events |
| MySQL Database Server | `3306` | TCP / Native SQL | `127.0.0.1` | RDBMS connection pool (isolated from public WAN) |
| Reverse Proxy (NGINX) | `80`, `443` | HTTP / HTTPS | `0.0.0.0` | Edge TLS termination, gzip/brotli compression, CSP |

---

## 4. Database Server Configuration (`my.cnf` / `my.ini`)

To ensure sub-second attendance tracking and high-throughput connection concurrency, MySQL 8.0 must be configured with:

```ini
[mysqld]
default_storage_engine          = InnoDB
character-set-server            = utf8mb4
collation-server                = utf8mb4_unicode_ci
default_time_zone               = '+05:30'

# Connection Pooling
max_connections                 = 250
max_connect_errors              = 10000
wait_timeout                    = 300
interactive_timeout             = 300

# InnoDB Memory Optimization
innodb_buffer_pool_size         = 2G
innodb_log_file_size            = 256M
innodb_flush_log_at_trx_commit  = 2
innodb_file_per_table           = 1
innodb_autoinc_lock_mode        = 2
```

---

## 5. Performance SLAs & Non-Functional Requirements

1. **API Latency SLA**:
   - Authentication & Token Issuance: `< 250ms` (inclusive of Argon2id hashing).
   - Biometric Attendance Punch / QR Verification: `< 50ms`.
   - Dashboard KPI Aggregations: `< 100ms`.
   - Complex Statutory Payroll Runs (Bulk 1,000 employees): `< 5.0 seconds`.
2. **Reliability & Availability**:
   - System Availability Target: `99.9%` uptime during store trading hours (09:00 AM – 10:30 PM IST).
   - Zero Data Loss for finalized payroll runs, attendance punches, and salary slips.
3. **Sub-Second Precision**:
   - All attendance punches (`actualLogin`, `actualLogout`), breaks, and biometric timestamps must be recorded with millisecond precision (`DATETIME(3)`).
4. **Security & Cryptography**:
   - Passwords must meet minimum 12 characters policy (uppercase, lowercase, digits, symbols).
   - In-flight communication protected by TLS 1.3.
   - Restful mutations guarded by SameSite cookies, CSRF tokens, and IP correlation.
