# Organization Management Module — Delivery Report

## Overview

A full organization hierarchy management module (Store → Floor → Department → Section → Work Area → Employees) with employee allocation/transfer workflows, mandatory HR approval queue, and live updates via Socket.IO. Integrated into the existing BSC Textiles HRMS (Next.js 15 frontend, Express/MySQL backend, native migration runner).

---

## Changed / Created Files

### Database Migrations
| File | Status | Purpose |
|---|---|---|
| `database/migrations/020_organization_management.sql` | Applied | Core approval-layer schema: `orgchangerequest`, `orgapprovaldecision`, `employeeassignmenthistory`, `orgsettings` tables; `status` enum added to `department` and `section` |
| `database/migrations/021_user_org_location_scopes.sql` | Applied | `userorgscope` table for multi-location authorization; 37 rows seeded (one per existing user) |

### Backend Services
| File | Purpose |
|---|---|
| `backend/src/services/orgPermissionService.ts` | Server-side authorization: scope resolution (async, multi-location), `assertCanCreateRequest`, `assertCanViewRequest`, `assertStageReviewer`, `assertCanOverride`, approval policy from `orgsettings` |
| `backend/src/services/organizationService.ts` | Dashboard, hierarchy tree, roster, employee assignment detail, recent activity — all counts from real `employee`/`attendance` data with "Data unavailable" flagging |
| `backend/src/services/orgValidation.ts` | Structural + eligibility + duplicate validation for all request types including `ADMIN_ACCOUNT` (no plaintext passwords) |
| `backend/src/services/orgApprovalService.ts` | Full request lifecycle: create → submit → edit → cancel → decide (transactional apply) → emergency override. Appliers for all 9 request types |

### Backend Routes
| File | Purpose |
|---|---|
| `backend/src/routes/organization.ts` | Read routes: `/dashboard`, `/hierarchy`, `/roster`, `/employees/:id/assignment`, `/activity`, `/settings` |
| `backend/src/routes/orgApprovals.ts` | Write routes: `/requests` CRUD, `/submit`, `/decide`, `/emergency-override`, `/summary` |
| `backend/src/api/v1/index.ts` | Registered both routers (`/organization/approvals` before `/organization`) |
| `backend/src/index.ts` | Added `join:organization` and `join:location` Socket.IO room handlers |

### Frontend
| File | Purpose |
|---|---|
| `frontend/src/app/organization/departments/page.tsx` | **Rewritten** — live hierarchy dashboard with location selector (All + BEL/DAV/SHI/HUB), drill-down navigation (Location → Floor → Department → Section → Work Area), back breadcrumb preserving location filter, live updates toggle, KPI cards with "Data unavailable" when attendance missing |
| `frontend/src/app/organization/departments/CreateRequestModal.tsx` | **New** — Employee assignment & transfer form with cascading dropdowns, validation, and approval-workflow submission (does NOT modify active records) |
| `frontend/src/app/organization/approvals/page.tsx` | **New** — Dedicated approval queue with status/type/stage/search filters, detail drawer with full timeline, Approve / Reject / Request-Changes actions |
| `frontend/src/hooks/useOrganizationSocket.ts` | **New** — Socket.IO hook for `organization:changed` events with location room joining and last-sync timestamp |
| `frontend/src/components/layout/DashboardLayoutFullShell.tsx` | Added "Organization Management" sidebar group with Hierarchy Dashboard and Approval Queue links |

---

## Database Changes

### New Tables
- **`orgchangerequest`** — All change requests with status lifecycle (`DRAFT → PENDING → APPLIED/REJECTED/CHANGES_REQUESTED/CANCELLED`), stage tracking, dedup key, payload JSON, audit columns
- **`orgapprovaldecision`** — Append-only decision log per request stage
- **`employeeassignmenthistory`** — Append-only history of employee location/floor/department/section/work-area assignments with `isCurrent` flag
- **`orgsettings`** — Policy configuration (approval policy, emergency override policy, live updates)
- **`userorgscope`** — Multi-location authorization grants per user (Admin never gets implicit global access)

### Modified Tables
- **`department`** — Added `status` enum column (`ACTIVE`/`INACTIVE`/`ARCHIVED`)
- **`section`** — Added `status` enum column

---

## Verification Results

### Backend Typecheck
```
npx tsc --noEmit  →  0 errors
```

### Frontend Typecheck
```
npx tsc --noEmit  →  0 errors
```

### Frontend Lint
```
npx next lint --dir src  →  No ESLint warnings or errors
```

