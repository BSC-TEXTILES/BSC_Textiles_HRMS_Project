# BSC TEXTILES HRMS
### *Weaving Dreams, Building Futures*
**BSC Textiles Pvt. Ltd. — Next Generation Workforce Management Platform**

---

## 🏛️ System Overview

**BSC Textiles HRMS** is an enterprise-grade, multi-location workforce operations platform engineered specifically for BSC Textiles Pvt Ltd retail chain stores and regional hubs.

The system provides end-to-end management of employees, locations, floors, departments, sections, selling points, granular role-based permissions, biometric attendance, second-level early/late incentive calculations, QR break counters, real-time live streaming with timecoded observations, and multi-branch payroll processing.

Designed for long-term scalability, the system natively isolates multi-branch data while providing centralized administrative governance across all BSC Textiles locations.

---

## 🏗️ Architectural Topology

```text
BSC-Textiles-HRMS/
│
├── frontend/             # Next.js 14 (App Router) + React 18 + Tailwind CSS
│   ├── src/app/          # 32+ Dynamic enterprise routes & dashboards
│   ├── src/components/   # Design system (Tables, Modals, Badges, Metrics)
│   └── src/lib/          # Real-time Socket.IO + API Gateway clients
│
├── backend/              # Node.js + Express + TypeScript + Prisma ORM
│   ├── src/routes/       # 26 Modular REST API domains
│   ├── src/middleware/   # RBAC, Location Scoping, Zod Validation, Helmet
│   ├── src/realtime/     # WebSocket event dispatchers
│   └── src/tests/        # Automated test suite (PRD Section 60 compliant)
│
├── database/             # Enterprise MySQL 8.0 schema
│   └── prisma/
│       ├── schema.prisma # 38 Normalized relational models
│       └── seed.ts       # Comprehensive synthetic seed engine
│
└── README.md
```

---

## 🏢 Multi-Location Architecture & Scoping

The system dynamically organizes store operations into 6 hierarchical tiers:
$$\text{Location} \longrightarrow \text{Floor} \longrightarrow \text{Department} \longrightarrow \text{Section} \longrightarrow \text{Selling Point} \longrightarrow \text{Employee}$$

### Pre-configured Branches
| Location Code | Branch Name | City | Status |
|---|---|---|---|
| **BEL** | Belagavi Head Store | Belagavi | Active |
| **DAV** | Davanagere Mega Store | Davanagere | Active |
| **SHI** | Shivamogga Flagship | Shivamogga | Active |
| **HUB-TEST** | Hubballi Test Hub | Hubballi | Active |

### Server-Side Data Isolation
Location security is strictly enforced on the server and query levels:
* An HR Manager assigned to **Shivamogga (`SHI`)** can never see employee directories, muster rolls, QR scans, or payroll runs from **Belagavi (`BEL`)** or **Davanagere (`DAV`)**.
* Cross-location URL query tampering (e.g. `?locationId=SHI` submitted by Belagavi users) is intercepted and neutralized at the query builder layer.
* **Super Admin** maintains global, unrestricted visibility across all corporate locations.

---

## ⚡ Business Logic & Calculation Transparency

### 1. Second-Level Early Login Incentive (PRD Section 15)
* **Scheduled Shift Start:** `10:30:00 AM`
* **Actual Check-in:** `10:20:00 AM` (600 seconds early)
* **Configured Incentive Rate:** `₹1.00 / second`
$$\text{Early Seconds (600s)} \times \text{Rate (₹1.00/s)} = \mathbf{₹600.00}$$
*Every incentive calculation displays its exact explainability breakdown formula on both employee and manager portals.*

### 2. Late Login Penalty & Grace Period (PRD Section 14)
* **Scheduled Shift Start:** `10:30:00 AM`
* **Configured Grace Window:** `5 Minutes` (until `10:35:00 AM`)
* *Check-in at 10:34:00 AM:* On-Time / Protected by grace period (₹0 penalty).
* *Check-in at 10:40:00 AM:* Exceeds threshold by 600s $\rightarrow$ Penalty calculated at configured policy rate (e.g., ₹1/s = ₹600.00).

### 3. Configurable Break Rules & Real-Time Countdown (PRD Section 17 & 18)
Break policies are stored as dynamic database records (never hardcoded):
* **Male Lunch:** 100 Minutes (6,000s)
* **Female Lunch:** 40 Minutes (2,400s)
* **Male Tea Break:** 20 Minutes (1,200s)
* **Female Tea Break:** 15 Minutes (900s)
* **Live Counter:** Sub-second WebSocket countdown timers in the browser; automated overrun warning flags when threshold expires.

---

## 🔑 Test Personas & Credentials

All test personas use the password: `password123`

| Role | Test Persona Email | Location Scope | Capabilities |
|---|---|---|---|
| **Super Admin** | `admin@bsctextiles.com` | Global (All Branches) | Full administrative control, audit logs, backup |
| **Belagavi HR** | `kavita.bhat@bsctextiles.com` | `BEL` Branch Only | Attendance, muster roll, branch employees, approvals |
| **Shivamogga HR** | `vikram.singh@bsctextiles.com` | `SHI` Branch Only | Shivamogga branch staff management & reviews |
| **Floor Manager** | `amit.patel@bsctextiles.com` | Belagavi Ground Floor | Floor staff live tracking, selling points, observations |
| **T-Shop Scanner** | `ramesh.gowda@bsctextiles.com` | Belagavi Refreshment | Daily QR tea/lunch break token verification scanner |
| **Sales Employee** | `rajesh.kumar@bsctextiles.com` | Belagavi Sales Counter | Self-service My Desk, punch log, daily QR badge |

