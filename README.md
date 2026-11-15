# BSC Textiles HRMS

A multi-location human resources and showroom operations web application covering employees, biometric attendance, leave, payroll, hiring, organization management and administrative access.

This guide describes the source as of **15 November 2026**. Features present in source still require configured databases, permissions, devices and external services. A successful build does not establish production readiness.

## Documentation

- [Frontend](frontend/README.md), [backend](backend/README.md) and [database](database/README.md) workspace guides.
- [Documentation library](backend/docs/README.md) for detailed functional and operational guides.
- [Current Hostinger/session recovery](backend/docs/SESSION-DEPLOYMENT.md).
- [Edge connector](backend/connector/README.md), [security policy](SECURITY.md) and [change history](CHANGELOG.md).

## Technology and layout

| Layer | Implementation |
| --- | --- |
| Web UI | Next.js 15.5.29 App Router, React 18.3.1, TypeScript, Tailwind CSS |
| API | Express, Node.js 20+, TypeScript |
| Live updates | Socket.IO |
| Primary database deployment | MySQL with mysql2 and native SQL migrations |
| Additional adapters | Backend PostgreSQL and SQLite paths; provisioning is engine-specific |
| Authentication | Backend session/token services and NextAuth browser integration |
| Shared security state | Redis when configured; process-local fallback differs in durability and multi-instance behavior |
| Hardware | eSSL/ZKTeco protocol adapter, ADMS push, separate device worker/connector |
| Exports | ExcelJS and PDFKit |
| Packages | npm workspaces; packageManager specifies npm 10.8.2 |

~~~text
server.js                  Unified production startup and HTTP listener
server-routing.js          Dispatch between Express and Next.js
frontend/src/app/          Screens, layouts and Next API handlers
frontend/src/components/   Shared and domain UI components
backend/src/routes/        Business and administrative HTTP endpoints
backend/src/services/      Domain, security, biometric and hiring services
backend/src/core/          Shared infrastructure and sharding
backend/src/tests/         Regression and integration suites
backend/connector/         Showroom LAN-to-cloud punch forwarder
backend/docs/              Operational guides, design notes and reports
database/migrations/       Versioned MySQL changes
database/scripts/          Migration, schema, seed and maintenance commands
storage/ and uploads/      Runtime file storage
.env.example               Configuration template; real secrets stay private
~~~

## Modules

Screen availability depends on role permissions and organization/location scope. The API remains authoritative for access checks.

| Module | Functionality | Screens |
| --- | --- | --- |
| Dashboard | Workforce summaries and live operational activity | /dashboard |
| Employees | Active, inactive and former staff; profiles, history, analysis, imports and documents | /employees |
| Organization | Locations, departments, designations, floor managers, holidays and approvals | /organization |
| Attendance | Punches, register, muster, shifts, calculations, corrections, missed punches, breaks, late fines and exports | /attendance |
| Devices | Terminal registry, sync diagnostics, enrollment mapping and mismatch investigation | /attendance/devices |
| Leave | Leave requests and approval workflows | /leaves |
| Payroll | Salary structures, payroll views, payslips, reports and floor overview | /payroll |
| Incentives | Incentive records and calculations | /incentives |
| Operations | Selling points, shifts, observations, breaks, live attendance, streams, KYC and face verification | /operations |
| Hiring | Forms, candidate lists/details and settings | /hiring |
| Public applications | Application form reached by published code | /apply/[code] |
| Self-service | Personal work area and employee profile | /my-desk, /profile |
| Administration | Users, roles, module access, credentials, security, audit, settings, shards and database tools | /admin |
| Search/reporting | Cross-module search and reports | /search, /reports |
| Privacy/account | Login, password changes, consent and policy pages | /login, /change-password and policy routes |

See [RBAC](backend/docs/RBAC.md) for permissions. Financial results depend on validated attendance and configured policies; generating an export does not mean a payroll period has been approved.

## Architecture and data flows

### Production request flow

~~~mermaid
flowchart TD
    Browser[Browser] --> HTTPS[Hosting HTTPS endpoint]
    HTTPS --> Server[server.js shared PORT listener]
    Server --> Router[server-routing.js]
    Router --> Web[Next.js pages and selected APIs]
    Router --> API[Express API]
    API --> Guard[Session, permission and scope checks]
    Guard --> Services[Domain services]
    Services --> DB[(Database and configured shards)]
    Services --> Files[(Uploads and storage)]
    Services --> Redis[(Redis when configured)]
    Services --> Events[Notifications and activity events]
    Events --> Socket[Socket.IO on shared listener]
    Socket --> Browser
    Web --> Browser
~~~

Unified production runs Next.js, Express and Socket.IO in one process on one listener. The listener binds early and returns temporary 503 responses while initialization completes. It does not spawn a separate API process on port 4000.

Most /api requests go to Express. /api/auth belongs to NextAuth; selected dashboard read APIs stay with Next.js. [server-routing.js](server-routing.js) defines the exceptions. Express is also mounted under /api/v1. ADMS /iclock, health/readiness, attendance uploads and signing-key discovery have explicit backend routing.

### Login and authorization

