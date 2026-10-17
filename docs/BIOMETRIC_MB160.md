# eSSL MB160 (ZKTeco-based) attendance sync — setup, device settings, troubleshooting

Scope: how to run the biometric pipeline locally, what to configure on the
terminal, what each timestamp/mode value means, and what the MB160 genuinely
cannot do.

---

## 1. How the data flows

```
eSSL MB160 ──ADMS push──▶ POST /iclock/cdata?table=ATTLOG   (real time, <2s)
    │                     POST /iclock/cdata?table=ATTPHOTO  (snapshot, firmware dependent)
    │                     POST /iclock/cdata?table=USERINFO  (enrolments)
    │                     GET  /iclock/getrequest            (heartbeat + server commands)
    │
    └──ZK pull (TCP/UDP 4370)──▶ biometric worker ──▶ same ingestion engine

                    ┌──────────────────────────────────────────┐
                    │ services/biometric/ingest.ts (one engine) │
                    │  time → identity → dedup → attendance     │
                    └──────────────────────────────────────────┘
                          │                    │
              biometric_raw_punches      Socket.IO 'biometric:punch'
              + attendance rows           → browser feed (1–2s)
```

Both transports go through **one** ingestion engine, so deduplication, identity
resolution and time handling cannot drift apart per transport. A punch delivered
by push and later re-read by the poll is stored once.

---

## 2. Prerequisites

* Node.js 20+ and MySQL 8.0 (local install, no Windows service needed).
* The API (`:4000`), the web app (`:3000`) and the worker are three processes.
* `npm install` — on a machine without Visual Studio Build Tools use
  `npm install --ignore-scripts`. `better-sqlite3` cannot compile there, but it
  is only required lazily by the offline-desktop SQLite path; the MySQL path is
  unaffected.

## 3. Environment

Root `.env` (gitignored). Only these lines matter to the biometric pipeline;
everything else is the wider HRMS configuration.

```ini
DATABASE_URL="mysql://root@localhost:3306/bsc_textiles_hrms"
DB_TYPE="mysql"
PORT=4000
UPLOAD_DIR="./uploads"

# The browser must reach the Socket.IO server, which lives on the API process.
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
NEXT_PUBLIC_WS_URL="http://localhost:4000"

# Fallback defaults only. The authoritative values live in the database
# (biometric_devices / biometric_settings) and are edited on the device console.
BIOMETRIC_TERMINAL_PORT=4370
BIOMETRIC_DEFAULT_TIMEZONE="Asia/Kolkata"
BIOMETRIC_POLL_INTERVAL_MS=2500
BIOMETRIC_HEARTBEAT_TIMEOUT_SECONDS=15
BIOMETRIC_CONNECTOR_KEY="change-me-shared-with-the-edge-connector"
```

`frontend/.env.local` must carry `NEXT_PUBLIC_WS_URL` too — without it the
browser opens a socket against `:3000`, where no Socket.IO server exists, and no
live punch ever arrives.

## 4. Database bootstrap

```bash
npm run setup:local
# = db:schema (authoritative 38-table baseline)
#   → db:migrate (001-029, idempotent)
#   → db:seed    (locations, shifts, personas; skips datasets that target the
#                 deprecated plural schema)
#   → db:seed:biometric-demo (12 employees, 3 logins, 1 MB160 row)
```

> **Known pre-existing breakage.** `database/seeds/02`, `03` and `05` were
> exported from a production database whose schema differs from this repo: they
> insert `shift.earlyLoginRatePerSecond`, write to the deprecated plural
> `employees` table, and use `TEST-EMP-*` employee codes that migration `025`
> forbids with an enforced digits-only `CHECK`. `npm run db:setup` alone
> therefore produces a database with no users and no employees. The seeder now
> reports those files as *deferred* instead of aborting the chain, and
> `db:seed:biometric-demo` supplies a consistent dataset. `backend/src/scripts/setupOrganizationHubs.ts`
> still queries `TEST-EMP-*` codes and is affected by the same drift.

Log in at <http://localhost:3000/login> as `admin@bsctextiles.com` /
`password123`.

## 5. Running it

```bash
npm run dev                 # api :4000 + web :3000 + supervised worker
```

Or separately:

```bash
npm run dev:backend
npm run dev:frontend
npm run worker:supervised   # restarts the worker with exponential backoff
npm run device:simulator -- --mode=both --punch-every=6 --photos
                            # simulated MB160, for testing without hardware
```

The worker writes a heartbeat to `biometric_settings.workerHeartbeatAt` every
tick; `/api/health` reports its age.

## 6. Device-side settings checklist (on the MB160)