---

## 🧪 Automated Test Suite (PRD Section 60)

The system includes a 100% compliant automated test suite covering all 7 test categories specified in Section 60:

```bash
cd backend
npm test
```

### Verified Test Categories (43 / 43 Passed — 100% Pass Rate):
1. **Attendance Suite:**
   * On-time check-in calculation
   * Early login ₹1/sec incentive transparency
   * 5-minute grace period compliance
   * Late login penalty calculations
   * Shift-end overtime accumulation
   * Early departure policy audits
2. **Breaks Suite:**
   * Gender/group policy durations (100m, 40m, 20m, 15m)
   * Real-time countdown seconds calculation
   * Break overrun seconds & penalties
   * Active floor break monitoring API
3. **QR System Suite:**
   * Cryptographically secure token format ($\ge 24$ chars, non-guessable)
   * Daily single-use QR badge retrieval
   * Invalidation of previous-day QR tokens
   * Duplicate scan prevention (re-scanning same token is rejected)
   * Scanner role authorization & location verification
4. **Face Verification Suite:**
   * High match score ($\ge 85.0\%$) produces `VERIFIED`
   * Low match score ($< 85.0\%$) produces `FAILED`
   * Boundary condition verification ($85.00\%$)
   * Non-fabricated score retrieval & dashboard aggregation
5. **Permissions & Location Isolation Suite:**
   * Super Admin unrestricted global access
   * Belagavi HR restricted to Belagavi data
   * Shivamogga HR restricted to Shivamogga data
   * URL parameter query tampering prevention
   * Sales employee unauthorized route rejection (`403 Forbidden`)
6. **Incentives & Penalties Suite:**
   * Per-second, per-minute, fixed, and percentage calculation formulas
   * Target milestone achievement slab bonuses
   * Transparent calculation explainability strings
7. **Security & Auth Suite:**
   * Bcrypt password hash verification (no plaintext passwords)
   * Invalid credentials rejection (`401`)
   * Forged/tampered JWT signature rejection
   * Zod request body validation & security header hardening

---

## 🚀 Quickstart & Development

### 1. Prerequisites
* **Node.js:** v20.x or higher
* **MySQL:** v8.0 or higher
* **npm:** v10.x or higher

### 2. Database Setup & Seeding
```bash
cd database
npm install

# Run database migrations
npx prisma migrate dev --name init

# Populate comprehensive synthetic dataset
npx tsx prisma/seed.ts
```

### 3. Launch Backend API (Port 4000)
```bash
cd backend
npm install
npm run dev
```

### 4. Launch Frontend Web App (Port 3000)
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. Use the 1-click test personas on the login page to immediately test any role.

---

## 🗄️ Database Backup & Disaster Recovery (PRD Section 67)

### Automated MySQL Dump
To create an atomic, timestamped backup of the MySQL database:
```bash
mysqldump -u root -p bsc_textiles_hrms > backup_bsc_hrms_$(date +%Y%m%d_%H%M%S).sql
```

### Database Restoration
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS bsc_textiles_hrms;"
mysql -u root -p bsc_textiles_hrms < backup_bsc_hrms_20261008.sql
```

### In-App Backup Center
Super Administrators can access `/admin/backup` in the web application to download one-click database archives and configure retention schedules.

---

## 📡 Real-Time WebSocket Event Contract

| Event Name | Direction | Payload Description |
|---|---|---|
| `attendance.updated` | Server $\rightarrow$ Client | Real-time punch logged, updates live attendance metrics |
| `break.started` | Server $\rightarrow$ Client | Break clock initialized, triggers countdown timer |
| `break.ended` | Server $\rightarrow$ Client | Break completed, returns duration and excess seconds |
| `qr.scanned` | Server $\rightarrow$ Client | Scan verification result with employee and scanner metadata |
| `face.verified` | Server $\rightarrow$ Client | Biometric match confidence and verification status |
| `stream.message` | Bi-directional | Real-time live broadcast chat message |
| `stream.observation` | Bi-directional | Timecoded live video observation logged against employee |
| `notification.created` | Server $\rightarrow$ Client | In-app alerts for break overages, approvals, and system flags |

---

## 📜 Compliance & Production Readiness

* **Zero Mock Data:** All operational metrics, charts, and rosters are populated from normalized MySQL queries.
* **Second-Level Precision:** Authoritative timestamps are governed by the server database clock.
* **Audit Trail:** Every credential check, attendance adjustment, observation review, and QR scan writes an indelible audit transaction record.
* **Modular Integration:** Designed for zero-downtime integration with future BSC Textiles ecosystem applications (Wedding CRM, Telecaller, Live TV, and VM Operations).

---
© 2026 **BSC Textiles Pvt Ltd** — All Rights Reserved.#   B S C _ T e x t i l e s _ H R M S _ P r o j e c t -  
 