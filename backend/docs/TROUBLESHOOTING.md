# Troubleshooting

Ordered by the things that actually go wrong here. Each entry is
**symptom → why → how to check → what fixes it**, and where relevant, what *must
not* be done. Nothing in this file suggests inventing data to make a screen look
healthy.

Quick triage, in this order:

```
curl http://localhost:4000/api/health        # engines, security posture, config warnings
npm run diagnose                             # per-terminal transport + data-freshness verdicts
GET /api/devices/status                      # connection state, counters, last error per terminal
GET /api/devices/ops-summary                 # online/offline, open mismatches, unknown users
```

---

## 1. "No punches" on the dashboard or the ledger

The dashboard ledger reads `GET /api/devices/attendance-log` and shows only events
a terminal actually delivered, so an empty table is usually the truth.

| Check | Command | Meaning |
|---|---|---|
| Did any event arrive at all? | `SELECT source, COUNT(*) FROM biometric_raw_punches GROUP BY source;` | `ADMS_PUSH` / `ZK_PULL` / `CONNECTOR` tells you which transport is alive |
| Is the worker running? | `npm run worker` (or `worker:supervised`) | no worker + no push = no ZK-pulled punches |
| Is the device reachable? | `POST /api/devices/:id/test-connection` | reports the first failing step (DNS/TCP/handshake/auth/clock/log read) |
| Is the mode right? | `DEVICE_SYNC_MODE` | in `cloud_push` the worker deliberately skips private `192.168.x.x` addresses — those devices must push |

Do not "fix" this by inserting demo punches, re-seeding, or pointing the filter at
a date that has data. If the terminal is down, the screen should say so.

## 2. A row shows `Unmatched device ID`

The event arrived, but its device user ID matches no employee. Identity resolution
is exact-match only (mapping → normalized PIN → employee code →
`biometricDeviceEmployeeId`); there is no fuzzy fallback, by design.

```
GET  /api/devices/unmapped              # the HR queue, with candidates if any
POST /api/devices/unmapped/:id/assign   # assign the correct employee
```

The event is kept and is **not** attached to a similar-looking employee. Assigning
re-projects that employee's day and writes an audit entry.

## 3. Verification method shows `Unknown (7)` or `Not reported by device`

Either the firmware sends a code that `verify_mode_mapping` does not know, or the
payload carried no code. Both are honest outcomes.

```
GET  /api/devices/verify-mapping        # what the system currently understands
POST /api/devices/calibration           # discover what this firmware actually sends
```

Never "fix" an `Unknown` by editing the label to `Face` — that turns a device
silence into a false compliance claim. Add the mapping the calibration found.

## 4. A punch appears on the wrong date

Almost always one of:

- the terminal's clock is wrong → `GET /api/devices/:id/info` shows
  `clockDriftSeconds`; correct it with `POST /api/devices/:id/sync-clock`;
- the device's `timezone` column disagrees with where it physically is →
  `biometric_devices.timezone` (default `Asia/Kolkata`);
- an old row written before `punchTimeUtc` existed → `rawDeviceTimeString` +
  `rawTimezone` are used to recover the wall parts (see
  `timeCodec.fromUtcMysqlString` / tests for the 03:30/05:30 class of bugs).

The ledger stores the original device time and the UTC-normalised time side by
side. Do not edit one to make the other agree.

## 5. The same punch looks duplicated

Real repeat scans are legitimate (in, out, lunch in/out) and are preserved. The
dedupe key is `hash(serial + normalizedId + punchTimeUtc)` with a unique index, so
the *same* event delivered twice by a retrying terminal is skipped, not inserted:

```
SELECT COUNT(*) FROM biometric_sync_logs WHERE status='SUCCESS';   -- recordsSkipped
GET  /api/devices/raw-punches?employeeQuery=<code>&from=…&to=…     -- ordered ledger
```

If you genuinely see identical rows, check `dedupHash` for NULLs (rows written
before the column existed) rather than deleting rows.

## 6. Attendance Excel Download returns 403

```
{"error":"Forbidden","message":"Your role does not allow export on attendance.","module":"ATTENDANCE"}
```

Server-side truth: the endpoint requires `ATTENDANCE` + `export`. Currently only
`HR` and `SUPER_ADMIN` have it; `FLOOR_MANAGER` and `LEAVE_APPROVER` have `view`
only. Grant it on **Admin → Module access** (writes `rolepermission.can_export`),
or accept that the role should not export. The button is hidden in the sidebar for
roles without the grant; the API check is the real gate.

## 7. Export returns 429

`exportLimiter` allows 10 exports per minute per caller. Wait for `Retry-After`.
Large ranges are the usual cause of repeated clicking — narrow the period or use
the detailed-punch export with a filter.

## 8. The workbook downloads but has no rows

The file is correct; the period has no data. Day rows come only from
`attendance` rows and terminal events. Also remember:

- `holiday` and `weeklyoffrule` are **empty in this database**, so no day is
  classified `HOLIDAY` or `WEEKLY_OFF` unless `attendance.status` already says so.
  The workbook header prints those counts so the reader knows.
- Approved leave comes from `leave_applications` with `status='APPROVED'`.
- A blank cell is printed as `—`. It is never filled with a plausible default.

## 9. Sign-in says "Too many attempts"

That is the lockout working: 4 failures → 180 s cooldown that rejects even the
correct password, with a live countdown, and an Admin notification.

```
POST /api/session/login            # while locked it answers status=locked with retryAfterSeconds
SELECT email, success, failureReason, createdAt
  FROM login_attempt WHERE email = ? ORDER BY createdAt DESC LIMIT 10;
```