~~~mermaid
sequenceDiagram
    participant U as Browser
    participant A as Express session API
    participant D as Database / security store
    participant N as NextAuth
    U->>A: POST /api/session/login
    A->>D: Verify account, password, login protection and optional MFA
    D-->>A: Authentication result
    A-->>U: Backend session cookies and exchange ticket on success
    U->>N: Complete browser session using ticket
    N->>A: Exchange one-use ticket
    A-->>N: Validated session information
    N-->>U: Browser session
    U->>A: Protected request with cookies
    A->>A: Validate session, action permission and record scope
    A-->>U: Authorized result or rejection
~~~

Backend access/refresh tokens use HttpOnly cookies. NextAuth supplies browser session integration, while backend authorization protects business data. In standalone frontend deployments the session proxy forwards to BACKEND_URL; unified production dispatches session requests directly to Express.

### Biometric attendance

~~~mermaid
flowchart TD
    Terminal[eSSL / ZKTeco terminal] -->|ADMS push| ADMS[/iclock routes]
    Terminal -->|LAN protocol| Poll[Local worker or edge connector]
    Poll -->|Connector upload| Ingest[/api/devices/ingest-raw]
    ADMS --> Process[Validate terminal, normalize time and deduplicate]
    Ingest --> Process
    Poll -->|Worker processing| Process
    Process --> Raw[(Raw punch evidence)]
    Raw --> Map[Map enrollment to employee]
    Map -->|Known employee| Attendance[Attendance and shift calculations]
    Map -->|Unknown or inconsistent| Review[Exception review]
    Attendance --> Views[Registers, live screens and exports]
    Attendance --> Payroll[Payroll inputs]
~~~

Reachability, device authentication, downloaded punches, employee mapping and attendance calculation are separate states. Ping alone does not prove synchronization. Unknown enrollments require review; do not invent punches or biometric match percentages. Holiday, weekly-off, leave and absence classifications remain distinct.

### Hiring and business processing

~~~mermaid
flowchart LR
    Form[Public application] --> Validate[Submission validation]
    Validate --> Hiring[Hiring service and protected candidate data]
    Hiring --> Store[(Configured hiring storage)]
    Hiring --> Outbox[(Outbox work)]
    Outbox --> Worker[Hiring outbox worker]
    Worker --> Followup[Configured follow-up processing]
    Staff[Authorized hiring staff] --> Hiring
    Org[Organization and employees] --> Rules[Scopes, shifts and policies]
    Rules --> Attendance[Attendance and leave]
    Attendance --> Pay[Payroll and incentives]
    Pay --> Reports[Reports and exports]
~~~

Outbox processing depends on working database access. Preserve encryption keys and validate shard routing against the [sharding guide](backend/docs/DATABASE_SHARDING_ARCHITECTURE.md). These diagrams describe logical flows, not every table or foreign key.

## Operating modes

Deployment mode, database engine and device synchronization mode are independent settings.

| Mode | Command/configuration | Behavior |
| --- | --- | --- |
| Local development | npm run dev | Frontend 3000 and standalone API 4000 by default |
| Unified production / Hostinger | npm run build then npm start | Shared hosting-assigned PORT |
| Development with device worker | npm run dev:all | Adds supervised polling/monitoring worker |
| Separate frontend/API | Workspace start commands after build | Requires explicit backend URL and proxy/cookie configuration |
| MySQL | DB_TYPE=mysql | Primary documented installation; database scripts target MySQL |
| PostgreSQL / SQLite | Backend adapter selection | Requires separate engine-specific schema validation |

Historical desktop/offline notes remain in the repository. Current package scripts do not provide an Electron installer or desktop packaging commands. SQLite support alone does not make every feature available offline.

| DEVICE_SYNC_MODE | Intended environment | Transport |
| --- | --- | --- |
| cloud_push | Cloud hosting | ADMS pushes; avoid polling unreachable showroom private IPs |
| local_lan | Authorized computer on terminal LAN | Native protocol polling |
| hybrid | Environment supporting both | ADMS plus LAN polling; verify worker ownership and deduplication |

The biometric worker runs separately with npm run worker:supervised. The edge connector is another LAN-to-cloud option; read its [limitations](backend/connector/README.md) before deployment.

## Local setup

Use an isolated development database. From the repository root:

~~~powershell
npm ci
Copy-Item .env.example .env
~~~

Edit .env privately. Set NODE_ENV=development; configure your database; set FRONTEND_URL and NEXTAUTH_URL to http://localhost:3000, BACKEND_URL to http://127.0.0.1:4000 and API_URL to http://127.0.0.1:4000/api. Keep NEXT_PUBLIC_API_URL=/api. Match HTTPS/cookie and CORS settings to local HTTP. Set HRMS_BOOT_FIXTURES=false if development sample data is unwanted.

~~~powershell
npm run db:migrate
npm run dev
~~~

Demo seed commands are separate and must only target isolated demo/test databases. They are not production login recovery commands. A new production database needs an authorized administrator provisioned separately; existing users need their original records and compatible password secrets.

## Environment configuration

[.env.example](.env.example) is the full template, not a ready-to-use production configuration.

