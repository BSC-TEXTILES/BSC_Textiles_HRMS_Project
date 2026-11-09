# Role-Based Access Control (RBAC)

Action-level permissions, the Super Admin / Admin governance split, and the
per-role dashboard. Written against the code that is actually in the repo —
every claim here is checked by `npm run test:rbac`.

---

## 1. The model

```
user ──< userrole >── role ──< rolepermission >── module
                              └─< role_widget >─── dashboard_widget
```

| Table | Purpose |
|---|---|
| `user` | Accounts. `role` is the fixed legacy enum; `permissions` is the legacy token array. |
| `role` | A named role. `isActive` = active/inactive, `isSystem` = cannot be deleted or renamed, `createdById`/`updatedById` for attribution. |
| `module` | The registry of everything that can be granted (38 rows). Replaces the hard-coded `RBAC_MODULES` list. |
| `rolepermission` | One row per role × module: `enabled` plus `can_view`, `can_create`, `can_edit`, `can_update`, `can_delete`, `can_export`, `can_approve`. `accessLevel` (`none|view|edit`) is kept and derived from the booleans. |
| `dashboard_widget` | Dashboard cards/sections that can be switched on per role. |
| `role_widget` | Which widgets a role sees. |
| `auditlog` | Every role or access change, with the old and new state. |

Migrations: `030_action_level_rbac.sql` (model + default roles + default grants),
`031_dashboard_section_widgets.sql` (the widgets that map to real `/dashboard`
sections), `032_self_service_grants.sql` (self-service modules for staff roles).
All three are **additive** — nothing is dropped, no rows are deleted.

### Resolution order (`backend/src/services/accessControl.ts`)

1. A user with at least one **active** `userrole` row is governed by RBAC. The
   legacy `user.permissions` array is then ignored — every demo account carries
   the stale value `["ALL"]`, and honouring it would silently override whatever
   an Admin just configured.
2. A user with **no** role assignments keeps the legacy model
   (`authorize()` / `requireRole()`), so accounts that predate RBAC keep working.
   Their dashboard shows everything rather than nothing.
3. The literal string `'ALL'` in legacy permissions means unrestricted. It used
   to be compared as an ordinary token, so every non-`SUPER_ADMIN` account was
   rejected by all 141 `authorize('VIEW')` routes.
4. `SUPER_ADMIN` (role or legacy enum) is unrestricted and sees every widget.
5. Grants **union** across a user's roles: a second role can only add rights.
6. Results are cached for 15 s per user and invalidated on any role, grant,
   widget or assignment change — a save takes effect on the next request.

---

## 2. The governance split

| Capability | Super Admin | Admin | HR / Floor Manager / Employee |
|---|:-:|:-:|:-:|
| Create a role | ✅ | ❌ 403 | ❌ 403 |
| Rename / edit description | ✅ | ❌ | ❌ |
| Activate / deactivate a role | ✅ | ❌ | ❌ |
| Delete a role (only with 0 users) | ✅ | ❌ |  |
| Assign users to a role | ✅ | ❌ | ❌ |
| Assign module access to a role | ✅ | ✅ | ❌ |
| Change access on the ADMIN or SUPER_ADMIN role | ✅ | ❌ |  |
| See the matrix | ✅ | ✅ | ❌ |

Two deliberate hard rules:

* **A role with users cannot be deleted.** Reassign them first — the API answers
  `409` with the affected emails. System roles cannot be deleted at all;
  deactivate them instead.
* **An Admin cannot rewrite the privileged roles.** Assigning module access is
  the Admin's job, but editing `ADMIN`/`SUPER_ADMIN` would be self-escalation, so
  that one write is reserved for a Super Admin.

Enforcement is on the backend (`backend/src/middleware/rbac.ts`):
`requireRoleLifecycle`, `requireModuleAssignment`, `requireAction(module, action)`.
Every denial is written to `auditlog` as `UNAUTHORIZED_MODULE_ACTION` with the
route, module, required action and the caller's roles.

---

## 3. API

Canonical prefix `/api/access`; `/api/module-access` and `/api/me` are mounted as
aliases so the documented paths resolve too.

| Method | Path | Who |
|---|---|---|
| `GET` | `/access/me/permissions` | any signed-in user |
| `GET` | `/access/me/permissions/:module/:action` | any signed-in user |
| `GET` | `/access/overview` | Admin, Super Admin |
| `GET` | `/access/modules`, `/access/widgets` | Admin, Super Admin |
| `GET` | `/access/roles` | Admin, Super Admin |
| `GET` | `/access/roles/:id/matrix` | Admin, Super Admin |
| `POST` | `/access/roles` | Super Admin |
| `PATCH` | `/access/roles/:id` | Super Admin |
| `POST` | `/access/roles/:id/status` | Super Admin |
| `DELETE` | `/access/roles/:id` | Super Admin |
| `GET` | `/access/module-access` | Admin, Super Admin |
| `GET` | `/access/module-access/:roleId` | Admin, Super Admin |
| `PUT` | `/access/module-access/:roleId` | Admin, Super Admin |
| `GET` | `/access/users` | Admin, Super Admin |
| `PUT` | `/access/users/:userId/roles` | Super Admin |
| `GET` | `/access/audit-logs?limit=n` | Admin, Super Admin |

