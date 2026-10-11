# Project Change Memory: Attendance & Shifts Board — Full-Stack Implementation

**Date:** 2026-10-11
**Ref:** `CHG-20261011-002`
**Scope:** Attendance & Shifts module (`/attendance/shifts`) — real-data filters, server-side pagination, shared calculation service, drill-down modal server mode, CSV export, RBAC scoping, automated tests.

---

## 1. Summary of Changes

The Attendance & Shifts page previously mixed client-side mock logic with partial API calls. This change set makes the page fully data-driven end-to-end:

1. **Shared Calculation Service** (`backend/src/core/services/AttendanceCalculationService.ts` — NEW):
   - Pure, unit-testable helpers: `computeShiftWindow` (handles overnight shifts rolling to the next calendar day), `computeDurations` (raw vs thresholded lateness, early login/logout, overtime, total working seconds), `deriveDisplayStatus` (12-state display status with a documented priority chain), `statusMatchesFilter` (PRESENT family / PUNCHED_IN / LATE token mapping), `describeException`, `tallyRows`.
   - Single source of truth so the board, reports and any future consumer agree on the numbers. No punch data is ever fabricated — missing punches stay null and unknown days derive honest statuses (`ABSENT`, `NOT_PUNCHED_IN`, `SCHEDULED`).

2. **Shift Board API** (`GET /api/attendance/shift-board` + `GET /api/attendance/shift-board/export` in `backend/src/routes/attendance.ts`):
   - One request returns summary counters, per-shift staff tallies, status options and paginated employee rows for a single date.
   - All five UI filters (Hub, Department, Shift, Attendance Status, Date) hit real database tables: `employee`, `attendance`, `shift`, `department`, `weeklyoffrule`, `holiday`, `employeebreak`, `leave_applications`, `attendancecorrection`.
   - Strict `YYYY-MM-DD` date validation (400 `INVALID_DATE` on malformed or impossible dates like `2026-02-30`); defaults to today when omitted.
   - Server-side pagination (`page`/`limit`), debounced search (`search`), exceptions-only mode (`exceptions=1`), sort (`sort=code|name|department|hub|shift|status|in|late`).
   - Location scoping via `getScopedLocationId` — a location-scoped HR requesting another hub is silently scoped back to their own hub (no cross-hub data leak).
   - CSV export with formula-injection guard (`csvCell` prefixes `'` for cells starting `= + - @`), UTF-8 BOM, filename `BSC_Shift_Board_<date>.csv`, 20 columns.

3. **Native ORM compound-unique fix** (`backend/src/nativeDb.ts`):
   - `buildWhereClause` now expands scalar plain objects whose keys match a compound-unique key (e.g. `{ a_b: { a, b } }`) into individual `col = ?` conditions. This repairs all 13 `findUnique({ where: { a_b: {...} } })` call sites across shifts, departments, sections, floors, attendance, qrCodes, incentives, liveStreams and observations.

4. **Shift CRUD time validation** (`backend/src/routes/shifts.ts`):
   - `startTime`/`endTime` accept `HH:MM` or `HH:MM:SS` only (regex `^\d{2}:\d{2}(:\d{2})?$`); ISO datetime strings return 400 with a clear `HH:MM format (24-hour)` message. Overnight shifts (end ≤ start) roll to the next day in `computeShiftWindow`.

5. **Frontend page rewrite** (`frontend/src/app/attendance/shifts/page.tsx`):
   - Consumes `GET /attendance/shift-board` with AbortController + request-id race guard, cache-busting `_ts` param, loading/error/retry states.
   - All Hubs chip is visible only to admin roles (`ADMIN_ROLES`); location-scoped users default to their own hub.
   - Department/Shift dropdowns are location-scoped via `/departments?locationId=…&limit=100` and `/shifts?limit=100`.
   - Date picker with prev/next/today; status meta strip and KPI cards (Active Shifts, Total Staff Rostered, Present On Floor, Absent/No Punch, Grace Period) are wired to real summary counters and open the corresponding drill-down.
   - Shift-card grid renders per-shift staff tallies, overnight badges and real grace/late values from the API; card click opens the roster drill filtered to that shift.
   - Create-shift modal sends `startTime`/`endTime` as `HH:MM` and busts the board cache after a successful create.

