# Attendance flow — terminal to screen

This is the path an attendance record takes in this system, end to end, and the
rules that decide what HR sees at each step. It describes the code as it is, not
as an ideal design: where a stage does not exist, that is stated.

```
eSSL MB160 terminal
   │  (1) push  POST /iclock/cdata?tableName=ATTLOG&...     adms.ts
   │  (2) pull  worker → ZK TCP 4370                        biometricWorker.ts
   │  (3) relay POST /api/devices/ingest-raw (connector key) devices.ts:1216
   ▼
biometric_raw_punches          ← immutable ledger, one row per device event
   │  dedupe, identity, verify mode, timezone
   ▼
attendance                     ← one row per employee per calendar day (summary)
   │  pairing engine computes durations, late/early, incentive, penalty
   ▼
read APIs → screens
   GET /api/devices/attendance-log      → dashboard ledger, /attendance/punches, /attendance/devices
   GET /api/attendance                  → attendance list
   GET /api/attendance/employee/:id     → the employee's own monthly view
   GET /api/attendance/monthly-matrix   → statutory register
   GET /api/attendance/exports/*        → Excel Download
   GET /api/live-activities             → Live Activities feed
```

## 1. How a punch enters the system

Three transports, one importer (`backend/src/services/biometric/ingest.ts`).

| Path | Who starts it | Entry point | Notes |
|---|---|---|---|
| ADMS push | the terminal itself | `POST /iclock/cdata`, `/push`, `/getrequest`, `/registry` | The device dials out, so the backend needs no inbound route to the device. This is the only path that works when the site has no route to the terminal's LAN. |
| ZK pull | the worker process | `backend/src/workers/biometricWorker.ts` → TCP `ipAddress:port` | Requires the API host to reach the terminal network. On this development machine every Davangere terminal reports `UNREACHABLE`; that is the truth, not a bug to hide. |
| Connector relay | `connector/bscBiometricConnector.ts` on a shop-floor PC | `POST /api/devices/ingest-raw` with `x-connector-key` | A PC that can see the terminals forwards verified records. The connector key is a secret; in development it falls back to a literal and the code throws in production if unset. |

Photos arrive with the punch (`photoBase64`) or are fetched later; they are
written outside the web root and referenced by `photoPath`. A missing photo is
reported as `No photo available from device` rather than replaced.

## 2. Deduplication

`dedupHash = hash(serialNumber + normalizedId + punchTimeUtc)` with a unique index
on `biometric_raw_punches.dedupHash`. A repeated delivery of the same event — the
commonest failure in the ADMS world, because the terminal retries until it gets a
`HTTP 200 OK` — inserts nothing and is counted as `recordsSkipped`. Repeated
*legitimate* punches from the same employee (in, out, lunch in, lunch out) are
distinct events and are never collapsed.

Idempotency is enforced by the database, not by application checks, so two
concurrent deliveries cannot both win.

## 3. Employee identity

Employee codes are **digits only**, 1-30 characters: migration 025 installed an
ENFORCED check on `employee.employeeCode` and every valid record obeys it, because
a device enrollment PIN has to be comparable to an employee code without a format
translation step. The ID generator (`services/employeeIdService.ts`) therefore
defaults to a numeric policy, refuses to mint anything the check would reject, and
`employee_id_sequence.format_key` is UNIQUE so two counters cannot exist at once
(migrations 043-045). A CSV import carrying `BSC-EMP-0036`-style identifiers
classifies them as `other-assigned` and preserves them for HR review.

`backend/src/services/biometric/employeeIdentity.ts` resolves the device user ID
(`enrollmentNumber`) to an employee:

1. exact `biometric_employee_mappings.enrollmentNumber`,
2. exact normalized PIN (`normalizedPin`),
3. exact `employee.employeeCode`,
4. exact `employee.biometricDeviceEmployeeId`.

**No substring or fuzzy matching.** One enrolled ID that maps to two employees is
recorded once with `mappingStatus = 'AMBIGUOUS'` and every candidate kept in
`mappingCandidates`; it is never guessed. Nothing found is
`mappingStatus = 'UNMAPPED'`, the row is kept with `employeeId = NULL`, and the
person appears in the exception queue (`GET /api/devices/unmapped`) for HR to
assign (`POST /api/devices/unmapped/:id/assign`). An unmatched event never creates
an employee.

## 4. Time and date

- `punchTime` — the wall clock string the terminal sent, in the terminal's zone.
- `rawTimezone` — that zone (`biometric_devices.timezone`, default
  `Asia/Kolkata`, overridable per device).
- `punchTimeUtc` — the same instant as an explicit UTC wall string, which is what
  every range filter compares against.

`backend/src/services/biometric/timeCodec.ts` owns the conversions
(`fromUtcMysqlString`, `wallTimeToInstant`, `deviceCalendarDate`,
`zoneOffsetMs`). The MySQL pool session runs at `+05:30`, so `punchTimeUtc` must
be read back as a wall string — `fromUtcMysqlString` does that, and a punch cannot
slide to the previous or next date because of the API host's timezone. A timestamp
in the future, or before the year 2000, is rejected as `INVALID_TIME` with the
reason stored, not silently repaired.

The **business date** of a punch is its store-timezone calendar date
(`deviceCalendarDate`), and that is the date `attendance.attendanceDate` uses.

## 5. Verification method

The terminal sends a small integer verify code. Which integer means "face" depends
on firmware, so the mapping lives in the editable table `verify_mode_mapping`
(`rawCode → label + methodFamily`), administered at
`GET|POST /api/devices/verify-mapping` and checked against the installed firmware
with the calibration tool (`POST /api/devices/calibration`).

