# BSC Textiles HRMS — Master Application Flow Specification

```text
BSC Textiles Pvt Ltd
Weaving Dreams, Building Futures
Document: Master Application & Journey Flows (appflow.md)
Version: 1.0.0 (Production Architecture)
```

---

## 1. Executive Summary & Flow Topology 

The **BSC Textiles HRMS** application orchestrates complex, real-time retail workforce interactions across 4 store locations (`Belagavi`, `Davanagere`, `Shivamogga`, `Hubballi`), 14 functional user roles, and 32+ responsive application views.

This document defines the complete end-to-end navigational, state machine, and transactional flows governing the system.

### Global Flow Color Standard

All Mermaid diagrams in this document adhere to the BSC Textiles HRMS semantic color design system:
- **Navy (`#173A5E`) / Dark (`#263238`):** Security, auth gates, infrastructure, session persistence.
- **Blue (`#1F6FEB`):** User interfaces, frontend views, client triggers, API endpoints.
- **Green (`#2E9D59`):** Successful validation, on-time status, completed workflows, authorized state.
- **Orange (`#F2994A`):** Calculations, warning states, grace periods, policy evaluation rules.
- **Red (`#D64545`):** Rejections, 401/403 errors, failed biometrics, break overruns, penalty accruals.
- **Purple (`#7B61FF`):** Real-time WebSocket dispatches, push alerts, live streams, chat messages.
- **Teal (`#009688`):** Biometric devices, camera capture, QR scanner hardware, external inputs.
- **Database Blue (`#00758F`):** ACID database transactions, Prisma queries, MySQL tables.

---