| # | Menu path | Value |
|---|---|---|
| 1 | Menu → Comm → Cloud Server Setting → **Enable** | On |
| 2 | … → **Host** / Server Address | IP of this machine (must be reachable from the terminal's VLAN) |
| 3 | … → **Port** | `4000` |
| 4 | … → **Path** / URL | `/iclock` |
| 5 | … → **Connection** | HTTP (not HTTPS on this build) |
| 6 | … → **Heartbeat / Keep Alive** | 5–10 s |
| 7 | Menu → Comm → **Communication Key** | same integer as the device's *Comm key* in the app |
| 8 | Menu → System → **Date/Time** | correct, or use "Sync device time" in the app |
| 9 | Menu → System → **Time Zone / GMT offset** | GMT+05:30 (the app also stores an IANA zone per device) |
| 10 | Menu → Options → Personalize → **Face Options → Face Threshold** | ~50% — **device-side only**, see §9 |
| 11 | Menu → User Management | enrol each person under their employee number |

After enabling, the terminal should appear **Connected** within ~15 s and punches
should appear in the feed within ~2 s.

## 7. Timestamps — the storage contract

The terminal sends *naive* wall-clock text (`2026-10-16 09:12:34`) with no offset.
Interpreting it in the server's OS timezone is what made dates look random.

* `biometric_raw_punches.punchTimeUtc` — the authoritative instant, stored as UTC
  wall time, written as an explicit string so the driver's session timezone
  cannot shift it.
* `rawDeviceTimeString` / `rawTimezone` — exactly what the device said and the
  zone it was read in, so any value can be re-derived.
* `punchTime` — kept for the rest of the HRMS, which reads this column. The
  shared pool pins `timezone: '+05:30'`, so it holds Asia/Kolkata wall time; it
  is derived from the same instant, never parsed independently.
* `attendance.attendanceDate` — the **device's** calendar day. A 04:55 IST punch
  belongs to that day even though it is 23:25 UTC the previous day.
* Display strings (`punchTimeLocal`) are produced server-side in the device's
  configured zone. The browser never re-derives them.
* Impossible dates are rejected and recorded in `biometric_rejected_punches`
  with a reason: `IMPOSSIBLE_DATE` (year < 2020), `FUTURE_DATED` (> 300 s ahead),
  `UNPARSEABLE`, `MISSING_TIME`.
* Clock drift is measured against the server on every poll and on
  "Read device info"; above `clockDriftWarnSeconds` (default 60) the console
  shows a banner and offers **Sync device time** (`CMD_SET_TIME`).

## 8. Verification modes

`verify_mode_mapping` is editable (device console → verify mapping, or
`POST /api/devices/verify-mapping`) and seeded with the usual ZK values:

| raw | label | family |
|---|---|---|
| 0 | Password | PASSWORD |
| 1 | Fingerprint | FINGERPRINT |
| 2 | Card | CARD |
| 3 | Fingerprint + Password | COMBINED |
| 4 | Fingerprint + Card | COMBINED |
| 5 | Password + Card | COMBINED |
| 8 | Card + Face | COMBINED |
| 9 | Face + Fingerprint | COMBINED |
| 10 | Face + Password | COMBINED |
| 15 | Face | FACE |

Rules:

* an unmapped code is stored and shown as **`Unknown (<code>)`** — never Card,
  never Face;
* a payload with no verify code at all stays **`Not reported by device`**;
* the raw code is always preserved in `rawVerifyType` / `rawPunchState`, so a
  mapping change can be applied retroactively.

**Calibration** (device console → Calibration) exists because these numbers are
firmware-specific: start a 2-minute capture, punch once per method at the
terminal, and the page lists the raw codes actually observed in that window.
Confirming a code updates the mapping and rewrites the stored labels — and a
code that was never observed cannot be confirmed.

## 9. Face matching threshold

The ~50% face match threshold is a property of the terminal, not of this
website. Set it on the device: **Menu → Options → Personalize → Face Options →
Face Threshold**. The site does not and cannot enforce it; it only displays the
match value the device reports (`matchValue`, exported as "Match %"). Where the
firmware reports nothing, the column says `not reported` — the previous
behaviour of writing a fixed 98.5% has been removed.

## 10. Employee id mapping

1. normalise: trim, drop separators, strip leading zeros;
2. exact full-id match;
3. else last-six-digits match;
4. more than one distinct employee at either step → **AMBIGUOUS**, with every
   candidate stored; nothing is guessed;
5. no match → **UNMAPPED**, kept in the ledger.

Unmapped and ambiguous punches appear on device console → **Unmapped**. Assigning
one creates the mapping (optionally), re-runs the projection and folds the punch
into the correct attendance row. Nothing is ever dropped.

## 11. Photos

* If the terminal pushes `ATTPHOTO`, the snapshot is validated by magic bytes and
  size, stored under `uploads/attendance/YYYY/MM/`, linked to its punch, and
  served from the API (`/uploads/attendance/...`).
* A punch with no snapshot shows a camera placeholder and the explicit text
  **"No photo available from device"**; the report's photo column is blank and
  the Excel sheet says why.
* Re-delivery in either order is handled: a photo arriving after its punch is
  merged onto the existing row, and a photo arriving first has the punch's
  verify code merged in later. Neither creates a second attendance record.

See §14 for what was and was not provable without real hardware.

## 12. Operational endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | API + worker age, connected/disconnected/drifting counts, held and rejected punch totals, newest punch |
| `GET /api/devices/status` | heartbeat-derived Connected/Disconnected, last-seen age, drift — no sockets opened |
| `POST /api/devices/:id/test-connection` | step-by-step: tcp → zk-handshake → device-time → clock-drift → log-read, first failure named |
| `GET /api/devices/:id/info` | live serial, firmware, platform, user/log counts, device clock, drift |
| `POST /api/devices/:id/sync-clock` | push server time to the terminal, re-measure drift |
| `POST /api/devices/:id/sync` | immediate ZK pull |
| `GET /api/devices/report` | filters: from, to, employeeId, employeeQuery, verifyMethod, serialNumber, deviceId, locationCode |
| `GET /api/devices/report/export?format=csv\|xlsx` | same filters, UTF-8 BOM CSV / Excel with autofilter |
| `GET /api/devices/unmapped`, `POST /api/devices/unmapped/:id/assign` | review queue |
| `GET/POST /api/devices/verify-mapping`, `DELETE /api/devices/verify-mapping/:code` | mode table |
| `POST /api/devices/calibration` (+ `/close`, `/confirm`) | firmware calibration |
| `GET /api/devices/rejected` | impossible/unparseable dates with reasons |

Authentication is a user JWT or the `BIOMETRIC_CONNECTOR_KEY` header
(`x-connector-key`).

## 13. Diagnostics and tests

```bash
npm run diagnose                          # every active device
npm run diagnose -- --device=bio-dev-demo-bel-001
npm run test:biometric                    # 48 checks: time, ids, modes, dupes, protocol, DB
```

`diagnose` walks config → DNS → ping → TCP 4370 → ZK handshake → device info →
serial match → device time/drift → last 5 logs → ADMS push endpoint → photos,
stops at the first fatal step and names it. Exit code = number of devices with a
problem.

Structured logs: console plus `logs/biometric-YYYY-MM-DD.log` (JSON per line,
with a stable `code`: `CONNECT_REFUSED`, `CONNECT_TIMEOUT`, `HOST_UNREACHABLE`,
`COMM_KEY_REJECTED`, `PROTOCOL_PARSE_FAILURE`, `DEVICE_TIME_DRIFT`,
`ATTLOG_EMPTY`, `HEARTBEAT_LOST`, `DB_FAILURE`, `PHOTO_UNSUPPORTED`).

## 14. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Feed empty, device "Disconnected" | Terminal not pointed at this host/port, or a different VLAN. Check §6 rows 1–5; run `npm run diagnose`. |
| Live updates absent, page otherwise works | `NEXT_PUBLIC_WS_URL` unset → socket connects to `:3000`. Set it to the API origin and restart `next dev`. |
| Times off by exactly 5:30 | A device row's `timezone` is wrong, or a legacy row predates `punchTimeUtc`. Set the zone on the device row; re-sync. |
| Dates land on the previous day | Fixed by using the device calendar day; if seen on old rows, they were written before migration 028. |
| Every punch says `Unknown (n)` | The firmware's codes are not in the table. Run Calibration and confirm them. |
| Face punch shows as Card | Same as above — calibrate; the code→label table is the single source. |
| `COMM_KEY_REJECTED` | Terminal Communication Key differs from the device row. |
| Punches pile up as AMBIGUOUS | Two employees share the last six digits. Revoke one mapping on the Mappings screen; then "Re-check all". |
| Worker not running | `npm run worker:supervised`. `/api/health` reports `workerHeartbeatAgeSeconds`. |
| Device clock drifts nightly | Dead RTC battery; the drift banner will fire. Replace the coin cell or schedule a daily "Sync device time". |

---

## 15. What the MB160 cannot do here (honest limits)

1. **Real-time events over the pull protocol do not exist.** A standalone
   MB160 never initiates a ZK pull-session event; live delivery requires ADMS
   push (`Realtime=1`), which this server implements. Where push cannot be
   enabled, the worker's 2.5 s poll is the best achievable latency.
2. **Attendance photos are not available over the ZK pull protocol.** The
   40-byte ATLOG record has no image. Snapshots can only arrive via an
   `ATTPHOTO` push, and whether the MB160 emits one is firmware-build
   specific — some eSSL builds accept a cloud server but never push images.
   Until a real snapshot is seen from your unit, the UI will keep showing
   "No photo available from device". The receiving, validation, storage and
   display path is implemented and verified against a simulated push.
3. **Face match score is generally not in the log record.** The console shows
   `not reported` rather than inventing a percentage.
4. **The face threshold and the enrolment templates live on the device.** The
   website cannot tighten or loosen matching; see §9.
5. **`SET TIME` granularity is one second**, so residual ±1 s drift after a sync
   is normal.
6. **Device-initiated commands are queued, not immediate.** With ADMS the server
   cannot dial the terminal; commands are delivered on its next
   `/iclock/getrequest` heartbeat.
7. **Verification against physical hardware has not been performed** — see the
   final report for exactly what was simulated.