`resolveVerifyMode()` (`backend/src/services/biometric/verifyMode.ts`) returns:

| Situation | `verifyModeLabel` | `methodFamily` | Face? |
|---|---|---|---|
| code present and mapped | the mapped label | mapped family | only if the family is FACE, or COMBINED and the label mentions face |
| code present, not mapped | `Unknown (7)` | `UNKNOWN` | no |
| no code in the payload | `Not reported by device` | `UNKNOWN` | no |

`involvesFace()` is what sets `attendance.faceVerified` on the device path. The
manual/QR screens may set it only from a value the caller actually reports —
`POST /api/attendance/punch` no longer defaults a score, so a punch recorded
without one stores `faceMatchPercentage = NULL` and `faceVerified = 0`. Nothing in
the application infers a method from the employee profile, the photo, or the time
of day.

**Match score.** `biometric_raw_punches.matchValue` is populated only when the
device sends one. As of this writing every row in the ledger has
`matchValue = NULL` (`SELECT COUNT(*) … WHERE matchValue IS NOT NULL` → 0): the
MB160 firmware and the ADMS payloads in use do not report a confidence value. Any
screen that showed "Face 96.4%" was inventing it, and those fallbacks have been
removed. `attendance.faceMatchPercentage` is written only from a reported value.

## 6. From events to a day (the summary)

`projectOntoAttendance()` in `ingest.ts` pairs a day's events into the
`attendance` row: first/last punch, `totalWorkingSeconds`, `breakSeconds`,
`effectiveWorkingSeconds`, `lateLoginSeconds`, `earlyLoginSeconds`,
`earlyLogoutSeconds`, `overtimeSeconds`, and the rupee columns
`earlyLoginIncentive`, `lateLoginPenalty`, `overtimeIncentive`,
`earlyLogoutPenalty` (`backend/src/core/services/AttendanceCalculationService.ts`
holds the shared rules: `computeShiftWindow`, `computeDurations`,
`deriveDisplayStatus`).

Raw events and the calculated day stay in separate tables on purpose. The
calculated row is derived data: when source events change (a mismatch is resolved,
an HR correction is approved) the day is recomputed rather than patched by hand,
and the change is written to `auditlog` with before/after values.

`attendance.status` is the HR-visible verdict (`PRESENT`, `LATE`, `ABSENT`,
`WEEKLY_OFF`, `OVERTIME`, …). A day with neither an attendance row nor any punch
has no status at all — the UI says `NO_RECORD` / "no terminal reported a punch".
It is never filled with an invented "Pending" attendance row.

## 7. Weekly off, holiday, approved leave, absent

These four are different facts and come from four places:

| Concept | Source | If the source is empty |
|---|---|---|
| weekly off | `weeklyoffrule` (per location/floor/department/employee/shift, `dayOfWeek` enum or rotational) | never inferred from the weekday — a Sunday is a working day until a rule says otherwise |
| holiday | `holiday` (date, name, optional location/department) | shown as no record |
| approved leave | `leave_applications` with `status = 'APPROVED'` | no leave days counted |
| absent | `attendance.status = 'ABSENT'`, written by the calculation or by HR | not used as a filler for "no punches" |

The shared loader is `loadCalendarContext()` in
`backend/src/services/attendance/attendanceWorkbook.ts`, used by both the Excel
exports and the employee self-service screen, so the two cannot disagree. As of
this writing `holiday` and `weeklyoffrule` contain **0 rows** — the screens say so
instead of assuming October holidays or Sunday offs.

## 8. Corrections

HR cannot overwrite a punch silently. `POST /api/attendance/corrections` creates a
request; `POST /api/attendance/corrections/:id/approve|reject` (Admin/HR only,
enforced server-side) applies it and writes an immutable audit entry with the
before and after values. Approvals re-run the day's projection, so the derived
numbers follow the corrected source.

## 9. Live updates

`backend/src/services/workforceEvents.ts` projects nine domain tables into
`workforce_event` (one row per real-world event, unique `dedupeKey`), and
`publishLive()` emits over socket.io on the `attendance` room. Clients
(`LiveActivitiesSection.tsx`) merge by event id, so a reconnect cannot duplicate a
row, and fall back to a 12-second poll when the socket is down. There is no
millisecond refresh loop: a terminal cannot produce events faster than that, and
pretending otherwise only burns requests.

**A punch is never shown as confirmed before it is committed.** The socket event is
published after the insert transaction resolves, and the ledger reads the database.

## 10. Exports

`GET /api/attendance/exports/monthly|annual|punches` streams `.xlsx` built from the
same queries the screens use (`attendanceWorkbook.ts` for the first two,
`services/biometric/exportWorkbook.ts` for the ledger). Values are typed cells with
formats; every text cell passes a formula-injection guard; unknown values are `—`,
never invented. Each download writes an `ATTENDANCE_EXPORT_DOWNLOAD` audit entry
with the filters and the row count, and above 5,000 rows a `MASS_EXPORT` security
event. See [ARCHITECTURE.md](ARCHITECTURE.md) for the module map.

## Where to look when numbers look wrong

[TROUBLESHOOTING.md](TROUBLESHOOTING.md) covers the failures that actually happen:
terminals unreachable, events `UNMAPPED`/`AMBIGUOUS`, clock drift moving punches a
day over, verify codes showing `Unknown`, and exports returning 403.