## 2. High-Level System Navigation & Route Map

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    ROOT["/ (Landing / Root Gateway)"]:::cDark --> AUTH_CHECK{"Authenticated Session Active?"}:::cOrange

    AUTH_CHECK -- "NO" --> LOGIN["/login (Authentication Portal)"]:::cBlue
    AUTH_CHECK -- "YES" --> ROLE_DISPATCH{"Evaluate Role Privilege"}:::cOrange

    LOGIN --> CRED_VAL["POST /api/auth/login"]:::cDark
    CRED_VAL -- "Valid Auth" --> ROLE_DISPATCH
    CRED_VAL -- "Invalid Auth" --> LOGIN_ERR["Display Error Toast"]:::cRed

    ROLE_DISPATCH -- "SUPER_ADMIN / ADMIN" --> DASH_EXEC["/dashboard (Executive Roster & KPI Overview)"]:::cBlue
    ROLE_DISPATCH -- "HR_MANAGER / HR_EXECUTIVE" --> DASH_HR["/attendance/muster (HR Operations Central)"]:::cBlue
    ROLE_DISPATCH -- "FLOOR / DEPT MANAGER" --> DASH_FLOOR["/operations/observations (Live Floor Monitor)"]:::cBlue
    ROLE_DISPATCH -- "T_SHOP_OWNER / SCANNER" --> SCAN_TERM["/operations/scanner (QR Scanner Terminal)"]:::cBlue
    ROLE_DISPATCH -- "SALES_EMPLOYEE / GENERAL" --> MY_DESK["/my-desk (Self-Service Attendance & QR Badge)"]:::cBlue

    subgraph ADMIN_ROUTES["Administrative Management Space"]
        DASH_EXEC --> ADM_USERS["/admin/users"]:::cBlue
        DASH_EXEC --> ADM_ROLES["/admin/roles"]:::cBlue
        DASH_EXEC --> ADM_AUDIT["/admin/audit"]:::cBlue
        DASH_EXEC --> ADM_BACKUP["/admin/backup"]:::cBlue
        DASH_EXEC --> ADM_SETTINGS["/admin/settings"]:::cBlue
    end

    subgraph ORG_ROUTES["Organizational Topology Space"]
        DASH_EXEC --> ORG_LOC["/organization/locations"]:::cBlue
        DASH_EXEC --> ORG_FLOORS["/organization/floors"]:::cBlue
        DASH_EXEC --> ORG_DEPTS["/organization/departments"]:::cBlue
        DASH_EXEC --> ORG_SECT["/organization/sections"]:::cBlue
        DASH_EXEC --> ORG_SP["/organization/selling-points"]:::cBlue
    end

    subgraph HR_OPS_ROUTES["Workforce & HR Operations Space"]
        DASH_HR --> HR_EMP["/employees (Directory & Profile Master)"]:::cBlue
        DASH_HR --> HR_ATT["/attendance (Daily Check-in Log)"]:::cBlue
        DASH_HR --> HR_SHIFTS["/attendance/shifts (Shift Windows)"]:::cBlue
        DASH_HR --> HR_LEAVES["/leaves (Applications & Approvals)"]:::cBlue
        DASH_HR --> HR_INC["/incentives (Formula Rules & Grants)"]:::cBlue
        DASH_HR --> HR_PAY["/payroll (Draft Runs & Payslips)"]:::cBlue
        DASH_HR --> HR_REP["/reports (Muster Roll & Exports)"]:::cBlue
    end

    subgraph FLOOR_OPS_ROUTES["Live Operations Space"]
        DASH_FLOOR --> OP_STREAMS["/operations/live-streams (Showroom Camera Feeds)"]:::cPurple
        DASH_FLOOR --> OP_NOTES["/operations/observations (Staff Timecoded Notes)"]:::cPurple
        DASH_FLOOR --> OP_BREAKS["/attendance/breaks (Live Break Counters)"]:::cGreen
    end

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cRed fill:#D64545,stroke:#9E2B2B,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
```

---

## 3. End-to-End Authentication & Persona Session Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor User as User / Store Staff
    participant UI as Next.js Login View (/login)
    participant AuthAPI as Auth Router (/api/auth)
    participant DB as MySQL Database
    participant Storage as Browser Cookie / State

    User->>UI: Selects 1-Click Test Persona or Enters Credentials
    UI->>AuthAPI: POST /api/auth/login {email, password}
    AuthAPI->>DB: SELECT * FROM User WHERE email = ?
    alt User Does Not Exist
        DB-->>AuthAPI: null
        AuthAPI-->>UI: 401 Unauthorized ("Invalid credentials")
        UI-->>User: Show Error Banner
    else User Is Inactive
        DB-->>AuthAPI: user (isActive: false)
        AuthAPI-->>UI: 401 Unauthorized ("Account deactivated")
        UI-->>User: Show Contact Administrator Banner
    else Valid Credentials
        AuthAPI->>AuthAPI: bcrypt.compare(password, passwordHash)
        alt Password Mismatch
            AuthAPI-->>UI: 401 Unauthorized ("Invalid credentials")
            UI-->>User: Show Invalid Credentials Banner
        else Password Validated
            AuthAPI->>AuthAPI: Generate JWT (userId, iss: 'bsc-textiles-hrms', ttl: 12h)
            AuthAPI->>DB: UPDATE User SET lastLoginAt = NOW()
            AuthAPI->>DB: INSERT INTO AuditLog (action: 'LOGIN', userId)
            AuthAPI-->>UI: 200 OK + Set-Cookie: token (HttpOnly, SameSite=Lax)<br/>Payload: {user: {id, email, fullName, role, permissions, locationId}}
            UI->>Storage: Store user profile in AuthContext
            UI-->>User: Redirect to Authorized Workspace
        end
    end
```

---

