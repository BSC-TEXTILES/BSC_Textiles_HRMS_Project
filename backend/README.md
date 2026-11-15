# HRMS backend

[Project overview](../README.md) · [Database](../database/README.md) · [Detailed guides](docs/README.md)

## Responsibilities

The Express API owns domain validation, sessions, permission/scope enforcement, database access, biometric ingestion, reports, file handling, notifications and background services.

| Location | Responsibility |
| --- | --- |
| src/index.ts | Middleware, HTTP server integration and service initialization |
| src/routes | Employee, organization, attendance, payroll, hiring, security and other HTTP endpoints |
| src/services | Domain logic, sessions, signing keys, biometric processing and hiring outbox |
| src/core | Shared infrastructure and sharding |
| src/tests | Regression and integration test entry points |
| docs | Architecture, deployment, security and operations |
| connector | Separate LAN edge connector |

## Request flow

~~~mermaid
flowchart TD
    Request[HTTP request] --> Middleware[Parsing and request guards]
    Middleware --> Auth[Route authentication and permissions]
    Auth --> Scope[Organization / location / record scope]
    Scope --> Service[Domain service]
    Service --> DB[(Database adapter / shard)]
    Service --> Audit[Audit and notification work]
    Service --> Response[JSON, file or export response]
~~~

Business routes are mounted under /api and /api/v1. Browser authentication uses /api/session; NextAuth uses /api/auth in the unified deployment. ADMS uses /iclock. Public hiring and terminal ingestion have different access controls from staff sessions; inspect route registration for exact requirements.

## Runtime modes

- **Unified production:** root server.js creates the early HTTP listener and shares it with Express, Socket.IO and Next.js. No backend child-process watchdog is required.
- **Standalone API:** src/index.ts creates its own listener, normally port 4000; development runs Next.js separately on 3000.
- **Device worker:** npm run worker:supervised starts a separate worker. DEVICE_SYNC_MODE selects cloud_push, local_lan or hybrid behavior.
- **Hiring outbox:** backend background service controlled by HIRING_OUTBOX_DISABLED and HIRING_OUTBOX_INTERVAL_MS.

Production boot fixtures are disabled by default. HRMS_BOOT_FIXTURES controls sample data; schema/reference initialization is separate and can still run. Inspect startup services before connecting development to a real database.

## Database and readiness

MySQL is the primary documented installation. Alternate PostgreSQL/SQLite adapters do not make the database workspace's MySQL migrations portable. The compatibility data-access facade does not require Prisma CLI migrations.

/ready and /api/ready check core user, consent, session, refresh-token and signing-key structures. This is a limited readiness test, not verification of every business table, shard or device. Missing session tables/columns produce DATABASE_SCHEMA_NOT_READY on the session error path. Account authentication failures require database configuration repair.

## Commands and tests

From the repository root:

~~~powershell
npm run dev:backend
npm run build:backend
npm run worker:supervised
npm run diagnose
~~~

Production normally uses root npm run build and npm start. A standalone compiled API can use npm run start --workspace=backend with its own runtime configuration.

~~~powershell
npx tsx --test backend/src/tests/mysqlAdapter.test.ts backend/src/tests/sessionSchema.test.ts
node --test server-runtime.test.js
~~~

Live/seed-based tests require an isolated environment. Read [security policy](../SECURITY.md), [RBAC](docs/RBAC.md), [testing](docs/TESTING.md) and [session deployment recovery](docs/SESSION-DEPLOYMENT.md). Preserve password/encryption secrets needed for existing data.
