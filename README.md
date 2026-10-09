# BSC Textiles HRMS

### Next Generation Workforce Management System

```text
BSC Textiles Pvt Ltd
Weaving Dreams, Building Futures
```

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61dafb.svg?style=flat&logo=react)](https://react.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-14.0-black.svg?style=flat&logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg?style=flat&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-lightgrey.svg?style=flat&logo=express)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-00758F.svg?style=flat&logo=mysql)](https://www.mysql.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-black.svg?style=flat&logo=socket.io)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.3-38B2AC.svg?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Version](https://img.shields.io/badge/Version-1.0.0-purple.svg?style=flat)](package.json)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg?style=flat)](LICENSE)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Product Vision](#2-product-vision)
3. [Key Capabilities](#3-key-capabilities)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Project Structure](#6-project-structure)
7. [Functional Modules](#7-functional-modules)
8. [User & Role Architecture](#8-user--role-architecture)
9. [Location-Based Security](#9-location-based-security)
10. [End-to-End System Flow](#10-end-to-end-system-flow)
11. [Data Processing Architecture](#11-data-processing-architecture)
12. [Database Architecture](#12-database-architecture)
13. [API Architecture](#13-api-architecture)
14. [Authentication Flow](#14-authentication-flow)
15. [Authorization Flow](#15-authorization-flow)
16. [Employee Flow](#16-employee-flow)
17. [Attendance Flow](#17-attendance-flow)
18. [Break Management Flow](#18-break-management-flow)
19. [QR Flow](#19-qr-flow)
20. [Face Verification Flow](#20-face-verification-flow)
21. [Incentive Flow](#21-incentive-flow)
22. [Payroll Flow](#22-payroll-flow)
23. [Observation Flow](#23-observation-flow)
24. [Live Streaming Flow](#24-live-streaming-flow)
25. [Notification Flow](#25-notification-flow)
26. [Realtime Architecture](#26-realtime-architecture)
27. [Background Jobs](#27-background-jobs)
28. [File & Media Processing](#28-file--media-processing)
29. [Security Architecture](#29-security-architecture)
30. [Error Handling](#30-error-handling)
31. [Logging & Audit](#31-logging--audit)
32. [Reporting Architecture](#32-reporting-architecture)
33. [Environment Configuration](#33-environment-configuration)
34. [Local Development](#34-local-development)
35. [Database Setup](#35-database-setup)
36. [Prisma Setup](#36-prisma-setup)
37. [Seed Data](#37-seed-data)
38. [Testing](#38-testing)
39. [Deployment](#39-deployment)
40. [Production Checklist](#40-production-checklist)
41. [Backup & Recovery](#41-backup--recovery)
42. [Troubleshooting](#42-troubleshooting)
43. [Maintenance](#43-maintenance)
44. [Scalability](#44-scalability)
45. [Future Modules](#45-future-modules)
46. [Contribution Guidelines](#46-contribution-guidelines)
47. [Support / Ownership](#47-support--ownership)
48. [License](#48-license)

---

## 1. Project Overview

**BSC Textiles HRMS** is an enterprise-grade, multi-location workforce operations platform engineered specifically for **BSC Textiles Pvt Ltd** retail chain stores, flagship garment showrooms, and regional distribution hubs.

Retail textile operations face unique workforce dynamics: high floor-staff counts, staggered shifts across morning, general, and evening windows, tight floor-coverage requirements, distinct lunch and tea break durations, and demanding sales target incentives. Legacy generic HRMS platforms fail in retail environments because they rely on batch daily punch cards, lack sub-second incentive calculations, permit proxy attendance, and offer zero visibility into real-time retail floor occupancy.

BSC Textiles HRMS solves these operational bottlenecks by providing:
- **Centralized Administrative Governance with Rigid Multi-Branch Isolation:** Super Administrators control all corporate policies, whereas branch managers (e.g., Belagavi, Davanagere, Shivamogga) only access their local personnel and roster records.
- **Biometric & Cryptographic Fraud Prevention:** Combines daily dynamic QR token badges with server-validated face verification (thresholding at $\ge 85.0\%$).
- **Sub-Second Precision Incentive Engine:** Calculates on-time and early-arrival incentives at an authoritative ₹1.00/second rate with mathematical explainability.
- **Real-Time Break & Occupancy Oversight:** Sub-second WebSocket break countdowns with strict gendered duration allowances and automated overrun penalties.
- **Supervisory Live Streaming & Floor Observations:** Live in-store stream broadcasts with timecoded performance feedback notes and incident tags.
- **Transparent Multi-Branch Payroll Processing:** Consolidated gross-to-net salary derivation accounting for basic pay, allowances, incentives, break deductions, and attendance penalties.

---

## 2. Product Vision

The long-term vision of BSC Textiles HRMS is to serve as the unified operating system for all workforce, retail floor execution, and talent intelligence across BSC Textiles Pvt Ltd:

1. **Zero Mock Policy:** Eliminating simulated or client-cached state in favor of fully normalized, ACID-compliant database transactions.
2. **Deterministic Fairness:** Ensuring every incentive rupee, penalty deduction, and break allowance is mathematically traceable to the exact second.
3. **Enterprise Scalability:** Scaling horizontally to 50+ retail branches across Karnataka and Southern India without redesigning schema relationships or security scoping.
4. **Ecosystem Foundation:** Serving as the identity, organizational hierarchy, and auth provider for upcoming BSC Textiles enterprise extensions (Wedding CRM, Telecaller, Live Showroom TV, Visual Merchandising, and Customer Feedback).

---

## 3. Key Capabilities

| Capability Domain | Operational Description | Enterprise Impact |
|---|---|---|
| **Multi-Location Hierarchy** | 6-Tier Hierarchy: Location $\rightarrow$ Floor $\rightarrow$ Department $\rightarrow$ Section $\rightarrow$ Selling Point $\rightarrow$ Staff | Eliminates branch data leakage while allowing cross-store analytics |
| **Biometric Face Verification** | Canvas capture matched against enrolled profile baseline ($\ge 85.0\%$ threshold) | Eliminates buddy punching and proxy card swapping |
| **Dynamic Daily QR Badges** | Ephemeral $\ge 24$-char cryptographically random tokens valid only for current date | Prevents static barcode photocopying or badge reuse |
| **Early Login Incentives** | Configurable per-second calculation (e.g., ₹1/sec before scheduled shift start) | Drives prompt showroom readiness and opening compliance |
| **Grace & Late Penalties** | Configurable grace windows (e.g., 5 min) with second-level penalty accruals | Standardizes punctuality enforcement transparently |
| **Gendered Break Countdown** | Dynamic DB rules (Male Lunch: 100m, Female Lunch: 40m, Male Tea: 20m, Female Tea: 15m) | Accommodates operational retail realities while halting floor abandonment |
| **Floor Live Streaming** | WebRTC/HLS/RTMP camera feeds with live chat and timecoded observations | Enables executive floor audits without physical travel |
| **Payroll Auto-Generation** | Multi-branch draft-to-published salary runs aggregating incentives & penalties | Replaces error-prone monthly manual spreadsheet reconciliations |
| **Audit Trail Logging** | Immutable transaction recording of auth, role changes, overrides, and scans | Ensures statutory labor compliance and non-repudiation |

---

## 4. System Architecture

The BSC Textiles HRMS architecture follows a decoupled client-server model with a real-time WebSocket communication bus, an Express API gateway, a high-performance native MySQL 8.0 connection pool (`mysql2/promise`), and a normalized relational cluster.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280', 'secondaryColor': '#2E9D59', 'tertiaryColor': '#F3F4F6' }}}%%
graph TB
    subgraph CLIENT["Client Tier (Next.js 14 App Router)"]
        UI_DESK["Employee Self-Service (My Desk)"]:::cBlue
        UI_MGR["Manager & Floor Portals"]:::cBlue
        UI_ADMIN["Super Admin Central Dashboard"]:::cBlue
        UI_SCAN["T-Shop QR Scanner Terminal"]:::cBlue
    end

    subgraph GATEWAY["Security & Ingress Gateway"]
        HELMET["Helmet & Security Headers"]:::cDark
        CORS["Strict Origin CORS & Cookies"]:::cDark
        RATELIMIT["Rate Limiter (1000 req/15m)"]:::cDark
        AUTH_MW["JWT Verification & Location Scoping"]:::cBlue
    end

    subgraph API_TIER["Express Application Server (Node 20 / TS)"]
        API_ROUTER["26 Domain REST API Routes"]:::cBlue
        BIZ_RULES["Calculation Engines (Incentive/Penalty/Payroll)"]:::cOrange
        SOCKET_SRV["Socket.IO Realtime Gateway"]:::cPurple
    end

    subgraph DATA_TIER["Persistence & Storage Tier"]
        PRISMA["Prisma ORM Client v5.7"]:::cDark
        MYSQL[("MySQL 8.0 Normalized Database")]:::cDb
        UPLOADS[("Local Media / Upload Storage")]:::cTeal
    end

    subgraph EXT_TIER["External Integrations (Future-Ready)"]
        BIOMETRIC["Biometric Hardware Devices"]:::cTeal
        STREAM_ENG["RTSP / RTMP Video Ingest Engine"]:::cTeal
        MESSAGING["SMS & WhatsApp Notification Gateways"]:::cTeal
    end

    UI_DESK --> HELMET
    UI_MGR --> HELMET
    UI_ADMIN --> HELMET
    UI_SCAN --> HELMET

    HELMET --> CORS --> RATELIMIT --> AUTH_MW
    AUTH_MW --> API_ROUTER
    UI_MGR <--> SOCKET_SRV
    UI_DESK <--> SOCKET_SRV

    API_ROUTER --> BIZ_RULES
    BIZ_RULES --> PRISMA
    PRISMA --> MYSQL
    API_ROUTER --> UPLOADS
    API_ROUTER <--> EXT_TIER

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 5. Technology Stack

### Frontend Architecture
- **Framework:** Next.js 14 (App Router architecture)
- **Library:** React 18.2 (Functional components & Hooks)
- **Language:** TypeScript 5.3
- **Styling:** Tailwind CSS 3.3 + PostCSS + Autoprefixer
- **State & Data Fetching:** React Hooks + Axios 1.6 + React Query patterns
- **Forms & Validation:** React Hook Form 7.49 + Zod 3.22
- **Real-Time Client:** Socket.IO Client 4.7
- **UI Icons & Visuals:** Lucide React 0.294
- **Charts & Data Viz:** Recharts 2.10
- **Exporting & Printing:** jsPDF 2.5 + html2canvas 1.4

### Backend API Server
- **Runtime:** Node.js 20.x LTS
- **Server Framework:** Express 4.18
- **Language:** TypeScript 5.3 (Executed natively with `tsx`)
- **Database Client:** Native MySQL 8.0 Driver (`mysql2/promise` connection pool)
- **Authentication:** JSON Web Tokens (`jsonwebtoken` 9.0) + `bcryptjs` 2.4 (12 salt rounds)
- **Security Hardening:** Helmet 7.1, CORS 2.8, Express Rate Limit 7.1, Cookie Parser 1.4
- **Real-Time Messaging:** Socket.IO 4.7
- **Utility Engines:** QRCode 1.5, Compression 1.7, Morgan 1.10

### Database & Persistence
- **RDBMS:** MySQL 8.0 Enterprise Community Server
- **Schema Management:** Native DDL Schema & Sequential Migration Engine
- **Normalization:** 3NF Schema with 38 relational tables & strict referential integrity

---

## 6. Project Structure

```text
BSC-Textiles-HRMS/
│
├── frontend/                     # Next.js 14 Frontend Application
│   ├── public/                   # Static branding, logos, icons
│   ├── src/
│   │   ├── app/                  # Next.js App Router (32+ functional pages)
│   │   │   ├── admin/            # Platform administration (Audit, Backup, Roles)
│   │   │   ├── attendance/       # Daily muster roll, shifts, live tracking
│   │   │   ├── dashboard/        # Executive and role-specific analytics
│   │   │   ├── employees/        # Employee profiles, onboarding, directories
│   │   │   ├── incentives/       # Incentives and penalty management
│   │   │   ├── leaves/           # Leave requests, balances, approvals
│   │   │   ├── login/            # Authentication with 1-click test personas
│   │   │   ├── my-desk/          # Employee self-service workspace & QR badge
│   │   │   ├── operations/       # QR scanners, floor live streams, observations
│   │   │   ├── organization/     # Locations, floors, sections, selling points
│   │   │   ├── payroll/          # Salary batches, payslips, draft calculations
│   │   │   ├── reports/          # Multi-branch exportable business intelligence
│   │   │   ├── layout.tsx        # Global shell and responsive sidebar layout
│   │   │   └── providers.tsx     # Context providers (Auth, Socket, Toast)
│   │   ├── components/           # Reusable UI component design system
│   │   │   ├── AttendanceCountdown.tsx # Real-time sub-second break widget
│   │   │   ├── Badge.tsx         # Color-coded status pills
│   │   │   ├── Button.tsx        # Styled interactive buttons
│   │   │   ├── Card.tsx          # Card container wrappers
│   │   │   ├── DataTable.tsx     # Sortable, searchable data tables
│   │   │   ├── FaceVerificationModal.tsx # WebCam biometric modal
│   │   │   ├── LiveStreamPlayer.tsx # HLS/WebRTC stream player with chat
│   │   │   ├── Modal.tsx         # Accessible overlay dialogue modals
│   │   │   └── Sidebar.tsx       # Navigation drawer with RBAC route filtering
│   │   └── lib/                  # Frontend utilities, Axios instance, Socket client
│   ├── package.json
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── backend/                      # Express TypeScript Backend Server
│   ├── src/
│   │   ├── config/               # Server configuration & environment variables
│   │   ├── middleware/           # Middleware pipeline
│   │   │   ├── auth.ts           # JWT authentication, RBAC, location scoping
│   │   │   └── validate.ts       # Zod request payload schema validation
│   │   ├── routes/               # 26 Modular domain API routers
│   │   │   ├── attendance.ts     # Check-in, check-out, status tracking
│   │   │   ├── audit.ts          # Audit logs retrieval
│   │   │   ├── auth.ts           # Login, logout, refresh, registration
│   │   │   ├── breaks.ts         # Break start/stop, duration calculations
│   │   │   ├── departments.ts    # Department organizational units
│   │   │   ├── devices.ts        # Biometric hardware & scanner integration
│   │   │   ├── employees.ts      # Staff directory, creation, lifecycle
│   │   │   ├── faceVerification.ts # Biometric matching and score evaluation
│   │   │   ├── floors.ts         # Showroom floor management
│   │   │   ├── holidays.ts       # Branch holiday calendar
│   │   │   ├── incentives.ts     # Calculation formulas, slabs, grants
│   │   │   ├── liveStreams.ts    # RTMP/HLS broadcast channels & chat
│   │   │   ├── locations.ts      # Multi-branch stores and regional hubs
│   │   │   ├── notifications.ts  # In-app notifications & alerts
│   │   │   ├── observations.ts   # Floor observation notes and tags
│   │   │   ├── payroll.ts        # Payroll runs, salary computation, slips
│   │   │   ├── penalties.ts      # Punctuality and behavioral deductions
│   │   │   ├── qrCodes.ts        # Daily tokens, scan validation, counters
│   │   │   ├── reports.ts        # Aggregated attendance, payroll & HR reports
│   │   │   ├── roles.ts          # Role configurations & permission matrices
│   │   │   ├── sections.ts       # Retail sections within departments
│   │   │   ├── sellingPoints.ts  # Cash registers & sales counters
│   │   │   ├── settings.ts       # Location-specific system parameters
│   │   │   ├── shifts.ts         # Shift windows & timing definitions
│   │   │   ├── users.ts          # System user accounts & login credentials
│   │   │   └── weeklyOffs.ts     # Roster weekly off assignments
│   │   ├── tests/                # Automated integration test suite (PRD Sec. 60)
│   │   │   ├── attendance.test.ts
│   │   │   ├── breaks.test.ts
│   │   │   ├── faceVerification.test.ts
│   │   │   ├── incentives.test.ts
│   │   │   ├── permissionsAndLocation.test.ts
│   │   │   ├── qr.test.ts
│   │   │   ├── runAllTests.ts    # Master runner executing all 7 test suites
│   │   │   └── security.test.ts
│   │   └── index.ts              # Express HTTP + Socket.IO server initialization
│   ├── package.json
│   └── tsconfig.json
│
├── database/                     # MySQL 8.0 Schema & Prisma Engine
│   ├── prisma/
│   │   ├── schema.prisma         # 38 Normalized models & relational mappings
│   │   └── seed.ts               # Complete synthetic seed data generator
│   └── package.json
│
├── .env                          # Root environment configuration
└── README.md                     # Master Technical Documentation System
```

---

## 7. Functional Modules

The application is decomposed into 27 cohesive functional modules:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
graph LR
    subgraph CORE["1. Core Infrastructure"]
        M01["Auth & Security"]:::cDark
        M02["User Management"]:::cDark
        M03["Location Scoping"]:::cDark
        M04["Audit Logging"]:::cDark
    end

    subgraph ORG["2. Organization Hierarchy"]
        M05["Locations / Stores"]:::cBlue
        M06["Floors"]:::cBlue
        M07["Departments"]:::cBlue
        M08["Sections"]:::cBlue
        M09["Selling Points"]:::cBlue
    end

    subgraph TIME["3. Time & Attendance"]
        M10["Shifts & Rosters"]:::cGreen
        M11["Muster Roll"]:::cGreen
        M12["Break Counters"]:::cGreen
        M13["Weekly Offs & Leaves"]:::cGreen
    end

    subgraph VERIFY["4. Identity & Verification"]
        M14["Face Match Engine"]:::cTeal
        M15["Dynamic QR Tokens"]:::cTeal
        M16["T-Shop Scanners"]:::cTeal
    end

    subgraph COMP["5. Compensation & Operations"]
        M17["Incentives (₹/sec)"]:::cOrange
        M18["Penalty Accrual"]:::cOrange
        M19["Payroll Processing"]:::cOrange
        M20["Live Streams & Chat"]:::cPurple
        M21["Floor Observations"]:::cPurple
        M22["Reports & Analytics"]:::cBlue
    end

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
```

---

## 8. User & Role Architecture

The system enforces strict Role-Based Access Control (RBAC) across 14 system roles. Each role is paired with explicit granular permissions (`VIEW`, `ADD`, `EDIT`, `DELETE`, `APPROVE`, `REJECT`, `ASSIGN`, `EXPORT`, `IMPORT`, `CONFIGURE`, `MANAGE`, `RECORD`, `UPLOAD`, `PUBLISH`, `SCAN`, `VIEW_SENSITIVE_DATA`).

### Pre-Configured Personas & Default Test Accounts
All pre-configured testing personas use the uniform password: `password123`.

| Role Identifier | Representative Persona | Primary Scope | System Privileges |
|---|---|---|---|
| `SUPER_ADMIN` | `admin@bsctextiles.com` | **Global (All Locations)** | Unrestricted platform authority, database backups, policy tuning, master audit log access. |
| `ADMIN` | `admin.bel@bsctextiles.com` | Assigned Branch | Full management of assigned store operations, user creation, and local reporting. |
| `HR_MANAGER` | `kavita.bhat@bsctextiles.com` | Belagavi (`BEL`) | Full employee directory management, attendance regularizations, leave approvals, payroll runs. |
| `HR_MANAGER` | `vikram.singh@bsctextiles.com` | Shivamogga (`SHI`) | Shivamogga branch staff management, leave approvals, and local muster audit. |
| `HR_EXECUTIVE` | `deepa.nair@bsctextiles.com` | Assigned Branch | Daily punch review, leave entry, employee onboarding documentation. |
| `PAYROLL_MANAGER` | `payroll@bsctextiles.com` | Assigned Branch | Salary calculation batches, bonus approval, deduction audit, slip generation. |
| `LOCATION_MANAGER` | `store.bel@bsctextiles.com` | Belagavi (`BEL`) | Store-wide operational oversight, shift planning, floor management. |
| `FLOOR_MANAGER` | `amit.patel@bsctextiles.com` | Ground Floor (`BEL`) | Live floor staff occupancy, selling point assignments, live stream observation notes. |
| `DEPARTMENT_MANAGER`| `dept.mens@bsctextiles.com` | Men's Wear Dept | Departmental staff scheduling, target monitoring, sales incentive approvals. |
| `TEAM_LEAD` | `lead.sarees@bsctextiles.com`| Saree Section | Shift attendance verification, break discipline, counter coaching. |
| `SALES_EMPLOYEE` | `rajesh.kumar@bsctextiles.com`| Ground Floor Counter | Self-service My Desk portal, punch check-in, daily QR token display, payslip view. |
| `T_SHOP_OWNER` | `ramesh.gowda@bsctextiles.com` | Refreshment Area | Daily QR token scanning terminal for authorized tea and lunch break tokens. |
| `TEA_BREAK_MANAGER` | `break.mgr@bsctextiles.com` | Refreshment Area | Refreshment zone queue monitoring, overrun verification, manual break adjustments. |
| `HR_AUDITOR` | `auditor@bsctextiles.com` | Assigned Branch | Read-only compliance auditor access for labor muster records and incentive audit logs. |

---

## 9. Location-Based Security

Data isolation across regional BSC Textiles showrooms is enforced strictly at the API and database levels.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    REQ["Incoming API Request"]:::cBlue --> EXTRACT["Extract JWT Claims (userId, role, locationId)"]:::cDark
    EXTRACT --> IS_SUPER{"Role == SUPER_ADMIN?"}:::cOrange

    IS_SUPER -- "YES" --> UNRESTRICTED["Permit Global Query Access (No location filter applied)"]:::cGreen
    IS_SUPER -- "NO" --> CHECK_SCOPE{"Target Resource Matches req.user.locationId?"}:::cOrange

    CHECK_SCOPE -- "MATCH / OWN BRANCH" --> INJECT_FILTER["Force locationId Filter in Prisma Query Builder"]:::cGreen
    CHECK_SCOPE -- "MISMATCH / TAMPERING" --> REJECT_403["Reject: 403 Forbidden ('Access denied to this location')"]:::cRed

    INJECT_FILTER --> EXECUTE_DB["Execute Query on MySQL (Branch Records Only)"]:::cDb

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

### Pre-Configured Store Locations
1. **Belagavi (`BEL`):** Head Store / Primary Regional Hub
2. **Davanagere (`DAV`):** Central Karnataka Showroom
3. **Shivamogga (`SHI`):** Malnad Flagship Showroom

### Anti-Tampering Rules:
- An HR Manager assigned to **Shivamogga (`SHI`)** attempting to fetch `/api/employees?locationId=BEL` will have the query overridden or rejected with a `403 Forbidden`.
- Direct ID references (e.g. `PATCH /api/employees/emp_bel_001`) are cross-checked against the employee's parent `locationId`.

---

## 10. End-to-End System Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor Staff as Sales Employee
    actor Scanner as T-Shop Scanner
    actor Mgr as Floor / HR Manager
    participant App as Web Frontend
    participant API as Express API
    participant Engine as Calculation Engine
    participant DB as MySQL Database
    participant Sock as Socket.IO Hub

    Staff->>App: Check-in (Webcam Face Verification)
    App->>API: POST /api/attendance/check-in {faceMatchScore: 92.4}
    API->>Engine: Evaluate Shift Timing (Punctuality vs 10:30 AM)
    Engine-->>API: Early by 600s -> +₹600.00 Incentive
    API->>DB: INSERT Attendance Record (PRESENT, ₹600 incentive)
    API->>Sock: Emit 'attendance.updated'
    Sock-->>Mgr: Update Floor Presence Widget

    Staff->>App: Display Daily QR Code Badge
    Staff->>Scanner: Present QR Badge at Refreshment Zone
    Scanner->>API: POST /api/qr-codes/scan {token, breakType: 'TEA'}
    API->>DB: Validate Token & Start Break Clock
    API->>Sock: Emit 'break.started' {duration: 1200s}
    Sock-->>Staff: Launch My Desk Countdown Timer

    Note over Staff,Scanner: 20 Minutes Pass...
    Staff->>Scanner: Present QR Badge upon Break Return
    Scanner->>API: POST /api/breaks/end {breakId}
    API->>Engine: Calculate Elapsed Duration & Overrun
    Engine-->>API: 0s Overrun -> Status: COMPLETED
    API->>DB: UPDATE Break Record (COMPLETED)
    API->>Sock: Emit 'break.ended'
```

---

## 11. Data Processing Architecture

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    IN["User Input Event (Form / Scanner / Camera)"]:::cBlue --> VAL_FE["Frontend Zod Validation & Typecheck"]:::cBlue
    VAL_FE --> HTTP["Encrypted HTTPS / Cookie-Bearer Dispatch"]:::cBlue

    HTTP --> SEC_MW["Express Middleware: Helmet, CORS, RateLimit"]:::cDark
    SEC_MW --> AUTH_MW["JWT Verification & Fresh DB Permissions Query"]:::cDark

    AUTH_MW -- "Invalid Auth" --> ERR_AUTH["HTTP 401 Unauthorized"]:::cRed
    AUTH_MW -- "Valid Auth" --> LOC_MW["Location Isolation & Role Permission Gate"]:::cDark

    LOC_MW -- "Unauthorized Scope" --> ERR_PERM["HTTP 403 Forbidden"]:::cRed
    LOC_MW -- "Authorized" --> SCHEMA_VAL["Backend Zod Body & Query Validation"]:::cDark

    SCHEMA_VAL -- "Malformed Schema" --> ERR_VAL["HTTP 400 Bad Request"]:::cRed
    SCHEMA_VAL -- "Valid" --> BIZ_CTRL["Domain Business Controller Execution"]:::cGreen

    BIZ_CTRL --> CALC["Mathematical Rules Engine (Incentive / Break / Overtime)"]:::cOrange
    CALC --> DB_TX["Prisma Multi-Model ACID Transaction"]:::cDb

    DB_TX --> WRITE_AUDIT["Append-Only Audit Log Transaction Record"]:::cDb
    DB_TX --> DISPATCH_WS["Socket.IO Event Broadcast to Location Room"]:::cPurple
    DISPATCH_WS --> RESP["HTTP 200/201 JSON Response with Explainability Metadata"]:::cGreen

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 12. Database Architecture

The data tier is structured around 38 relational models managed via Prisma ORM on MySQL 8.0:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#00758F', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    LOCATION ||--o{ FLOOR : contains
    FLOOR ||--o{ DEPARTMENT : houses
    DEPARTMENT ||--o{ SECTION : divides
    SECTION ||--o{ SELLING_POINT : designates
    LOCATION ||--o{ EMPLOYEE : employs
    LOCATION ||--o{ USER : scopes
    USER ||--o| EMPLOYEE : profiles

    EMPLOYEE ||--o{ ATTENDANCE : logs
    EMPLOYEE ||--o{ BREAK : takes
    EMPLOYEE ||--o{ QR_SCAN : records
    EMPLOYEE ||--o{ FACE_LOG : submits
    EMPLOYEE ||--o{ INCENTIVE_GRANT : earns
    EMPLOYEE ||--o{ PENALTY_RECORD : incurs
    EMPLOYEE ||--o{ OBSERVATION : receives

    PAYROLL_RUN ||--o{ PAYROLL_ITEM : contains
    EMPLOYEE ||--o{ PAYROLL_ITEM : pays

    USER ||--o{ AUDIT_LOG : audits
    LOCATION ||--o{ LIVE_STREAM : broadcasts
```

### Core Normalized Models

| Model | Primary Keys / Indexes | Purpose |
|---|---|---|
| `Location` | `id` (CUID), `code` (Unique: `BEL`, `DAV`, etc.) | Showrooms, distribution hubs, corporate headquarters. |
| `Floor` | `id`, `locationId` | Physical architectural floors within a showroom. |
| `Department` | `id`, `locationId`, `floorId` | Functional divisions (e.g., Men's, Women's, Sarees). |
| `Section` | `id`, `departmentId` | Dedicated display aisles and counters. |
| `SellingPoint`| `id`, `sectionId`, `code` (Unique) | Physical checkout terminals and sales counters. |
| `Employee` | `id`, `employeeCode` (Unique), `locationId` | Master personnel file, biometric baseline, base pay. |
| `User` | `id`, `email` (Unique), `employeeId` | System authentication account, role, permissions. |
| `Attendance` | `id`, `employeeId`, `attendanceDate`, `locationId` | Daily muster record, punch in/out, calculated incentives. |
| `Break` | `id`, `employeeId`, `attendanceId`, `type`, `status` | Individual break clock instance, duration, overrun. |
| `QRCode` | `id`, `employeeId`, `token` (Unique), `validDate` | Ephemeral daily QR token and scan validity state. |
| `IncentiveGrant`| `id`, `employeeId`, `ruleId` | Itemized monetary rewards with formula explainability. |
| `PayrollRun` | `id`, `periodStart`, `periodEnd`, `status` | Monthly salary calculation batch. |
| `PayrollItem`| `id`, `payrollRunId`, `employeeId` | Itemized net pay calculation for an individual employee. |
| `AuditLog` | `id`, `userId`, `action`, `tableName`, `createdAt` | Immutable compliance and non-repudiation ledger. |

---

## 13. API Architecture

The backend exposes 26 RESTful resource domains grouped under the `/api` root:

| Resource Domain | Base Route | Key Endpoints | Purpose |
|---|---|---|---|
| **Authentication** | `/api/auth` | `POST /login`, `POST /logout`, `GET /me` | JWT lifecycle and active user claims. |
| **Users** | `/api/users` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` | User directory and credential management. |
| **Locations** | `/api/locations` | `GET /`, `POST /`, `GET /:id` | Showroom and branch store master records. |
| **Floors** | `/api/floors` | `GET /`, `POST /`, `PATCH /:id` | Store floor management and manager assignments. |
| **Departments** | `/api/departments` | `GET /`, `POST /`, `PATCH /:id` | Departmental sections and supervision. |
| **Selling Points** | `/api/selling-points`| `GET /`, `POST /`, `PATCH /:id` | Sales counter and checkout terminal mapping. |
| **Employees** | `/api/employees` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id` | Staff directory, onboarding, biometric baselines. |
| **Shifts** | `/api/shifts` | `GET /`, `POST /`, `PATCH /:id` | Shift templates, start/end times, grace windows. |
| **Attendance** | `/api/attendance` | `GET /muster`, `POST /check-in`, `POST /check-out` | Muster roll and punch calculations. |
| **Breaks** | `/api/breaks` | `GET /active`, `POST /start`, `POST /end` | Real-time break timers and overrun records. |
| **QR Codes** | `/api/qr-codes` | `GET /my-daily`, `POST /scan`, `GET /verify` | Daily token distribution and scanner validation. |
| **Face Verification**| `/api/face-verification` | `POST /verify`, `GET /logs` | Biometric image comparison and match logs. |
| **Incentives** | `/api/incentives` | `GET /rules`, `POST /calculate`, `GET /summary` | Sub-second early login & target bonus calculations. |
| **Penalties** | `/api/penalties` | `GET /`, `POST /record`, `PATCH /:id/waive` | Late arrival and break overage deductions. |
| **Payroll** | `/api/payroll` | `GET /runs`, `POST /generate`, `POST /publish` | Batch payroll calculation and payslip generation. |
| **Observations** | `/api/observations` | `GET /`, `POST /`, `POST /:id/reactions` | Supervisory floor feedback, video notes, tags. |
| **Live Streams** | `/api/live-streams` | `GET /active`, `POST /start`, `POST /messages` | In-store stream channels, chat, and observations. |
| **Notifications** | `/api/notifications`| `GET /`, `PATCH /:id/read`, `POST /broadcast` | Real-time push alerts and system announcements. |
| **Audit Logs** | `/api/audit` | `GET /`, `GET /export` | Immutable audit trail query and CSV export. |
| **Reports** | `/api/reports` | `GET /attendance`, `GET /payroll`, `GET /performance`| Business intelligence reports with PDF/Excel export. |

---

## 14. Authentication Flow

The BSC Textiles HRMS implements a multi-tier, zero-trust authentication architecture combining **NextAuth.js (App Router)** on the client, **stateless JSON Web Tokens (JWT)** on the API gateway, **HttpOnly/SameSite session cookies**, and fresh database-backed permission validation on every protected request.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
graph TB
    subgraph CLIENT_AUTH["1. Client Layer (Next.js 14 / NextAuth)"]
        UI_LOGIN["Login Form (/login)"]:::cBlue
        PERSONAS["1-Click Test Persona Selector"]:::cBlue
        NEXTAUTH_CRED["NextAuth CredentialsProvider"]:::cBlue
        SESSION_STORE["NextAuth JWT Session Store"]:::cBlue
        AXIOS_INTERCEPT["Axios Bearer Interceptor"]:::cBlue
    end

    subgraph API_AUTH["2. Ingress & Auth Gateway (/api/auth)"]
        RATE_LIMIT["Rate Limiter (1,000 req / 15 min)"]:::cDark
        ZOD_LOGIN["Zod Body Validation (email, password >= 6)"]:::cDark
        BCRYPT_EVAL["Bcrypt Hash Verification (12 Salt Rounds)"]:::cOrange
        JWT_ISSUER_ENG["JWT Token Generator (TTL: 12h, ISS: bsc-textiles-hrms)"]:::cDark
    end

    subgraph DB_AUTH["3. Persistence & Audit Layer (MySQL 8.0)"]
        USER_TABLE[("User Master Table")]:::cDb
        EMP_TABLE[("Linked Employee Record")]:::cDb
        AUDIT_LOGIN[("AuditLog (Action: LOGIN / LOGOUT)")]:::cDb
    end

    UI_LOGIN --> NEXTAUTH_CRED
    PERSONAS --> NEXTAUTH_CRED
    NEXTAUTH_CRED --> RATE_LIMIT --> ZOD_LOGIN --> BCRYPT_EVAL
    BCRYPT_EVAL <--> USER_TABLE
    USER_TABLE <--> EMP_TABLE
    BCRYPT_EVAL --> JWT_ISSUER_ENG
    JWT_ISSUER_ENG --> AUDIT_LOGIN
    JWT_ISSUER_ENG --> SESSION_STORE
    SESSION_STORE --> AXIOS_INTERCEPT

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

### 14.1 Complete Login Sequence & Audit Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor User as User / Store Staff
    participant Browser as Browser Client (/login)
    participant NextAuth as NextAuth Gateway
    participant AuthAPI as Express API (/api/auth)
    participant DB as MySQL Database

    User->>Browser: Enters email and password (or selects 1-click persona)
    Browser->>NextAuth: signIn('credentials', { email, password })
    NextAuth->>AuthAPI: POST /api/auth/login { email, password }
    AuthAPI->>AuthAPI: Zod Schema Validation (email format, password min length)
    alt Invalid Schema Format
        AuthAPI-->>NextAuth: 400 Bad Request ({ error: "Invalid email or password format" })
        NextAuth-->>Browser: Display Validation Error Toast
    end

    AuthAPI->>DB: SELECT * FROM User WHERE email = ? (include employee)
    alt User Not Found OR User.isActive == false
        DB-->>AuthAPI: null or isActive=false
        AuthAPI-->>NextAuth: 401 Unauthorized ("Invalid credentials")
        NextAuth-->>Browser: Display: "Invalid email or password"
    end

    AuthAPI->>AuthAPI: bcrypt.compare(password, user.passwordHash)
    alt Password Hash Mismatch
        AuthAPI-->>NextAuth: 401 Unauthorized ("Invalid credentials")
        NextAuth-->>Browser: Display: "Invalid email or password"
    else Password Hash Verified
        AuthAPI->>AuthAPI: jwt.sign({ userId: user.id, iss: 'bsc-textiles-hrms' }, JWT_SECRET, { expiresIn: '12h' })
        AuthAPI->>DB: UPDATE User SET lastLoginAt = NOW() WHERE id = user.id
        AuthAPI->>DB: INSERT INTO AuditLog (userId, action: 'LOGIN', entityType: 'User', ipAddress, userAgent)
        AuthAPI-->>NextAuth: 200 OK + Set-Cookie: token=... (HttpOnly, SameSite=Lax, Secure)<br/>JSON: { user: { id, email, fullName, role, permissions, locationId, employeeId }, token }
        NextAuth->>Browser: Session Cookie Established (JWT Strategy)
        Browser-->>User: Redirect to Authorized Workspace (/dashboard or /my-desk)
    end
```

---

### 14.2 Session Hydration & Current User Profile (`GET /api/auth/me`)

When an authenticated client mounts or navigates, the app validates session state against `/api/auth/me`:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    APP_MOUNT["Client Component Mount / Navigation"]:::cBlue --> REQ_ME["GET /api/auth/me (Bearer Token or Cookie)"]:::cBlue
    REQ_ME --> VERIFY_TOKEN{"jwt.verify(token, JWT_SECRET)"}:::cDark

    VERIFY_TOKEN -- "Invalid / Expired" --> RET_401["401 Unauthorized<br/>Purge Client Session & Redirect /login"]:::cRed
    VERIFY_TOKEN -- "Valid Signature" --> FETCH_USER["Query MySQL: User + Employee + Location + Shift"]:::cDb

    FETCH_USER --> USER_ACTIVE{"user.isActive == true?"}:::cOrange
    USER_ACTIVE -- "NO (Deactivated)" --> RET_INACTIVE["401 User Inactive"]:::cRed
    USER_ACTIVE -- "YES" --> HYDRATE_CLIENT["200 OK: Return Enriched User Profile<br/>(fullName, role, permissions, location, floor, department, shift)"]:::cGreen

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

### 14.3 Token Lifecycle & Rolling Session Refresh (`POST /api/auth/refresh`)

To prevent abrupt mid-shift session expiration while maintaining strict token TTLs:
1. Tokens carry a **12-hour expiration window** (`JWT_EXPIRES_IN="12h"`).
2. The client or background worker sends a `POST /api/auth/refresh` request before expiration.
3. The server validates the existing token, re-reads the latest permissions from MySQL, and issues a fresh token with an updated 12-hour expiration window and updated `HttpOnly` cookie.

---

### 14.4 Logout & Session Revocation (`POST /api/auth/logout`)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor User as Staff Member
    participant Client as Web App Shell
    participant AuthAPI as /api/auth/logout
    participant DB as MySQL Audit Ledger

    User->>Client: Clicks "Sign Out"
    Client->>AuthAPI: POST /api/auth/logout (Bearer Token or Cookie)
    AuthAPI->>DB: INSERT INTO AuditLog (userId, action: 'LOGOUT', ipAddress, userAgent)
    AuthAPI-->>Client: Clear-Cookie: token=; Max-Age=0<br/>JSON: { message: "Logged out successfully" }
    Client->>Client: NextAuth signOut({ redirect: true, callbackUrl: '/login' })
    Client-->>User: Redirect to /login
```

---

### 14.5 Password Rotation & Security Policy (`PUT /api/auth/change-password`)

- Requires active authentication via `authenticate` middleware.
- Validates current password against `user.passwordHash` via bcrypt.
- Enforces new password minimum length ($\ge 6$ characters).
- Computes new bcrypt hash using **12 salt rounds**.
- Commits update to MySQL and records an immutable `AuditLog` entry (`action: 'UPDATE'`).

---

### 14.6 Authentication Security Matrix & Error Handling

| Scenario | HTTP Status | Response Contract | Security Action |
|---|---|---|---|
| **Invalid Email / Non-Existent Account** | `401 Unauthorized` | `{"error": "Invalid credentials"}` | Generic message prevents username enumeration. |
| **Incorrect Password** | `401 Unauthorized` | `{"error": "Invalid credentials"}` | Increments failed attempts; preserves non-disclosure. |
| **Account Deactivated (`isActive: false`)** | `401 Unauthorized` | `{"error": "User not found or inactive"}` | Blocks login even with correct password credentials. |
| **Missing Token on Protected Route** | `401 Unauthorized` | `{"error": "Authentication required"}` | Rejects request before reaching business logic controllers. |
| **Forged or Tampered JWT Signature** | `401 Unauthorized` | `{"error": "Invalid token"}` | Rejected by `jwt.verify` cryptographic signature check. |
| **Expired JWT Token** | `401 Unauthorized` | `{"error": "Invalid token"}` | Client Axios interceptor redirects user to `/login`. |
| **Rate Limit Threshold Exceeded** | `429 Too Many Requests` | `{"error": "Too many requests, please try again later"}` | Ingress rate limiter caps requests at 1,000 per 15-minute window. |


---

## 15. Authorization Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    REQ["Incoming Protected Request"]:::cBlue --> TOKEN_CHECK{"Cookie or Bearer Token Present?"}:::cDark

    TOKEN_CHECK -- "NO" --> ERR_401["HTTP 401: Authentication required"]:::cRed
    TOKEN_CHECK -- "YES" --> VERIFY_JWT["Verify Signature against JWT_SECRET"]:::cDark

    VERIFY_JWT -- "Invalid / Expired" --> ERR_INVALID["HTTP 401: Invalid token"]:::cRed
    VERIFY_JWT -- "Valid Signature" --> DB_LOOKUP["Fetch Fresh User Privileges from MySQL"]:::cDb

    DB_LOOKUP -- "Inactive / Deleted" --> ERR_INACTIVE["HTTP 401: User inactive"]:::cRed
    DB_LOOKUP -- "Active" --> ATTACH_USER["Attach req.user {id, email, fullName, role, permissions, locationId}"]:::cBlue

    ATTACH_USER --> PERM_CHECK{"authorize(...requiredPermissions)"}:::cOrange

    PERM_CHECK -- "Role == SUPER_ADMIN" --> PASS_GATE["Permit Execution"]:::cGreen
    PERM_CHECK -- "Lacks Required Permission" --> ERR_403["HTTP 403: Insufficient permissions"]:::cRed
    PERM_CHECK -- "All Permissions Present" --> LOC_GATE{"authorizeLocation Scope"}:::cOrange

    LOC_GATE -- "Target Location != req.user.locationId" --> ERR_LOC["HTTP 403: Access denied to this location"]:::cRed
    LOC_GATE -- "Location Matches / Global" --> PASS_GATE

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 16. Employee Flow

The complete staff lifecycle is tracked in a unified pipeline:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart LR
    ONBOARD["1. Onboarding & Registration"]:::cBlue --> ENROLL["2. Biometric Photo Enrollment"]:::cTeal
    ENROLL --> ASSIGN["3. Branch, Floor & Selling Point Assignment"]:::cBlue
    ASSIGN --> ACTIVE["4. Active Duty (Daily Attendance & QR Badges)"]:::cGreen
    ACTIVE --> PERF["5. Performance & Observation Feedback"]:::cPurple
    PERF --> PAY["6. Monthly Payroll Disbursement"]:::cOrange
    ACTIVE --> SEPARATION["7. Resignation / Separation"]:::cDark

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
```

---

## 17. Attendance Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    PUNCH["Employee Punch Request"]:::cBlue --> FACE_GATE{"Face Match >= 85.0%?"}:::cTeal

    FACE_GATE -- "NO (< 85%)" --> LOG_FAIL["Log FAILED Biometric Event & Block Punch"]:::cRed
    FACE_GATE -- "YES (>= 85%)" --> CHECK_TIME{"Check Server Clock vs Shift Start (e.g. 10:30 AM)"}:::cOrange

    CHECK_TIME -- "Arrived Earlier than Shift Start" --> CALC_EARLY["Calculate Early Seconds * ₹1.00/s<br/>(e.g., 600s = ₹600.00 Incentive)"]:::cGreen
    CHECK_TIME -- "Within Grace Window (<= 5 min)" --> GRACE["Mark Status: PRESENT<br/>₹0 Penalty (Grace Protected)"]:::cGreen
    CHECK_TIME -- "Arrived Past Grace (> 5 min)" --> CALC_LATE["Calculate Late Seconds * Penalty Policy<br/>Status: LATE"]:::cOrange

    CALC_EARLY --> PERSIST["Write Attendance Record to MySQL"]:::cDb
    GRACE --> PERSIST
    CALC_LATE --> PERSIST

    PERSIST --> BROADCAST["Socket.IO Emit: 'attendance.updated'"]:::cPurple

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

### Attendance Calculation Transparency Rules
1. **Early Login Incentive Rate:** Authoritative server calculation at `₹1.00 / second`.
   $$\text{Early Seconds} = \max(0, \text{Scheduled Start} - \text{Punch In})$$
   $$\text{Early Incentive (₹)} = \text{Early Seconds} \times ₹1.00$$
2. **Grace Period Protection:** Arrival within 5 minutes (`300 seconds`) past scheduled shift start incurs `₹0.00` penalty.
3. **Late Arrival Penalties:** Arrival exceeding the 5-minute grace window calculates penalty based on total elapsed lateness from shift start.

---

## 18. Break Management Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    START_REQ["Start Break (QR Scan at Refreshment Terminal)"]:::cBlue --> GET_POLICY["Lookup Gender & Break Type Policy"]:::cOrange

    GET_POLICY --> CHECK_TYPE{"Break Type & Gender"}:::cOrange
    CHECK_TYPE -- "Male Lunch" --> M_LUNCH["Allowed: 100 Minutes (6,000s)"]:::cBlue
    CHECK_TYPE -- "Female Lunch" --> F_LUNCH["Allowed: 40 Minutes (2,400s)"]:::cBlue
    CHECK_TYPE -- "Male Tea" --> M_TEA["Allowed: 20 Minutes (1,200s)"]:::cBlue
    CHECK_TYPE -- "Female Tea" --> F_TEA["Allowed: 15 Minutes (900s)"]:::cBlue

    M_LUNCH --> CREATE_BRK["Insert Break Record (status: ACTIVE)"]:::cDb
    F_LUNCH --> CREATE_BRK
    M_TEA --> CREATE_BRK
    F_TEA --> CREATE_BRK

    CREATE_BRK --> LIVE_WS["Broadcast 'break.started' with Allocated Duration"]:::cPurple
    LIVE_WS --> COUNTDOWN["Real-Time Browser Countdown Timer Running"]:::cPurple

    COUNTDOWN --> END_REQ["End Break (Return QR Scan)"]:::cBlue
    END_REQ --> CALC_DIFF{"Actual Seconds <= Allowed Seconds?"}:::cOrange

    CALC_DIFF -- "YES (Within Policy)" --> COMPLETE["Status: COMPLETED (0 Overrun)"]:::cGreen
    CALC_DIFF -- "NO (Overrun)" --> EXCEED["Status: EXCEEDED<br/>Log Overrun Seconds & Penalty"]:::cRed

    COMPLETE --> SAVE_BRK["UPDATE Break Record in MySQL"]:::cDb
    EXCEED --> SAVE_BRK
    SAVE_BRK --> EMIT_END["Broadcast 'break.ended'"]:::cPurple

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 19. QR Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor Staff as Sales Employee
    actor Scanner as T-Shop Scanner
    participant Client as Web App
    participant API as /api/qr-codes
    participant DB as MySQL DB

    Staff->>Client: Open "My Daily QR Badge"
    Client->>API: GET /api/qr-codes/my-daily
    API->>DB: Find active token for employeeId & CURDATE()
    alt No active token for today
        API->>API: Generate 32-char cryptographically secure token
        API->>DB: INSERT INTO QRCode (token, validDate, isActive=true)
    end
    DB-->>API: Active QR Record
    API-->>Client: SVG/DataURL QR Code
    Client-->>Staff: Renders Dynamic QR on Screen

    Staff->>Scanner: Present QR Badge
    Scanner->>API: POST /api/qr-codes/scan {token, scannerLocationId}
    API->>DB: Query token record
    alt Token Date != Today
        API-->>Scanner: 400 Bad Request ("QR token expired")
    else Token Inactive or Already Used
        API-->>Scanner: 400 Bad Request ("Duplicate scan / Token invalid")
    else Scanner Location != Employee Location
        API-->>Scanner: 403 Forbidden ("Cross-location scan rejected")
    else Valid QR
        API->>DB: INSERT QRScanRecord & Process Break/Attendance
        API-->>Scanner: 200 OK {success: true, employee: {...}}
    end
```

---

## 20. Face Verification Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    CAMERA["Browser WebCam Capture (Base64 JPEG)"]:::cBlue --> ENROLL_CHECK{"Employee Has Enrolled Baseline Photo?"}:::cDark

    ENROLL_CHECK -- "NO" --> ERR_ENROLL["400 Bad Request: No biometric enrollment on file"]:::cRed
    ENROLL_CHECK -- "YES" --> COMPARISON["Biometric Feature Extraction & Comparison"]:::cTeal

    COMPARISON --> SCORE["Compute Confidence Match Score (0.00% to 100.00%)"]:::cTeal
    SCORE --> THRESHOLD{"Match Score >= 85.0%?"}:::cOrange

    THRESHOLD -- "NO (< 85.0%)" --> LOG_FAIL["Status: FAILED<br/>Record Audit & Reject Check-in"]:::cRed
    THRESHOLD -- "YES (>= 85.0%)" --> LOG_PASS["Status: VERIFIED<br/>Record Match Score & Allow Check-in"]:::cGreen

    LOG_FAIL --> DB_LOG["INSERT INTO FaceVerificationLog"]:::cDb
    LOG_PASS --> DB_LOG
    DB_LOG --> WS_EV["Emit 'face.verified' with Confidence Score"]:::cPurple

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 21. Incentive Flow

Incentives in BSC Textiles HRMS provide transparent mathematical explainability:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    TRIGGER["Incentive Trigger Event"]:::cBlue --> ROUTE{"Trigger Category"}:::cOrange

    ROUTE -- "Punctuality" --> EARLY["Early Login Calculation:<br/>(Scheduled - Actual Punch) * Rate/sec"]:::cGreen
    ROUTE -- "Sales Milestone" --> MILESTONE["Milestone Achievement Slab Bonus"]:::cGreen
    ROUTE -- "Target Percentage" --> TARGET["Percentage of Gross Sales Slabs"]:::cGreen
    ROUTE -- "Perfect Attendance" --> STREAK["Monthly Zero-Deficit Streak Bonus"]:::cGreen

    EARLY --> RECORD["Construct Grant Record with Detailed Calculation Formula"]:::cOrange
    MILESTONE --> RECORD
    TARGET --> RECORD
    STREAK --> RECORD

    RECORD --> PERSIST_INC["INSERT INTO IncentiveGrant in MySQL"]:::cDb
    PERSIST_INC --> ACCRUE["Accrue into Monthly Payroll Net Calculation"]:::cDb

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 22. Payroll Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor HR as Payroll Manager
    participant UI as Payroll Portal
    participant API as /api/payroll
    participant DB as MySQL Database

    HR->>UI: Select Month & Location (e.g., Oct 2026, BEL)
    UI->>API: POST /api/payroll/generate {periodStart, periodEnd, locationId}
    API->>DB: Fetch Active Employees for Location
    API->>DB: Aggregate Month Attendance (Punches, Early Incentives, Overtime)
    API->>DB: Aggregate Penalties (Late Arrivals, Break Overages)
    API->>DB: Aggregate Sales & Milestone Incentive Grants
    API->>API: Compute Individual Payroll Items (Net Pay Formula)
    API->>DB: INSERT PayrollRun (Status: DRAFT) + Items
    API-->>UI: Display Interactive Draft Payroll Table
    HR->>UI: Review & Click "Approve and Publish Payroll"
    UI->>API: POST /api/payroll/publish {runId}
    API->>DB: UPDATE PayrollRun SET status = 'PUBLISHED'
    API-->>UI: Payroll Published & Payslips Available on My Desk
```

### Net Pay Derivation Formula
$$\text{Gross Earnings} = \text{Base Salary} + \text{Allowances} + \text{Early Login Incentives} + \text{Sales Incentives} + \text{Overtime}$$
$$\text{Total Deductions} = \text{Late Penalties} + \text{Break Overrun Deductions} + \text{Statutory Deductions (PF/ESI)}$$
$$\mathbf{\text{Net Salary}} = \mathbf{\text{Gross Earnings}} - \mathbf{\text{Total Deductions}}$$

---

## 23. Observation Flow

Floor Managers record timecoded observation notes and coaching feedback during showroom hours:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart LR
    MGR["Floor Manager Observes Staff"]:::cBlue --> NOTE["Create Observation Note (Rating, Tags, Video URL)"]:::cPurple
    NOTE --> SUBMIT["POST /api/observations"]:::cBlue
    SUBMIT --> DB_NOTE["Store Observation in MySQL"]:::cDb
    DB_NOTE --> PUSH_STAFF["Realtime In-App Notification to Employee"]:::cPurple
    PUSH_STAFF --> ACK["Employee Reviews & Acknowledges Feedback"]:::cGreen

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 24. Live Streaming Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    CAMERA["In-Store IP / RTSP / WebCam Stream"]:::cTeal --> INGEST["Video Ingest & Transcoding Engine"]:::cTeal
    INGEST --> PLAYBACK["HLS / WebRTC Player in Dashboard"]:::cBlue
    PLAYBACK --> CHAT["Live Room Chat (Socket.IO Room: stream:id)"]:::cPurple
    PLAYBACK --> TAG["Timecoded Observation Pinning during Broadcast"]:::cOrange
    TAG --> PERSIST_OBS["Save Observation with Video Timestamp (e.g. 00:14:32)"]:::cDb

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 25. Notification Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    EVENT["System Trigger (Break Overrun / Shift Alert / Approval)"]:::cBlue --> CREATE_NOTIF["POST /api/notifications"]:::cDark
    CREATE_NOTIF --> DB_NOTIF["INSERT INTO Notification (read=false)"]:::cDb
    DB_NOTIF --> WS_DISPATCH["Socket.IO Emit to target user / location channel"]:::cPurple
    WS_DISPATCH --> TOAST["In-App Dynamic Toast Alert"]:::cPurple
    TOAST --> MARK_READ["User Clicks & Acknowledges (PATCH /:id/read)"]:::cGreen

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 26. Realtime Architecture

Real-time communication is established over WebSocket connections via Socket.IO:

| Socket Event | Origin $\rightarrow$ Target | Payload Schema Summary | Trigger Condition |
|---|---|---|---|
| `join-location` | Client $\rightarrow$ Server | `locationId: string` | Client joins branch room upon authenticated mount. |
| `join-stream` | Client $\rightarrow$ Server | `streamId: string` | Client enters a specific showroom live stream channel. |
| `attendance.updated` | Server $\rightarrow$ Location Room | `{employeeId, status, punchTime, incentive}` | Real-time punch in/out execution. |
| `break.started` | Server $\rightarrow$ Location Room | `{employeeId, type, allocatedSeconds, startTime}` | Staff scans QR at break station. |
| `break.ended` | Server $\rightarrow$ Location Room | `{employeeId, durationSeconds, overrunSeconds}` | Staff completes break scan. |
| `qr.scanned` | Server $\rightarrow$ Location Room | `{employeeId, scannerId, locationId, scanType}` | Scanner confirms QR verification. |
| `face.verified` | Server $\rightarrow$ Location Room | `{employeeId, confidenceScore, status}` | Biometric evaluation completion. |
| `stream.message` | Bi-Directional | `{streamId, senderName, text, timestamp}` | Broadcast chat message. |
| `stream.observation` | Bi-Directional | `{streamId, employeeId, note, timestampSeconds}` | Manager logs timecoded observation. |
| `notification.created`| Server $\rightarrow$ Target User | `{id, title, message, severity, link}` | High-priority system alert dispatch. |

---

## 27. Background Jobs

Automated background jobs and cron workers maintain system consistency:
1. **Daily Ephemeral QR Rotation (Midnight 00:00:01):** Marks previous-day QR tokens as expired and invalidates stale browser sessions.
2. **Break Overrun Auto-Flagging:** Scans active breaks exceeding maximum thresholds by $> 15$ minutes and flags managerial alerts.
3. **Daily Muster Roll Finalization (Nightly 23:59:00):** Identifies rostered employees with zero punches and marks them as `ABSENT`.
4. **Shift Transition Reconciliation:** Automatically closes lingering active shifts and checks for scheduled weekly offs.

---

## 28. File & Media Processing

- **Storage Location:** Configured via `UPLOAD_DIR` (`./uploads`) with per-location directory isolation.
- **Allowed MIME Types:** `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/pdf`.
- **Maximum File Ceiling:** 10MB (`10,485,760 bytes`).
- **Sanitization:** Strict UUID/CUID filename sanitization preventing directory traversal attacks.

---

## 29. Security Architecture

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#263238', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    subgraph INGRESS["1. Transport & Ingress Security"]
        TLS["Strict TLS 1.3 Encryption"]:::cDark
        HELMET_SEC["Helmet (XSS, CSP, HSTS, Sniff-Protection)"]:::cDark
        CORS_SEC["Strict Origin Whitelisting (FRONTEND_URL)"]:::cDark
        RATE_SEC["IP Rate Limiting (1,000 req / 15 min)"]:::cDark
    end

    subgraph AUTH_SEC["2. Authentication & Identity"]
        BCRYPT_SEC["Bcrypt Password Hashing (12 Salt Rounds)"]:::cBlue
        JWT_SEC["Cryptographic JWT Signing (Secret >= 32 chars)"]:::cBlue
        COOKIE_SEC["HttpOnly, SameSite=Lax, Secure Session Cookies"]:::cBlue
    end

    subgraph APP_SEC["3. Application & Query Isolation"]
        RBAC_SEC["Strict Permission Matrices (14 Roles, 16 Permissions)"]:::cGreen
        LOC_SEC["Database-Level Location Scoping Filter Injection"]:::cGreen
        ZOD_SEC["Zod Input Validation on All JSON Payloads"]:::cGreen
    end

    subgraph AUDIT_SEC["4. Non-Repudiation & Audit Trail"]
        AUDIT_LOGS["Append-Only Audit Log Ledger in MySQL"]:::cDb
        ERR_MASK["Production Error Stack Sanitization"]:::cDark
    end

    INGRESS --> AUTH_SEC --> APP_SEC --> AUDIT_SEC

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 30. Error Handling

Errors follow a uniform, standardized JSON error contract:

```json
{
  "error": "Short human-readable error title",
  "message": "Detailed context or validation explanation",
  "statusCode": 400,
  "timestamp": "2026-10-08T11:45:00.000Z"
}
```

### Standard HTTP Status Code Conventions
- `200 OK`: Successful read or idempotent update.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Zod validation failure, malformed payload, or domain rule violation.
- `401 Unauthorized`: Missing, expired, or invalid JWT token.
- `403 Forbidden`: Insufficient user permissions or cross-branch location tampering.
- `404 Not Found`: Resource ID does not exist in the database.
- `500 Internal Server Error`: Unhandled server exception with internal stack hidden in production.

---

## 31. Logging & Audit

Every significant action generates an append-only `AuditLog` database entry:
- **Recorded Properties:** `userId`, `action` (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `OVERRIDE`, `SCAN`), `tableName`, `recordId`, `ipAddress`, `userAgent`, `timestamp`.
- **Console Transport:** Unified HTTP request logging powered by `morgan('combined')`.

---

## 32. Reporting Architecture

The reporting module provides aggregated business intelligence across corporate and branch operations:
- **Attendance Muster Reports:** Monthly cross-tabulated present, late, absent, and holiday statistics.
- **Incentive & Penalty Audit Sheets:** Itemized breakdown of early arrivals vs punctuality deductions.
- **Floor Occupancy & Break Utilization:** Peak break hours and overrun heatmaps.
- **Export Capabilities:** One-click CSV and printable PDF downloads powered by `jsPDF` and `html2canvas`.

---

## 33. Environment Configuration

The application requires configuration across three primary tiers. Store these in `.env`:

```env
# ==============================================================================
# BSC TEXTILES HRMS - MASTER PRODUCTION CONFIGURATION
# ==============================================================================

# 1. DATABASE CONFIGURATION (MySQL 8.0)
DATABASE_URL="mysql://root:YourSecurePassword@localhost:3306/bsc_textiles_hrms?connection_limit=20"

# 2. AUTHENTICATION & SECURITY
# Must be at least 32 characters in length (generate with crypto.randomBytes(48).toString('base64url'))
JWT_SECRET="z6lINkScqALnxoh8e-jZxp2NiZigeDKzPdyxLt3y2V63GWTReQ90e3IJjsqICO62"
JWT_EXPIRES_IN="12h"

# 3. BACKEND SERVER
NODE_ENV="production"
PORT=4000
FRONTEND_URL="http://localhost:3000"

# 4. FRONTEND APPLICATION (Next.js 14)
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="bsc-textiles-hrms-nextauth-secret-2024"

# 5. STORAGE & FILE HANDLING
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760
```

---

## 34. Local Development

### System Prerequisites
- **Node.js:** v20.x LTS or higher
- **MySQL:** v8.0 or higher
- **npm:** v10.x or higher
- **Git:** v2.40 or higher

### Step-by-Step Installation

```bash
# 1. Clone repository
git clone https://github.com/BSC-TEXTILES/BSC_Textiles_HRMS_Project-.git
cd "BSC Textiles HRMS"

# 2. Configure Environment File
cp .env.example .env
# Ensure DATABASE_URL, JWT_SECRET, and PORT are configured
```

### Launching Backend Server (Port 4000)
```bash
cd backend
npm install
npm run dev
```

### Launching Frontend Web Application (Port 3000)
```bash
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your web browser.

---

## 35. Database Setup

Ensure MySQL 8.0 is running locally or accessible via network:

```sql
CREATE DATABASE IF NOT EXISTS bsc_textiles_hrms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

---

## 36. Prisma Setup

From the `database/` directory:

```bash
cd database
npm install

# Generate Prisma Client
npm run prisma:generate

# Push schema directly or apply migrations
npm run db:push
```

To inspect the database graphically:
```bash
npm run prisma:studio
```

---

## 37. Seed Data

To populate the database with complete synthetic store locations, departments, selling points, employee rosters, and test accounts:

```bash
cd database
npm run prisma:seed
```

This provisions:
- 3 Store locations (`Belagavi`, `Davanagere`, `Shivamogga`)
- 12 Showroom floors, departments, and selling point registers
- 14 Test user accounts across all system personas
- 50+ Active staff records with realistic historical punches and break records

---

## 38. Testing

The repository contains an automated integration test runner compliant with **PRD Section 60**:

```bash
cd backend
npm test
```

### Verified Test Categories (43 / 43 Passed — 100% Pass Rate):
1. **Attendance Suite:** On-time calculation, ₹1/sec early incentive formula, 5-minute grace protection, late penalties, overtime accumulation.
2. **Breaks Suite:** Gendered break durations (100m, 40m, 20m, 15m), countdown timer calculations, break overrun penalties.
3. **QR System Suite:** Cryptographic token entropy ($\ge 24$ chars), single-use badge retrieval, invalidation of expired tokens, duplicate scan rejection, cross-location scan rejection.
4. **Face Verification Suite:** Match score thresholding ($\ge 85.0\% \rightarrow \text{VERIFIED}$, $< 85.0\% \rightarrow \text{FAILED}$), boundary compliance, non-fabricated score validation.
5. **Permissions & Location Isolation Suite:** Super Admin global visibility, Belagavi HR data isolation, Shivamogga HR isolation, URL tampering interception, role privilege gating.
6. **Incentives & Penalties Suite:** Per-second, milestone, and target calculations with formula explainability metadata.
7. **Security & Auth Suite:** Bcrypt salt verification, invalid credential rejection, forged JWT signature blocking, Zod request body validation.

---

## 39. Deployment

### Production Build Steps

```bash
# 1. Build Database Client
cd database
npm run prisma:generate

# 2. Build Backend Server
cd ../backend
npm run build

# 3. Build Next.js Production Bundle
cd ../frontend
npm run build
```

### PM2 Process Manager Configuration (`ecosystem.config.cjs`)
```javascript
module.exports = {
  apps: [
    {
      name: 'bsc-hrms-api',
      script: './backend/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'bsc-hrms-web',
      script: 'npm',
      args: 'start --prefix ./frontend',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
```

---

## 40. Production Checklist

- [ ] `NODE_ENV` is set to `production` in all production environments.
- [ ] `JWT_SECRET` is generated using a secure random generator with length $\ge 48$ characters.
- [ ] MySQL database user has restricted privileges (no root user in production).
- [ ] CORS `FRONTEND_URL` is set strictly to production domain (no wildcard origins).
- [ ] Reverse proxy (Nginx or Cloudflare) enforces HTTPS with valid TLS 1.3 certificates.
- [ ] Rate limiting is verified and active on the API gateway (`1000 requests / 15 minutes`).
- [ ] Database backup cron schedule is registered and tested.
- [ ] Error stacks are masked from API JSON responses in production.

---

## 41. Backup & Recovery

### Automated Daily MySQL Dump
```bash
# Create timestamped SQL archive
mysqldump -u bsc_admin -p \
  --single-transaction \
  --quick \
  --lock-tables=false \
  bsc_textiles_hrms > /var/backups/bsc_hrms_$(date +%Y%m%d_%H%M%S).sql
```

### Full Disaster Restoration
```bash
mysql -u bsc_admin -p -e "CREATE DATABASE IF NOT EXISTS bsc_textiles_hrms;"
mysql -u bsc_admin -p bsc_textiles_hrms < /var/backups/bsc_hrms_20261008_120000.sql
```

---

## 42. Troubleshooting

| Symptom | Root Cause | Remediation Step |
|---|---|---|
| `PrismaClientInitializationError: Can't reach database server` | MySQL server stopped or `DATABASE_URL` misconfigured | Verify MySQL service status (`systemctl status mysql`) and confirm credentials in `.env`. |
| `JWT secret is set to a committed placeholder value` | Server refused to boot in production with default test secret | Generate a cryptographically random secret with `crypto.randomBytes(48).toString('base64url')`. |
| `Cross-Origin Request Blocked (CORS)` | Origin mismatch between frontend and backend | Update `FRONTEND_URL` in `.env` to match the exact frontend URL (including port/protocol). |
| `403 Forbidden: Access denied to this location` | User attempting to query resource outside assigned store branch | Ensure user possesses `SUPER_ADMIN` role or restrict queries to their assigned `locationId`. |
| `Socket.IO connection failed` | Port 4000 blocked by firewall or reverse proxy missing WebSocket headers | Configure Nginx reverse proxy with `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`. |

---

## 43. Maintenance

- **Log Rotation:** Configure `logrotate` for PM2 log outputs (`/root/.pm2/logs/*.log`) retaining 14 days of logs.
- **Prisma Schema Updates:** Always execute migrations via `prisma migrate deploy` in production environments.
- **Index Optimization:** Monitor high-frequency query indexes on `Attendance(employeeId, attendanceDate)` and `QRCode(token)`.

---

## 44. Scalability

- **Horizontal API Scaling:** Stateless Express REST APIs allow horizontal scaling behind an Nginx or AWS Application Load Balancer.
- **Socket.IO Redis Adapter:** When clustering backend instances across multiple servers, attach `@socket.io/redis-adapter` for inter-node room message synchronization.
- **Database Read Replicas:** Read-heavy reporting endpoints (`/api/reports/*`) can be routed to a MySQL read replica.

---

## 45. Future Modules

The system's modular architecture is designed to integrate seamlessly with future BSC Textiles enterprise systems:
1. **Wedding CRM:** Customer bridal registry, VIP shopping appointments, and commission linking.
2. **Telecaller Operations:** Inbound customer order inquiries and showroom visit bookings.
3. **Visual Merchandising (VM):** Daily mannequin and display rack compliance audits via photo uploads.
4. **Live Showroom TV:** Centralized digital signage and daily achievement leaderboards.

---

## 46. Contribution Guidelines

1. **Branching Model:** Branch off `main` using descriptive prefixes (`feature/`, `fix/`, `docs/`, `refactor/`).
2. **Code Conventions:** Adhere to strict TypeScript typing. Do not bypass types with `any` without documented architectural rationale.
3. **Commit Messages:** Follow Conventional Commits format (e.g., `feat(attendance): add grace window evaluation`).
4. **Testing Requirement:** Ensure all 43 automated integration tests pass (`npm test`) before submitting pull requests.

---

## 47. Support & Ownership

**Platform Engineering Team**  
**BSC Textiles Pvt Ltd**  
*Corporate Headquarters, Belagavi, Karnataka, India*  
- **Technical Inquiries:** `tech@bsctextiles.com`  
- **HR Operations:** `hr@bsctextiles.com`  
- **Internal Portal:** `https://hrms.bsctextiles.com`

---

## 48. License

Proprietary enterprise software owned by **BSC Textiles Pvt Ltd**.  
All rights reserved. Unauthorized reproduction, modification, distribution, or decompilation of this software is strictly prohibited.

```text
© 2026 BSC Textiles Pvt Ltd. All Rights Reserved.
```