## 4. Daily Attendance & Biometric Verification Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    START["Staff Opens /my-desk Check-In"]:::cBlue --> CAM_REQ["Trigger Browser Camera API (WebRTC)"]:::cTeal
    CAM_REQ --> CAM_PERM{"Camera Permission Granted?"}:::cOrange

    CAM_PERM -- "NO" --> CAM_ERR["Display: 'Camera access required for biometric check-in'"]:::cRed
    CAM_PERM -- "YES" --> PREVIEW["Render Live Camera Preview Canvas"]:::cTeal

    PREVIEW --> CAPTURE["User Clicks 'Capture & Verify Face'"]:::cBlue
    CAPTURE --> SNAP["Extract Base64 Frame & Dispatch"]:::cTeal

    SNAP --> API_VERIFY["POST /api/face-verification/verify"]:::cDark
    API_VERIFY --> BASELINE_LOOKUP["Fetch Employee Biometric Enrollment Baseline"]:::cDb

    BASELINE_LOOKUP --> COMPUTE_MATCH["Execute Feature Vector Cosine Similarity"]:::cTeal
    COMPUTE_MATCH --> EVAL_SCORE{"Match Score >= 85.0%?"}:::cOrange

    EVAL_SCORE -- "NO (< 85%)" --> LOG_FAIL["INSERT INTO FaceVerificationLog (status: FAILED)"]:::cRed
    LOG_FAIL --> REJECT_PUNCH["Reject Punch: 400 Bad Request ('Biometric verification failed')"]:::cRed

    EVAL_SCORE -- "YES (>= 85%)" --> LOG_PASS["INSERT INTO FaceVerificationLog (status: VERIFIED)"]:::cGreen
    LOG_PASS --> CHECK_TIME["Evaluate Scheduled Shift (e.g. 10:30:00 AM)"]:::cOrange

    CHECK_TIME --> TIMING_FORK{"Arrival Time vs Scheduled Shift Start"}:::cOrange

    TIMING_FORK -- "Earlier than Start" --> CALC_EARLY["Calculate Early Seconds: (ShiftStart - PunchTime)<br/>Incentive = EarlySeconds * ₹1.00/sec"]:::cGreen
    TIMING_FORK -- "Within Grace Window (<= 5 min)" --> CALC_GRACE["Mark PRESENT<br/>₹0.00 Penalty (Protected by Grace Period)"]:::cGreen
    TIMING_FORK -- "Exceeds Grace Window (> 5 min)" --> CALC_LATE["Calculate Late Seconds<br/>Status: LATE<br/>Penalty = LateSeconds * PolicyRate"]:::cRed

    CALC_EARLY --> DB_ATT["INSERT INTO Attendance (employeeId, locationId, status, incentive)"]:::cDb
    CALC_GRACE --> DB_ATT
    CALC_LATE --> DB_ATT

    DB_ATT --> WS_PUNCH["Socket.IO Broadcast: 'attendance.updated' to location room"]:::cPurple
    WS_PUNCH --> CONFIRM_STAFF["Render Success Punch Badge on My Desk"]:::cGreen

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

## 5. Daily QR Token Lifecycle & Refreshment Scanner Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
sequenceDiagram
    autonumber
    actor Staff as Sales Employee
    actor Scanner as T-Shop Scanner
    participant Desk as My Desk View
    participant ScanView as Scanner Terminal (/operations/scanner)
    participant QRAPI as QR Controller (/api/qr-codes)
    participant DB as MySQL DB
    participant WS as Socket.IO Hub

    Staff->>Desk: Opens "My Daily QR Badge"
    Desk->>QRAPI: GET /api/qr-codes/my-daily
    QRAPI->>DB: Find active QRCode WHERE employeeId = ? AND validDate = CURDATE()
    alt Token Does Not Exist For Today
        QRAPI->>QRAPI: Generate 32-char cryptographically secure token
        QRAPI->>DB: INSERT INTO QRCode (token, validDate, isActive: true)
    end
    DB-->>QRAPI: Return active QRCode
    QRAPI-->>Desk: 200 OK {token, expiresAt, employeeCode}
    Desk-->>Staff: Renders Dynamic QR Code Badge on Screen

    Staff->>Scanner: Presents Screen at Tea/Lunch Station
    Scanner->>ScanView: Points Barcode/Camera Scanner
    ScanView->>QRAPI: POST /api/qr-codes/scan {token, breakType: 'TEA'}
    QRAPI->>DB: SELECT * FROM QRCode WHERE token = ?
    alt Token Expired or Invalid Date
        QRAPI-->>ScanView: 400 Bad Request ("Token expired")
        ScanView-->>Scanner: Display RED "INVALID TOKEN" Card
    else Scanner Location != Employee Location
        QRAPI-->>ScanView: 403 Forbidden ("Cross-location scan rejected")
        ScanView-->>Scanner: Display RED "CROSS-STORE VIOLATION"
    else Token Active & Valid
        QRAPI->>DB: Check Active Break Records
        alt Employee Starting Break
            QRAPI->>DB: INSERT INTO Break (employeeId, type: 'TEA', status: 'ACTIVE', startTime: NOW())
            QRAPI->>WS: Emit 'break.started' {employeeId, allocatedSeconds: 1200}
            WS-->>Desk: Trigger 20-min Countdown Clock
            QRAPI-->>ScanView: 200 OK {status: 'STARTED', employee: {fullName, code}}
            ScanView-->>Scanner: Display GREEN "BREAK APPROVED" Card
        else Employee Returning from Break
            QRAPI->>DB: UPDATE Break SET endTime = NOW(), status = 'COMPLETED'
            QRAPI->>WS: Emit 'break.ended' {employeeId, durationSeconds}
            WS-->>Desk: Reset Countdown to Idle
            QRAPI-->>ScanView: 200 OK {status: 'COMPLETED'}
            ScanView-->>Scanner: Display GREEN "BREAK CLOSED" Card
        end
    end
