# Deploying the session fixes

## Missing tables after connecting to MySQL

`ER_NO_SUCH_TABLE` for `user` or `cookie_consent` means the application can
connect, but the selected database does not contain the required schema.
A code push alone cannot restore those tables or existing employee accounts.
First confirm that DATABASE_URL selects the intended HRMS database. If it should
contain existing records, restore the verified backup or select the populated
database before running migrations. Do not seed demo accounts into production.

For the intended new database, run from the deployed repository root with the
Hostinger environment configured:

```sh
npm run db:migrate
npm run build
```

`npm run build:hostinger` combines these steps for a hosting build environment
that has database access. Restart the application after successful completion.
The migration command now verifies the core session schema before reporting
success; `/api/ready` also checks the schema rather than just the connection.
Existing migrations do not restore missing user data. A new installation needs
an authorized administrator account provisioned separately.

The unified Hostinger application starts with `npm start` (root `server.js`).
Build both workspaces with `npm run build` before restarting it. The unified
server binds `PORT` immediately and runs Express, Next.js and Socket.IO in one
process on that listener. It does not fork backend processes or use port 4000.
This avoids Hostinger's startup timeout and the previous respawn storm.
The root server supplies its internal API address at runtime. Standalone
frontend deployments must set `BACKEND_URL` to the backend origin, without `/api`.

Set `DATABASE_URL` to the exact MySQL host, database, username and password
assigned in hPanel. Percent-encode reserved characters in URI credentials.
Verify that the user has access to that exact database. The adapter no longer
tries committed credentials, guesses hosting accounts, or picks a database
from `SHOW DATABASES`. Existing installations relying on that behavior must
correct their configuration before restarting. Keep existing authentication
and encryption secrets; replacing them can invalidate passwords or stored data.

After deployment, check:

- `GET /api/session/status` without cookies: 200 JSON, `authenticated: false`.
- `GET /api/session/consent`: 200 JSON.
- Sign in using an existing authorized account: session cookies are issued and
  the dashboard opens. Verify logout too.

A 503 with `AUTH_SERVICE_UNAVAILABLE` means the frontend cannot reach its API;
check the backend process log and runtime address. A database error requires
checking database configuration and connectivity. A plain-text 500, including
on `/api/health`, requires the Hostinger application startup/error log.

Regression checks (no production data or real credentials required):

```sh
npx tsx --test backend/src/tests/mysqlAdapter.test.ts frontend/src/tests/sessionProxy.test.ts
node --test server-runtime.test.js
npm run build
```
