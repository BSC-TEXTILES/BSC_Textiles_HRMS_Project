# BSC TEXTILES HRMS — eSSL MB160 BIOMETRIC ATTENDANCE INTEGRATION

## 1. Executive Summary & Architecture

This document provides the complete technical specification, physical hardware configuration, protocol implementation, database schema, and verification report for integrating **eSSL MB160 Multi-Biometric (Face & Fingerprint)** attendance terminals directly into the **BSC Textiles HRMS**.

### Key Architecture Attributes:
- **Direct Device-to-Cloud Communication**: Every registered eSSL MB160 terminal communicates directly with the HRMS server over the showroom's existing internet connection via the native ZKTeco/eSSL **ADMS (Automatic Data Master Server)** cloud push protocol.
- **Zero Local PC Gateway**: No intermediate software or local PC gateway is required on showroom LANs. The terminal initiates outbound HTTP/HTTPS connections directly to `/iclock/...`.
- **Sub-Second Event-Driven Updates**: Verification events (Face / Fingerprint) are pushed instantly with `Realtime=1` and broadcast across WebSockets (`socketIO`), updating the HRMS dashboard in real-time without full-page reloads.
- **Multi-Tenant Sharding Integration**: Biometric punches and attendance calculations are persisted in the central MySQL control database (`bsc_textiles_hrms`) and automatically routed to the physical location shards (`bsc_shard_bel`, `bsc_shard_dav`, `bsc_shard_shi`).
- **Cryptographic Idempotency**: Strict SHA-256 deduplication hashes ensure zero duplicate attendance records, even during network retries or power interruptions.

```
┌─────────────────────────────────┐
│     Showroom eSSL MB160         │
│  (Belagavi / Davanagere / SHI)  │
└────────────────┬────────────────┘
                 │ (1) Direct Outbound HTTP/HTTPS Push (/iclock/cdata)
                 ▼
┌─────────────────────────────────┐
│     BSC HRMS Cloud Server       │
│      (Express + Socket.IO)      │
└────────┬───────────────┬────────┘
         │               │
  (2) MySQL Tx      (3) WebSocket Real-time Broadcast
         ▼               ▼
┌─────────────────┐  ┌─────────────────────────────────┐
│ Control DB &    │  │  Live HRMS Website Dashboard     │
│ Location Shards │  │  (Zero Page Reload / <1s UI Sync)│
└─────────────────┘  └─────────────────────────────────┘
```

---

## 2. Registered Hardware Terminal Specifications

The eSSL MB160 terminals are mapped to the verified showroom locations as follows:

| Device Internal ID | Serial Number | Physical Location | Model | LAN IP (Showroom) | Public Port | Push Protocol | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `bio-dev-bel-001` | `JNP2252300795` | **Belagavi Flagship (BEL)** | `eSSL MB160` | `192.168.0.136` | `4000` / `443` | `ADMS_PUSH` | **CONNECTED** |
| `bio-dev-dav-002` | `JNP2252300802` | **Davanagere Mega Store (DAV)** | `eSSL MB160` | `192.168.0.131` | `4000` / `443` | `ADMS_PUSH` | **CONNECTED** |
| `bio-dev-shi-003` | `JNP2252300797` | **Shivamogga Megastore (SHI)** | `eSSL MB160` | `192.168.0.138` | `4000` / `443` | `ADMS_PUSH` | **CONNECTED** |

---

## 3. Physical eSSL MB160 On-Device Menu Configuration

To activate direct synchronization from the physical terminal:

1. On the terminal keypad, press **`M/OK`** to access the main menu (authenticate as Admin if prompted).
2. Navigate to **`Comm.` (Communication)** -> **`Cloud Server Setting`** (or **`ADMS`** / **`Ethernet Server`**).
3. Configure the following parameters:
   - **Server Address**: Public IP or Domain of the HRMS server (e.g. `hrms.bsctextiles.com` or local dev IP `192.168.0.x`).
   - **Server Port**: `4000` (or `443` for HTTPS reverse proxy).
   - **Enable Cloud Server / ADMS**: `ON` (Checked).
   - **Enable Domain Name**: `ON` if using domain name (e.g. `hrms.bsctextiles.com`), `OFF` if using direct IP.
   - **Enable Proxy Server**: `OFF`.
4. Press **`ESC`** to save and exit.
5. The terminal LCD display will show an ADMS cloud icon (globe or cloud with checkmark) indicating an active connection to the HRMS receiver.

---

## 4. ADMS Cloud Push Protocol Specification

The HRMS backend natively implements the official ZKTeco/eSSL ADMS protocol endpoints:

### A. Handshake & Real-Time Configuration
- **Request**: `GET /iclock/cdata?SN=<SERIAL>&options=all&pushver=2.4.1&language=83`
- **Response**:
  ```text
  GET OPTION FROM: JNP2252300795
  Stamp=9999
  OpStamp=9999
  ErrorDelay=60
  Delay=10
  TransTimes=00:00;14:00
  TransInterval=1
  TransFlag=1111000000
  TimeZone=330
  Realtime=1
  Encrypt=0
  ServerVersion=3.1.1
  PushOptionsFlag=1
  ```
  - `Realtime=1`: Instructs the terminal to transmit attendance events immediately upon biometric verification.
  - `TransInterval=1`: Polling interval in seconds.
  - `TimeZone=330`: Indian Standard Time offset (+05:30 = 330 minutes).