```

---

## 6. Real-Time Break Countdown & Overrun State Machine

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
stateDiagram-v2
    [*] --> NOT_STARTED: Employee On Duty (No Active Break)

    NOT_STARTED --> ACTIVE: Scan QR Token at Refreshment Station
    note right of ACTIVE
      Rules Loaded:
      - Male Lunch: 100 min (6,000s)
      - Female Lunch: 40 min (2,400s)
      - Male Tea: 20 min (1,200s)
      - Female Tea: 15 min (900s)
    end note

    ACTIVE --> COUNTING: WebSocket 'break.started' Received
    COUNTING --> WARNING: Remaining Time <= 5 Minutes (Visual Orange Pulse)
    WARNING --> POLICY_EXPIRED: Remaining Time <= 0 Seconds

    COUNTING --> COMPLETED: Return Scan Completed Before 0s (Status: COMPLETED, 0 Overrun)
    WARNING --> COMPLETED: Return Scan Completed Before 0s (Status: COMPLETED, 0 Overrun)

    POLICY_EXPIRED --> EXCEEDED: Return Scan Completed Past 0s
    note right of EXCEEDED
      Calculates:
      - Overrun Seconds = Elapsed - PolicySeconds
      - Penalty = OverrunSeconds * Rate/sec
      - Flags Manager Alert
    end note

    EXCEEDED --> COMPLETED_WITH_PENALTY: Penalty Persisted to Payroll
    COMPLETED --> NOT_STARTED: Staff Resumes Floor Sales Duty
    COMPLETED_WITH_PENALTY --> NOT_STARTED: Staff Resumes Floor Sales Duty
```

---

## 7. Showroom Live Streaming & Observational Coaching Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
flowchart TD
    START_STR["Floor Camera Feed (RTSP / RTMP / WebRTC)"]:::cTeal --> INGEST["Video Transcoding Ingest Gateway"]:::cTeal
    INGEST --> BROADCAST["Live HLS Stream Mount point: /live/branch-ground.m3u8"]:::cPurple

    BROADCAST --> MGR_VIEW["Manager Accesses /operations/live-streams"]:::cBlue
    MGR_VIEW --> JOIN_ROOM["Socket.IO Emit: 'join-stream' {streamId}"]:::cPurple
    JOIN_ROOM --> STREAM_ACTIVE["Player Renders Live Low-Latency Video"]:::cPurple

    STREAM_ACTIVE --> OBSERVE["Manager Observes Floor Interaction"]:::cBlue
    OBSERVE --> ACTION_CHOICE{"Manager Action"}:::cOrange

    ACTION_CHOICE -- "Send Live Directive" --> CHAT["Compose Realtime Room Message"]:::cBlue
    CHAT --> SEND_MSG["POST /api/live-streams/messages"]:::cDark
    SEND_MSG --> WS_CHAT["Socket.IO Broadcast 'stream.message' to all viewers"]:::cPurple

    ACTION_CHOICE -- "Log Staff Performance Note" --> MODAL["Open Timecoded Observation Modal"]:::cBlue
    MODAL --> CAPTURE_TIME["Snapshot Current Stream Timecode (e.g. 00:14:32)"]:::cTeal
    CAPTURE_TIME --> FILL_NOTE["Select Staff Member, Category (MERCHANDISING, SERVICE, DISCIPLINE), & Score"]:::cBlue
    FILL_NOTE --> SAVE_OBS["POST /api/observations"]:::cDark

    SAVE_OBS --> DB_OBS["INSERT INTO Observation in MySQL"]:::cDb
    DB_OBS --> NOTIF_STAFF["Dispatch In-App Notification to Target Employee"]:::cPurple
    NOTIF_STAFF --> ACK_NOTE["Staff Reviews Coaching Note & Acknowledges on My Desk"]:::cGreen

    classDef cBlue fill:#1F6FEB,stroke:#173A5E,stroke-width:2px,color:#FFFFFF;
    classDef cGreen fill:#2E9D59,stroke:#1E6B3D,stroke-width:2px,color:#FFFFFF;
    classDef cOrange fill:#F2994A,stroke:#C26D22,stroke-width:2px,color:#FFFFFF;
    classDef cPurple fill:#7B61FF,stroke:#523BC7,stroke-width:2px,color:#FFFFFF;
    classDef cTeal fill:#009688,stroke:#00675B,stroke-width:2px,color:#FFFFFF;
    classDef cDark fill:#263238,stroke:#10171A,stroke-width:2px,color:#FFFFFF;
    classDef cDb fill:#00758F,stroke:#004A5B,stroke-width:2px,color:#FFFFFF;