With `REDIS_URL` unset the counters live in process memory, so an API restart
clears them — recorded as a known gap in [SECURITY.md](SECURITY.md). Do not
"fix" a lockout by deleting rows from `login_attempt`; that destroys the brute-force
evidence.

## 10. Actions fail with CSRF errors after an API restart

The in-memory CSRF binding is gone while the database session survived.
`GET /api/session/status` re-issues the binding, so the next request works — reload
the page if it does not self-heal.

## 11. `/api/health` reports `degraded`

Read `configWarnings`. Common ones: `REDIS_URL` unset (rate limits, lockouts and
the token blacklist fall back to process memory), `BIOMETRIC_CONNECTOR_KEY` unset,
pepper missing. Degraded is also returned while a terminal is unreachable, which is
informational — the site is healthy, the device is not.

## 12. `employeeCode` / employee-ID format

Historically the API logged this on every start:

```
[setupFormerEmployees warning]: Check constraint 'employee_employeeCode_digits_only' is violated.
```

Migration 025 put an **enforced** check on `employee.employeeCode`
(`^[0-9]+$`, 1-30 characters) and every valid record is numeric — but the ID
generator still defaulted to a `BSC-EMP-` prefix, so it minted codes the database
rejects. An import of a new employee would fail at INSERT, and the demo seeder
tripped the constraint at boot.

Resolved by migrations 043-045: the policy is numeric everywhere (`NUMERIC`,
prefix empty, six wide, sequence lifted above the highest existing code), the
generator refuses to mint a code the check would reject,
`setEmployeeIdPolicy` refuses a non-numeric prefix, and
`employee_id_sequence.format_key` is now UNIQUE so two counter rows cannot exist
side by side. The check itself was **not** relaxed.

If a CSV import arrives with `BSC-EMP-0036`-style identifiers, they are classified
`other-assigned` and preserved for HR review — never silently rewritten. See
[ATTENDANCE_FLOW.md](ATTENDANCE_FLOW.md) for the identity rules.

## 12a. Demo and fixture data at boot

`scripts/setup*.ts` used to seed invented employees, attendance, break sessions,
retail sales, custody assets and document dossiers from the API process on **every
start** — and `setupEmployeeDocuments` began with `DELETE FROM employee_documents`,
destroying real uploads. Those fixtures are now opt-in:

| `HRMS_BOOT_FIXTURES` | `NODE_ENV=production` | development |
|---|---|---|
| unset | fixtures **off** | fixtures on |
| `false` | off | off |
| `true` | on (logged loudly) | on |

Schema/reference shaping (tables, views, the document-type catalogue, store
topology, salary cadres) always runs — the app needs it. The loopback simulator
terminal (`SIMMB160DEMO01`) is flagged `biometric_devices.isFixture = 1` and the
worker stops polling it as soon as fixtures are off. Boot prints
`[bootFixtures] ENABLED|DISABLED — <reason>`; if a production log does not say
DISABLED, someone set the flag.

## 13. Selecting a department empties the dashboard

The executive filter list is the company's 50 standard departments. The database
currently holds 6 department rows (`Sales & Retail`, `Store Operations`, `Human
Resources`, `Inventory & Logistics`, `Customer Service & Billing`, and duplicates
per store). A standard name with no matching department row legitimately has no
employees, so the filters return zero.

`/api/attendance/exports/*`, `/api/devices/attendance-log` and
`/api/reports/dashboard-summary` now accept a department **name or id**
(case-insensitive), so the filter works as soon as the department exists. To make
the list meaningful, create the departments (Admin → Departments) or reduce the
standard list to what the org actually uses — a product decision, not a code fix.

## 14. The dashboard ledger is empty for one role but full for another

The section is gated by the `PUNCH_LEDGER` widget, whose module is `ATTENDANCE`.
Roles without `ATTENDANCE` view never see it. Align widget visibility with the
matrix rather than loosening the API.

## 15. A device shows DISCONNECTED although it answers a ping

Ping is not the protocol. `status` comes from the ZK handshake in
`syncSingleDevice`/`test-connection`; ICMP success with a closed 4370 is exactly
"unreachable for our purpose", and the sync log records the timeout with the reason.
`npm run diagnose` prints the verdict per terminal.

## 16. Terminal shows the server as unreachable after deployment

- the terminal needs a hostname/port it can resolve — an HTTPS URL on 443 through
  Nginx, not `http://host:4000` from the internet;
- `/iclock/*` must be proxied without response buffering, or the terminal never
  gets its plain-text `OK`;
- the IP rule guard may be refusing the terminal's address — check the deny list in
  Admin → Security before assuming a routing problem.

---

## Escalation checklist before changing anything

1. Which transport should have delivered this event (push, poll, connector)?
2. Does the raw ledger contain it? If yes, the problem is projection/display; if
   no, the problem is the device or network.
3. Is the timestamp/timezone pair sane (`rawTimezone`, `punchTimeUtc`)?
4. Was the identity resolved (`mappingStatus`)?
5. Did the projection run (`syncStatus='PROCESSED'`, `attendanceId` set)?

Never resolve an attendance gap by deleting rows, disabling a constraint, replacing
real data with seeds, or displaying a value the device did not report.

Related: [ATTENDANCE_FLOW.md](ATTENDANCE_FLOW.md) ·
[DEVICE_SETUP.md](DEVICE_SETUP.md) · [SECURITY.md](SECURITY.md) ·
[TESTING.md](TESTING.md)
