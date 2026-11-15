# HRMS database workspace

[Project overview](../README.md) · [Backend](../backend/README.md) · [Deployment recovery](../backend/docs/SESSION-DEPLOYMENT.md)

## Scope and data domains

This workspace supplies native MySQL connectivity, sequential SQL migrations and schema/seed/maintenance scripts. The backend has a Prisma-like compatibility facade, but schema changes here use native SQL rather than Prisma CLI migrations. These scripts do not automatically provision the alternate PostgreSQL or SQLite adapters.

| Domain | Records and dependencies |
| --- | --- |
| Identity/security | Users, roles, permissions/scopes, sessions, refresh tokens, signing keys, consent and audit |
| Organization | Locations, departments, floors, sections, designations and approvals |
| Workforce | Employees, enrollment mappings, documents, status/history and workforce events |
| Attendance | Devices, raw punches, shifts, attendance, breaks, corrections and exceptions |
| Pay/policy | Leave, holidays, weekly offs, fines, incentives, payroll and exit records |
| Hiring | Forms, candidate data, shard/routing registry and outbox work |
| Operations | Showroom activities, notifications, selling points and custody assets |

~~~mermaid
flowchart LR
    Identity[Users and roles] --> Access[Permissions and scopes]
    Org[Organization / locations] --> Employee[Employees]
    Employee --> Mapping[Enrollment mapping]
    Devices[Terminal registry] --> Raw[Raw punches]
    Raw --> Mapping
    Mapping --> Attendance[Attendance]
    Rules[Shifts, leave and calendars] --> Attendance
    Attendance --> Payroll[Payroll and incentives]
    Hiring[Hiring applications] --> Candidate[Candidate storage]
    Access --> Services[Authorized services]
    Services --> Audit[Audit records]
~~~

This is a conceptual dependency diagram, not a complete foreign-key ERD. Migrations define exact names, constraints and compatibility views. See [sharding architecture](../backend/docs/DATABASE_SHARDING_ARCHITECTURE.md) for central/location/hiring storage.

## Configuration and commands

Set DATABASE_URL to the exact MySQL host, port, account and database. Percent-encode reserved characters in URI credentials. Keep DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME consistent for tools using discrete values. Inspect [src/pool.ts](src/pool.ts) and the specific script for its inputs. Keep .env, credentials and real dumps out of Git.

Run commands from the repository root:

| Command | Effect |
| --- | --- |
| npm run db:migrate | Apply pending migrations and verify core session schema |
| npm run db:schema | Execute consolidated baseline; use only on a suitable empty database |
| npm run db:seed | Seed/demo records; inspect before use |
| npm run db:setup | Migrate then seed; not production login recovery |
| npm run db:seed:biometric-demo | Biometric demo fixtures |
| npm run db:seed:rbac-demo | RBAC demo fixtures |
| npm run setup:local | Baseline, migrations and demo seeds; isolated local setup only |
| npm run typecheck --workspace=database | Check TypeScript scripts |

Do not rerun the baseline as a populated database repair. It overlaps early migrations and contains creation statements that can conflict with existing schemas.

## Migration lifecycle

[scripts/migrate.ts](scripts/migrate.ts) tracks versioned SQL files in _migrations. MySQL DDL can auto-commit; a failed file is not guaranteed to roll back atomically. The compatibility retry path tolerates selected errors, including some missing-object errors. Review output and resulting schema rather than assuming every statement ran.

The runner finishes by verifying required session structures. This detects unusable authentication schemas but does not certify every module or shard.

| Range | Main evolution |
| --- | --- |
| 001–010 | Identity, employees, attendance, payroll, operations, audit and workflows |
| 011–017 | Password security, leave/exit support, indexes, RBAC, imports, biometric integration and sharding |
| 018–029 | Device registry, organization scopes, roster/identifier compatibility and punch changes |
| 030–035 | Action permissions, widgets, self-service grants, credentials/tokens and privacy/configuration |
| 036–042 | Hiring, registry/permission reconciliation, device mismatches, workforce events and dual device modes |
| 043–046 | Numeric employee identifiers/sequences, fixture flags and test-state quarantine |
| 047–048 | Custody assets and Super Admin role ID reconciliation |

Some numeric prefixes have multiple files. Filenames and the ledger are authoritative; do not rename applied migrations.

## Installation and recovery

1. Confirm the target database and take a verified backup before modifying an existing installation. Some migrations reconcile or alter existing data.
2. Use credentials with required migration privileges and run npm run db:migrate.
3. Review output and final schema verification, then deploy/restart the application.
4. Check /api/ready and authorized login. Test affected business modules separately.
5. Provision an authorized administrator separately for a new production installation. Do not seed demo users into production.

ER_ACCESS_DENIED_ERROR means account/host authentication failed. Missing user or cookie_consent tables mean the selected database lacks required schema. If existing employee/account data should be present, select the correct populated database or restore a verified backup. Migrations do not recover lost records.

Read [backup/restore](../backend/docs/BACKUP_RESTORE.md). Include actual shards, uploaded files and stable password/encryption secrets in recovery planning; test restoration for the deployed environment.