```

---

## 8. Monthly Payroll Generation & Approval State Machine

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
stateDiagram-v2
    [*] --> DRAFT_INITIATION: HR / Payroll Manager Selects Period & Store Location

    DRAFT_INITIATION --> AGGREGATING: POST /api/payroll/generate
    note right of AGGREGATING
      Query Engine Gathers:
      1. Base Salary & Scheduled Roster Days
      2. Second-Level Early Login Incentives
      3. Sales Target Milestone Bonuses
      4. Late Arrival Penalties & Grace Deductions
      5. Break Overrun Excess Deductions
      6. Approved Paid Leaves vs Unpaid Absences
    end note

    AGGREGATING --> DRAFT: Persist PayrollRun (Status: DRAFT) + Items
    DRAFT --> REVIEW: HR Reviews Interactive Net Pay Matrix

    REVIEW --> RECALCULATE: Manual Regularization / Approved Adjustment
    RECALCULATE --> DRAFT: Update Draft Records

    REVIEW --> REJECTED: Discrepancy Found / Canceled by Super Admin
    REJECTED --> [*]: Run Voided

    REVIEW --> PUBLISHED: HR Clicks "Approve & Publish Batch"
    note right of PUBLISHED
      1. Status: PUBLISHED
      2. Net Pay Locked (Immutable)
      3. Digital Payslips Generated
      4. Available on Staff "My Desk"
    end note

    PUBLISHED --> [*]: Batch Completed
```

---

## 9. Error Recovery & Exception Edge Cases

| Scenario | System Detection | Automatic Remediation | User Experience |
|---|---|---|---|
| **Camera Access Blocked** | `navigator.mediaDevices.getUserMedia` throws `NotAllowedError` | Catches rejection and displays fallback UI instructions | Shows permission troubleshooting guide with re-test button |
| **Biometric Match $< 85.0\%$** | Cosine similarity below threshold | Rejects punch, logs `FAILED` event in `FaceVerificationLog` | Displays: *"Face match confidence (78.2%) below 85% requirement. Please ensure adequate lighting and retry."* |
| **Expired QR Token** | Token `validDate < CURDATE()` or `isActive == false` | Rejects scan with `400 Bad Request` | Terminal flashes red with: *"Token Expired. Please refresh My Desk on mobile."* |
| **Cross-Location Scan** | Scanner store `!=` Employee assigned store | Enforces location scope check and returns `403 Forbidden` | Rejects punch and records cross-store tampering incident |
| **WebSocket Connection Drop** | Socket.IO `disconnect` event fired | Activates exponential backoff auto-reconnect (`maxDelay: 5000ms`) | Displays non-blocking subtle banner: *"Reconnecting to live floor stream..."* |
| **Concurrent Login Attempt** | User signs in from new browser session | Overwrites session cookie and updates `lastLoginAt` | Previous session gracefully expires upon next API call (`401`) |