| Group | Variables | Purpose |
| --- | --- | --- |
| Runtime | NODE_ENV, PORT, BACKEND_PORT | Shared listener or standalone API |
| Database | DATABASE_URL, DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME | Exact account/server/database; keep tool-specific fields consistent |
| Shards | DATABASE_URL_HQ, DATABASE_URL_BEL, DATABASE_URL_DAV, DATABASE_URL_SHI | Central and showroom stores |
| Web/API | FRONTEND_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, BACKEND_URL, API_URL, NEXT_PUBLIC_API_URL | Public origin, browser sessions and internal calls |
| Secrets | PASSWORD_PEPPER, TOKEN_KEY_ENCRYPTION_KEY, JWT_SECRET, HIRING_ENCRYPTION_KEY | Password verification, tokens and encrypted data |
| Transport | CORS_ALLOWLIST, TRUST_PROXY_HOPS, REQUIRE_HTTPS, COOKIE_SECURE, COOKIE_SAME_SITE | Actual HTTPS/proxy topology |
| Shared state | REDIS_URL, REDIS_REQUIRED | Shared security counters/cache and related state |
| Devices | DEVICE_SYNC_MODE, BIOMETRIC_CONNECTOR_KEY, polling overrides | Device transport and connector access |
| Background | HIRING_OUTBOX_DISABLED, HIRING_OUTBOX_INTERVAL_MS, HRMS_BOOT_FIXTURES | Scheduling and fixture policy |
| Storage/email | UPLOAD_DIR, SMTP_* | File persistence and notification delivery |

Keep .env out of Git. Percent-encode reserved characters in database URI credentials. Do not log passwords. Preserve existing encryption keys and password pepper across deployments. Coordinate rotation of credentials exposed in logs with the corresponding application configuration update.

## Production deployment

1. Confirm the intended populated database or intended new installation. Back up existing data before schema changes.
2. Supply real database credentials, stable secrets, public HTTPS origins, cookie settings and required Redis/shards. Replace demo URLs.
3. Run npm ci and npm run db:migrate against the intended database.
4. Run npm run build. npm run build:hostinger combines migrations and build when the build environment has database access.
5. Start/restart with npm start. The root server derives internal API addresses from the hosting-assigned PORT.
6. Verify /api/ready, anonymous /api/session/status, consent retrieval/save, authorized login/logout and real device ingestion separately.

A push delivers source code; it does not update hosting secrets, restore database records or prove deployment success. Follow the [current recovery guide](backend/docs/SESSION-DEPLOYMENT.md) when older hosting notes differ.

| Symptom | Next check |
| --- | --- |
| ER_ACCESS_DENIED_ERROR | Exact database account, password, host and grants |
| Missing user or cookie_consent table | Wrong/incomplete database; select/restore intended data or migrate an intended new database |
| DATABASE_SCHEMA_NOT_READY / readiness 503 | Required session schema and migration output |
| AUTH_SERVICE_UNAVAILABLE | Standalone frontend backend URL and API availability |
| Startup 503 | Temporary initialization; persistent failures need startup logs |
| Port 4000 respawn loop / spawn EAGAIN | Old child-process startup path; verify deployed revision and running processes |
| Consent save failure | Retryable UI error; inspect underlying API/database failure |
| No attendance | Transport, registry, real punches, enrollment mapping and worker state |

## Commands and verification

| Command | Purpose |
| --- | --- |
| npm run dev / dev:all | Development without/with device worker |
| npm run build / npm start | Build / unified production start |
| npm run db:migrate | MySQL migrations and core session schema verification |
| npm run worker:supervised | Device worker supervisor |
| npm run connector | Edge connector entry point; see its README limitations |
| npm run diagnose | Backend diagnostics |
| npm run typecheck / lint | Available workspace checks |
| npm test | Backend runner; inspect prerequisites first |
| npm run test:rbac / test:security / test:biometric | Focused backend suites |
| npm run secret-scan | Repository secret scan |

Startup/session regression checks:

~~~powershell
node --test server-runtime.test.js
npx tsx --test backend/src/tests/mysqlAdapter.test.ts frontend/src/tests/sessionProxy.test.ts backend/src/tests/sessionSchema.test.ts
npm run build
~~~

Live and seed-based tests require isolated test data and their external services. Builds do not verify production credentials, physical hardware or payroll accuracy.

## Recent changes in this checkout

- Early shared-listener Hostinger startup replaces backend process respawning.
- Explicit session routing and standalone proxy return controlled API-unavailable responses.
- MySQL uses configured credentials; removed guessed accounts and automatic database selection.
- Readiness and migrations check core session schema; missing session tables/columns produce controlled errors.
- Consent failures remain visible/retryable; cookies are written after successful persistence.
- Device mode controls, fixture flags and quarantine changes distinguish production evidence from test state.
- Later migrations cover hiring, workforce events, employee identifier reconciliation, custody assets and Super Admin role reconciliation, currently through 048.

See [migrations](database/migrations), [change history](CHANGELOG.md) and [documentation](backend/docs/README.md). Historical reports are point-in-time records, not current production certification.