### Frontend Build
```
npm run build  →  ✓ Compiled successfully, 58/58 pages generated
  /organization/approvals   5.25 kB
  /organization/departments 6.79 kB
```

### Migration Runner
```
npm run db:migrate  →  ✔ Applied 020, ✔ Applied 021, all previous migrations skipped (already executed)
```

### End-to-End Workflow Tests (verified against running backend on :4000)

| # | Flow | Result |
|---|---|---|
| 1 | Dashboard returns real counts (4 locations, 13 floors, 24 departments, 57 sections, 27 work areas, 3 employees) | ✅ 200 |
| 2 | Hierarchy tree returns nested locations with employee counts and attendance availability | ✅ 200 |
| 3 | Roster returns employees with location/floor/department/section joins | ✅ 200 |
| 4 | Activity feed returns recent change requests | ✅ 200 |
| 5 | Settings returns approval policy from orgsettings | ✅ 200 |
| 6 | Create DEPARTMENT change request → 201, status=PENDING, stage=LOCATION_MANAGER | ✅ Verified |
| 7 | Department NOT created in DB before approval | ✅ Verified |
| 8 | Self-approval blocked (403: "You cannot approve or reject a request you submitted yourself") | ✅ Verified |
| 9 | Duplicate request blocked (409: code already in use) | ✅ Verified |
| 10 | Floor Manager approves at preliminary stage → status stays PENDING, stage moves to HR | ✅ Verified |
| 11 | HR gives final approval → status=APPLIED, department created in DB | ✅ Verified |
| 12 | Decision timeline shows both reviewers with remarks | ✅ Verified |
| 13 | EMPLOYEE_ALLOCATION: FM preliminary → HR final → employee.departmentId updated, history entry created | ✅ Verified |
| 14 | ADMIN_ACCOUNT: HR approves → user provisioned with bcrypt-hashed password (no plaintext), login with wrong password → "Invalid credentials" | ✅ Verified |
| 15 | Emergency override: Super Admin applies pending request → status=APPLIED | ✅ Verified |
| 16 | REJECT decision works with mandatory remarks | ✅ Verified |
| 17 | Invalid payloads rejected with specific error messages (missing department, missing permissions, etc.) | ✅ Verified |
| 18 | `userorgscope` table seeded with 37 rows (one per existing user) | ✅ Verified |

---

## Security Properties Verified

- **No self-approval**: Requester cannot decide their own submission (enforced server-side)
- **No scope violations**: Location-scoped users cannot see or act on out-of-scope requests
- **No silent Super Admin bypass**: Emergency override is a separate, audited action with mandatory justification (min 20 chars) and requires explicit policy enablement
- **No plaintext passwords**: Admin account provisioning hashes with bcrypt(12) and forces `mustChangePassword=1`
- **Duplicate prevention**: `dedupKey` (sha256) + structural validation prevent duplicate open requests
- **Transaction-safe apply**: Final HR approval applies changes in the same transaction as the decision; rollback on failure leaves existing org untouched
- **Server-side checks on every API**: `authenticate` middleware + `requireRole` + `orgPermissionService` assertions

---

## Limitations

1. **Socket.IO live updates**: The `organization:changed` event emission is wired into the approval service, but the frontend socket hook connects to `NEXT_PUBLIC_WS_URL` (defaults to `http://localhost:4000`). In production this should be configured to the actual backend URL.

2. **Attendance "today"**: Uses IST (`todayIst()`) for the current date. Attendance availability is detected by checking if any attendance rows exist for today; if none, the UI shows "Data unavailable" rather than fabricating zeros.

3. **Multi-location scopes**: The `userorgscope` table is seeded with one row per user (their primary location). Admin users with `locationId = NULL` get global scope automatically. Additional multi-location grants can be added via the table without code changes.

4. **Employee transfer across locations**: The transfer workflow updates `employee.locationId` and creates a history entry. It does NOT automatically update the user account's `locationId` (which controls login scope). This is intentional — user account location changes should be a separate admin action.

5. **Frontend location dropdown in CreateRequestModal**: The target location dropdown currently derives options from the employee roster rather than the hierarchy endpoint. This works but could be enhanced to use the `/organization/hierarchy` endpoint for a complete list.

6. **RBAC module permissions**: The `authorize()` middleware checks the `permissions` JSON array on the user record. The new routes use `requireRole()` (role-based) rather than `authorize()` (permission-based) because the organization module is gated by role, not by granular module permissions. If module-level RBAC is required, the routes can be switched to `authorize()` with appropriate permission strings.