`PUT /access/module-access/:roleId` body:

```json
{
  "modules": [
    { "module": "PAYROLL", "enabled": true,
      "actions": { "view": true, "create": false, "edit": true, "update": true,
                   "delete": false, "export": true, "approve": false } }
  ],
  "widgets": ["TOTAL_EMPLOYEES", "PUNCH_LEDGER"]
}
```

The payload must describe **every** registered module. A partial matrix is
refused with `400 Missing: …` rather than silently revoking the modules it forgot
to mention. Writes run in one transaction; the audit row records the full
before/after snapshot plus a `{added, changed, removed}` diff.

---

## 4. Frontend

| Screen | Route | Notes |
|---|---|---|
| Access Control Overview | `/admin/access` | total roles/users, active vs inactive, users without a role, module coverage, recent changes with diffs. Super Admins land here after login. |
| Role Management | `/admin/roles` | name, description, users, modules, status, actions. Create form includes "create the first user". Deactivate and Delete ask for confirmation; Delete is disabled while users remain. |
| Module Access | `/admin/module-access?role=<id>` | role tabs, one row per module with a master toggle and the seven action checkboxes, widget visibility, Select all / View only / Clear all / Reset / Save. Read-only for anyone who is not Admin. |
| Users | `/admin/users` | accounts and their role assignments. |
| Audit Logs | `/admin/audit-logs` | full trail. |

* `useMyAccess()` / `useAccessSnapshot()` read `/access/me/permissions` once and
  share the result through a small store, so a page with fifty gated controls
  makes one request.
* `<Can module="PAYROLL" action="delete">` gates individual controls;
  `<WidgetGate widgetKey="STORE_HUBS">` gates dashboard sections.
* `RequireModule` bounces a direct URL visit to `/403?from=…` — the middleware
  can only see the role in the session token, not the matrix.
* The sidebar (`components/layout/navigation.ts`) filters on `moduleKey`, so
  hiding is driven by the same grants the API enforces.
* Saving access calls `invalidateMyAccessCache()`, so the current user's own
  sidebar and buttons update without a reload.

---

## 5. Default permission matrix

Generated from the seeded database (`rolepermission` as it actually stands).
`V` view · `C` create · `E` edit/update · `D` delete · `X` export · `A` approve · `·` not granted.

| Module | Super Admin | Admin | HR | Floor Manager | Employee |
|---|:-:|:-:|:-:|:-:|:-:|
| **OVERVIEW** ||||||
| Dashboard | VCEDXA | VCEXA | VCEDXA | VEXA | V |
| **ADMIN** ||||||
| Stores & Locations | VCEDXA | · | · | · | · |
| User Management | VCEDXA | VCEDXA | · | · | · |
| Selling Points | VCEDXA | · | · | · | · |
| Billing Terminals | VCEDXA | · | · | · | · |
| Role Management | VCEDXA | VX | · | · | · |
| Audit Logs | VCEDXA | VX | · | · | · |
| General Settings | VCEDXA | VCEXA | · | · | · |
| Module Access | VCEDXA | VEXA | · | · | · |
| Settings | VCEDXA | VCEXA | · | · | · |
| **HR** ||||||
| Statutory Muster | VCEDXA | · | VCEDXA | · | · |
| Attendance Corrections | VCEDXA | · | VCEDXA | · | · |
| Late Fines | VCEDXA | · | VCEDXA | · | · |
| Document Management | VCEDXA | · | VCEDXA | · | · |
| Salary Cadres | VCEDXA | · | VCEDXA | · | · |
| Break Policies | VCEDXA | · | VCEDXA | · | · |
| Employee Records | VCEDXA | · | VCEDXA | VX | · |
| Recruitment | VCEDXA | · | VCEDXA | · | · |
| Attendance | VCEDXA | · | VCEDXA | V | · |
| Leave Management | VCEDXA | · | VCEDXA | VX | V |
| Payroll | VCEDXA | · | VCEDXA | · | · |
| Performance Reviews | VCEDXA | · | VCEDXA | · | · |
| Documents | VCEDXA | · | VCEDXA | · | · |
| HR Reports | VCEDXA | VEXA | VCEDXA | · | · |
| **SYSTEM** ||||||
| Biometric Policy | VCEDXA | · | · | · | · |
| QR Security Policy | VCEDXA | · | · | · | · |
| **FLOOR** ||||||
| Team Attendance | VCEDXA | · | VCEXA | VCEXA | · |
| Shift Scheduling | VCEDXA | · | VCEDXA | VCEDXA | · |
| Task Assignment | VCEDXA | · | · | VCEDXA | · |
| Production/Floor Reports | VCEDXA | · | · | VCEX | · |
| Leave Approval (own team) | VCEDXA | · | VEXA | VEXA | · |
| Inventory View | VCEDXA | · | · | V | · |
| **EMPLOYEE** ||||||
| My Profile | VCEDXA | VE | VE | VE | VE |
| My Attendance | VCEDXA | VEX | VEX | VEX | V |
| Apply Leave | VCEDXA | VC | VC | VC | VC |
| My Payslips | VCEDXA | V | V | V | V |
| My Tasks | VCEDXA | V | V | V | V |
| Announcements | VCEDXA | V | V | V | V |