6. **Drill-down modal server mode** (`frontend/src/components/dashboard/DetailDrillDownModal.tsx`):
   - `shift-roster` and `shift-exceptions` metrics now call `GET /attendance/shift-board` (with `exceptions=1` for the exceptions view) instead of assembling mock rows client-side.
   - 18-column roster layout (Employee ID, Employee, Department, Hub, Designation, Employment Status, Scheduled Shift, Sched. In/Out, Actual In/Out, Attendance Status, Late, Early, Worked, Break, Record Date, Regularization) and a 13-column exceptions layout.
   - Debounced (300 ms) server-side search, server pagination ("Showing X–Y of Z"), blob CSV export via `/attendance/shift-board/export`, refresh preserving the current query and page.
   - Existing client-side paths (`shift-configs`, `muster`, `face`, `qr`, `incentives`, `compliance`) are untouched.

7. **Automated tests** (`backend/src/tests/attendanceBoard.test.ts` — NEW, wired into `runAllTests.ts` as Suite 14):
   - 21 pure unit tests for the calculation service (overnight windows, duration maths, status derivation priority, filter mapping, exception classification, tally aggregation).
   - 20 live API integration tests: default date, exact-date queries (`2026-10-01`, `2026-10-11` Sunday), invalid/impossible date rejection, hub scoping, department/shift/status/exceptions filters, pagination consistency, search, per-shift staff tallies, overnight flags, CSV export (header, filename, filter respect), shift create/delete with `HH:MM`, ISO rejection, and HR_EXECUTIVE cross-hub scoping.
   - Standalone runner (`npx tsx src/tests/attendanceBoard.test.ts`) plus integration into the full suite runner.
   - **All 41 tests pass** against the live dev database.

---

## 2. Modified & Created Files

| File | Status | Description |
|---|---|---|
| `backend/src/core/services/AttendanceCalculationService.ts` | **Created** | Pure shift-window, duration, status and tally helpers |
| `backend/src/routes/attendance.ts` | **Modified** | Strict date handling on `GET /`; new `GET /shift-board` and `GET /shift-board/export` |
| `backend/src/routes/shifts.ts` | **Modified** | `HH:MM` time validation on create/update |
| `backend/src/nativeDb.ts` | **Modified** | Compound-unique key expansion in `buildWhereClause` |
| `backend/src/tests/attendanceBoard.test.ts` | **Created** | 41-test suite (unit + live API) |
| `backend/src/tests/runAllTests.ts` | **Modified** | Wired in Suite 14 (AttendanceBoard) |
| `frontend/src/app/attendance/shifts/page.tsx` | **Modified** | Full rewrite against `/attendance/shift-board` |
| `frontend/src/components/dashboard/DetailDrillDownModal.tsx` | **Modified** | Server-side mode for `shift-roster` / `shift-exceptions` |

---

## 3. Verification

| Check | Result |
|---|---|
| `backend` `npm run typecheck` | ✅ Pass |
| `frontend` `npm run typecheck` | ✅ Pass |
| `frontend` `npm run lint` | ✅ Pass (only pre-existing warning in unrelated `selling-points/page.tsx`) |
| `frontend` `npm run build` | ✅ Pass |
| `attendanceBoard.test.ts` (standalone) | ✅ 41/41 pass |
| Live API smoke (filters, CSV, scoping, HH:MM) | ✅ All verified against `localhost:4000` |

---

## 4. Notes & Constraints Honoured

- No fabricated punch times or attendance records; derived statuses only.
- No hardcoded dates in queries — `2026-10-01`, `2026-10-11` etc. query their exact calendar dates.
- Existing branding, layout, colour palette and component conventions preserved.
- No new demo pages; the existing `/attendance/shifts` page was upgraded in place.
- Unrelated uncommitted working-tree changes (`sellingPoints.ts`, `runAllTests.ts` prior edits, `selling-points/page.tsx`, untracked scratch files) were left untouched.
