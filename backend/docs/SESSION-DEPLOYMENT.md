# Deploying the session fixes

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