### B. Live Attendance Punch Push
- **Request**: `POST /iclock/cdata?SN=<SERIAL>&table=ATTLOG` (or `table=RTLOG`)
- **Body**: Tab-delimited punch lines:
  `<PIN>\t<YYYY-MM-DD HH:mm:ss>\t<Status>\t<VerifyType>`
  Example: `1\t2026-10-16 09:12:30\t0\t15`
  - Status: `0` = Check-In, `1` = Check-Out, `2` = Break-Out, `3` = Break-In.
  - VerifyType on MB160: `15` = Face Verification, `1` = Fingerprint, `2` = RFID Card, `0`/`3` = Password.
- **Server Action**:
  1. Computes SHA-256 deduplication hash.
  2. Resolves employee mapping in showroom.
  3. Inserts into `biometric_raw_punches`.
  4. Calculates attendance, late arrival, and working seconds in `attendance`.
  5. Replicates to physical MySQL location shard (`bsc_shard_bel`, etc.).
  6. Emits `biometric:punch` and `attendance:punch` over WebSockets.
- **Response**: `OK: <count>` (e.g. `OK: 1`).

### C. Hardware Telemetry & Option Registration
- **Request**: `POST /iclock/cdata?SN=<SERIAL>&table=options`
- **Body**: Key-value pairs (`Firmware=Ver 8.0.4.7`, `UserCount=15`, `FaceCount=15`, `FPCount=28`, `AttLogCount=620`, `IPAddress=192.168.0.136`).
- **Server Action**: Updates hardware metadata fields in `biometric_devices`.
- **Response**: `OK`.

### D. Continuous Heartbeat Monitoring
- **Request**: `GET /iclock/getrequest?SN=<SERIAL>`
- **Server Action**: Updates `lastHeartbeatAt` and emits `device:heartbeat` to the dashboard.
- **Response**: `OK`.

---

## 5. Database Schema & Multi-Tenant Sharding Integration

### A. Migrations Applied
- **Migration 018**: `database/migrations/018_essl_mb160_biometric_sync_setup.sql`
  - Adds telemetry fields: `lastHeartbeatAt`, `userCount`, `fpCount`, `faceCount`, `attLogCount`, `pushVersion`.
  - Fixes showroom mappings for Belagavi (`BEL`), Davanagere (`DAV`), and Shivamogga (`SHI`).
  - Applied across `bsc_textiles_hrms`, `bsc_shard_bel`, `bsc_shard_dav`, and `bsc_shard_shi`.

### B. Shard-Aware Write Path
When a punch is processed by `ingestRawPunches`:
1. It writes to the central Control Database (`bsc_textiles_hrms`).
2. It calls `shardRouter.resolveLocationDatabase(showroomCode)`.
3. If the showroom belongs to a physical operational shard (`BSC-SHARD-BEL-001`, `BSC-SHARD-DAV-001`, `BSC-SHARD-SHI-001`), it replicates the immutable punch to the shard's `biometric_raw_punches` table and writes the updated attendance calculation to the shard's `attendance` table.
4. If an unmapped PIN is scanned, it writes to `biometric_raw_punches` with `syncStatus = 'UNMAPPED'` and broadcasts an alert to the review queue without corrupting employee records.

---

## 6. Real-Time Frontend Dashboard Integration

Two primary pages receive live sub-second updates via WebSocket (`socketIO`):

1. **Biometric Devices Dashboard (`frontend/src/app/attendance/devices/page.tsx`)**:
   - Subscribes to `device:heartbeat`, `biometric:punch`, and `biometric:unmapped_punch`.
   - Device cards immediately reflect `CONNECTED` status, live latency, and last synchronization timestamp.
   - Raw punch ledger prepends incoming punches live with verify method badges (`FACE`, `FINGERPRINT`).
2. **Attendance Punches Monitor (`frontend/src/app/attendance/punches/page.tsx`)**:
   - Subscribes to `attendance:punch` and `biometric:punch`.
   - Attendance rows update dynamically on First-IN and Evening-OUT without full-page reloads.
   - Displays live toast notifications with employee name, showroom, and verification mode.

---

## 7. Automated Test Suite & Acceptance Results

Test suite location: `backend/src/tests/esslMb160Integration.test.ts`
Execution command: `node dist/tests/esslMb160Integration.test.js`

### Test Verification Matrix:

| Test ID | Test Specification | Result |
| :--- | :--- | :--- |
| **Test 1** | Protocol Body Parser correctly extracts PIN, timestamp, status, and MB160 face verifyMode (15) | **PASSED** |
| **Test 2** | Terminal Handshake (`GET /iclock/cdata`) updates device heartbeat and sets status `CONNECTED` | **PASSED** |
| **Test 3** | Hardware Telemetry (`table=options`) updates `userCount`, `faceCount`, `fpCount`, and `firmwareVersion` | **PASSED** |
| **Test 4** | Ingestion of PIN 1 Face verification calculates Check-In and sets `faceVerified = 1`, `faceMatch = 98.5%` | **PASSED** |
| **Test 5** | Idempotency & SHA-256 Deduplication: Repeated punch delivery is detected and safely skipped | **PASSED** |
| **Test 6** | Evening Check-Out punch updates `actualLogout`, calculates working seconds, and deducts 45-min break | **PASSED** |
| **Test 7** | Multi-Location Isolation: Davanagere PIN 7 and Shivamogga PIN 13 map to respective showrooms | **PASSED** |
| **Test 8** | Multi-Tenant Shard Persistence: Punches replicate durably to `bsc_shard_bel`, `bsc_shard_dav`, and `bsc_shard_shi` | **PASSED** |
| **Test 9** | Unmapped Employee Review Queue Isolation: Unregistered PIN 9999 is isolated into `UNMAPPED` queue | **PASSED** |
| **Test 10** | Device Registry displays `CONNECTED` status from ADMS push telemetry | **PASSED** |

**Summary: 10/10 automated tests passed with 100% success.**
**Sharding Architecture Regression Tests: 31/31 passed with 100% success.**