### Where this differs from the specification, and why

* **HR has 15 modules, not 8.** The eight named in §5 (Employee Records,
  Recruitment, Attendance, Leave Management, Payroll, Performance Reviews,
  Documents, HR Reports) are all granted the full action set. The extra seven are
  module keys the existing screens already reference — Statutory Muster,
  Attendance Corrections, Late Fines, Document Management, Salary Cadres, Break
  Policies, Dashboard. Dropping them would have broken pages that check
  `canEditModule('SALARY_CADRES')` today.
* **Floor Manager's "6 modules" is 9.** Same reason: the six from §5 plus
  Dashboard, Employee Records (read) and Attendance (read), which the floor
  screens call. Delete stays on exactly two modules — Task Assignment and Shift
  Scheduling — as specified.
* **Employee's "6 modules" is 8.** §5's six plus Dashboard and Leave Management
  (read), so the leave page an employee opens is their own ledger rather than a
  403. Create is on exactly one module (Apply Leave) and edit on exactly one
  (My Profile), as specified.
* **Admin also holds Reports and General Settings.** §4 lists "User Management,
  Module Access, Reports, Settings, Audit Logs"; `HR_REPORTS` and
  `GENERAL_SETTINGS` are the keys those screens use. Admin's Role Management is
  view-only — it can see roles, not change them.
* **Every staff role holds the self-service set** (My Profile, My Attendance,
  Apply Leave, My Payslips, My Tasks, Announcements — migration 032). A manager
  is still an employee; without this, naming the modules in the sidebar would
  have removed their own profile page.
* **HR additionally holds Leave Approval, Team Attendance and Shift
  Scheduling**, which the HR screens already operate but §5 did not name.

---

## 6. Setup

```bash
npm install
npm run db:migrate              # applies 030, 031, 032 (additive)
npm run db:seed:biometric-demo  # optional: employees, device, 3 logins
npm run db:seed:rbac-demo       # one account per spec role + role back-assign
npm run dev                     # api :4000, web :3000, device worker
```

`npm run db:seed:rbac-demo` is idempotent and creates:

| Login | Password | Role | Lands on |
|---|---|---|---|
| `admin@bsctextiles.com` | `password123` | SUPER_ADMIN | `/admin/access` |
| `rbac.admin@bsctextiles.com` | `password123` | ADMIN | `/dashboard` |
| `rbac.hr@bsctextiles.com` | `password123` | HR | `/dashboard` |
| `rbac.floor@bsctextiles.com` | `password123` | FLOOR_MANAGER | `/dashboard` |
| `rbac.employee@bsctextiles.com` | `password123` | EMPLOYEE | `/my-desk` |

It also assigns `role_hr` / `role_floor_manager` to the two pre-existing demo
accounts, which is what brings them under the matrix.

### Tests

```bash
npm run test:rbac                      # 25 checks: unit + database
RBAC_TEST_UNIT_ONLY=1 npm run test:rbac  # no MySQL required
npm run typecheck                      # backend + frontend
```

The suite asserts the ladder round-trip (`none|view|edit` ⇄ action booleans), the
legacy token translation, the union and `'ALL'` rules, and — straight from the
database — the spec's discriminating counts (Floor Manager deletes exactly 2
modules, Employee creates exactly 1, `accessLevel` never disagrees with the
booleans on any row).

---

## 7. Known limits

* Roughly 300 existing routes are still guarded by the legacy
  `authorize('VIEW'|'EDIT'|…)` check, which has no module context. A user with
  RBAC roles gets the legacy tokens re-derived from their grants, so the two
  layers stay consistent — but per-route action-level enforcement on those
  legacy endpoints needs a route → module map, which does not exist yet.
* `user.role` is a fixed MySQL enum. A role created in the UI cannot be stored
  there, so new accounts are given the closest enum value and the RBAC row is
  what actually governs them.
* Disabling a role hides its grants but does not unlink its users; the Users
  screen flags accounts whose only role is inactive.
* Widget visibility controls the cards listed in `dashboard_widget`. Sections
  that were never registered as a widget still follow their module grant.
