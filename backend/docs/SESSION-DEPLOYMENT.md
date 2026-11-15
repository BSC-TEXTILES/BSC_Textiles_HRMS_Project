# Deploying the session fixes

## Database authentication and startup diagnostics

The hosting account supplied on 15 November 2026 uses database
`u101820758_hrms` and MySQL user `u101820758_hrms_bsc`. The `1 MB` shown
beside the database in hPanel is its size, not part of its name. The environment
template now uses these distinct names and password placeholders. The local
private environment preserves its existing password until the new account's
password is supplied. The hostname was not supplied with the account details;
the retained `127.0.0.1:3306` must be confirmed for the hosting environment.

For this deployment the HQ/BEL/DAV/SHI aliases intentionally select the same
database. Replace the password in all five URL values and in DB_PASSWORD and
MYSQL_PASSWORD when changing credentials. Do not copy placeholder passwords
from the example into a live deployment. After authenticating to the new
database, run `npm run db:migrate` on the host, check `/api/ready`, and provision
an authorized administrator or restore the intended existing records. Creating
a new empty database does not transfer previous employees or accounts.

`DATABASE_URL_HQ` overrides `DATABASE_URL` for the shard registry and hiring
outbox. Update it together with the main URL, or leave it empty to use the main
URL. Also review `DATABASE_URL_BEL`, `DATABASE_URL_DAV` and `DATABASE_URL_SHI`:
an intentional single-database deployment uses the same target for all aliases;
separate shards need their own valid database credentials. Keep discrete DB_*
and MYSQL_* account fields consistent for maintenance tools. Never print the
password or commit the private `.env` file.

Hostinger environment variables can override `.env`; a Git push does not update
those values. Replace stale hosting values and restart. If the correct username
still receives `ER_ACCESS_DENIED_ERROR`, reset/verify that MySQL user's password
and grants in hPanel and update the private runtime configuration. Code cannot
repair a rejected server-side password.

Startup now checks database connectivity before running database setup tasks.
A failed shard registry is cleaned up and does not start the hiring outbox.
Failed tasks are reported as incomplete instead of an unconditional success.
The backend startup log reports the actual shared listener port.

The Redis fallback message means the configured Redis service is unavailable.
Configure a reachable Redis URL if shared state is required. For an intentionally
single-process installation using memory, leave REDIS_URL empty and keep
REDIS_REQUIRED=false; counters then reset on restart and are not shared across
instances. Do not disable required Redis merely to hide connection failures.

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
