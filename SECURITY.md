# BSC Textiles HRMS — Security architecture, threat model and operations

Scope: the credential-management and enterprise security layer added on top of
the Role-Based Access Control system, plus the infrastructure that carries it.

This document states what is **enforced**, where it is enforced, and — just as
importantly — what is **not** enforced and why. Read section 15 before you
deploy. Every claim below names a file you can open.

---

## 1. Verify it yourself

```bash
npm run typecheck                 # all workspaces
npm run test:security             # lockout, rate limit, rotation, policy, cookie, CSRF
npm run test:rbac                 # action-level permission ladder
npm run test:biometric            # attendance pipeline regressions
npm run test:live                 # workforce event journal (idempotency, scoping)
npm run test:export               # attendance workbooks: content, formats, injection guard
curl -s localhost:4000/api/health | python -m json.tool | sed -n '/security/,$p'
```

`/api/health` reports the live posture: password hashing algorithm, token
signing algorithm and active `kid`, whether the shared store is Redis or
in-process, the configured rate limit, the lockout thresholds, and a
`configWarnings` array. **A non-empty `configWarnings` in production means the
deployment is not the one this document describes.**

---

## 2. Assets

| Asset | Where | Why it is worth attacking |
|---|---|---|
| Login IDs and password hashes | `user` table | Direct account takeover |
| Pepper | environment / `SECRETS_DIR` | Turns a hash dump back into a crackable set |
| ES256 signing private keys | `jwt_signing_key`, AES-256-GCM sealed | Minting arbitrary valid tokens |
| Session records and refresh tokens | `session`, `refresh_token`, Redis | Session hijack without any password |
| Employee PII (KYC, salary, attendance) | MySQL + shards | Identity theft, wage fraud |
| Biometric templates and face snapshots | MySQL, `/uploads` | Immutable credential — cannot be rotated |
| Audit log | `auditlog` | Its absence or tampering is the cover for the rest |
| Hiring candidate data | shard databases | Same class as employee PII |

---

## 3. Trust boundaries

```
                    ┌──────────────────────────────────────────────┐
  internet ───────▶ │ proxy (nginx)  ONLY :80 :443                 │
                    │  TLS 1.2+/1.3 · HSTS · rate limit · real IP  │
                    └───────────┬──────────────────┬───────────────┘
                                │ edge network     │
                     ┌──────────▼───────┐  ┌───────▼──────────┐
                     │ web (Next.js)    │  │ api (Express)    │
                     │ :3000 no publish │  │ :4000 no publish │
                     └──────────────────┘  └───┬──────────┬───┘
                                               │ services network (internal: true)
                                     ┌─────────▼──┐   ┌───▼────────┐
                                     │ db  MySQL  │   │ cache      │
                                     │ :3306      │   │ Redis :6379│
                                     └────────────┘   └────────────┘

  showroom terminals ──HTTPS──▶ /iclock/ ──▶ api      (device key + allowlist)
  edge connector       ──HTTPS──▶ /api/...             (x-connector-key)
```

Four boundaries matter, in decreasing order of how often they are crossed:

1. **Browser → proxy.** Untrusted input, always. Everything the client sends is
   re-validated server-side; the client's React state is a convenience, not an
   authority.
2. **Proxy → app/API.** Trusted for transport only. `TRUST_PROXY_HOPS=1` means
   exactly one `X-Forwarded-For` entry may be believed — `clientIpOf()` in
   `backend/src/middleware/securityGuards.ts` indexes from the *end* of the
   chain, so a client that appends its own forged value is ignored.
3. **API → database/cache.** Inside `internal: true`; no host interface, no
   published port, no route to the internet.
4. **Terminal → API.** Machines that cannot hold a browser session; they
   authenticate with a device key, and only over `/iclock/`.

---

## 4. Credential authority

The single most important rule in the product: **an Admin owns credentials, a
Super Admin does not.** Enforced in `backend/src/services/credentials.ts`
(`requireAdmin()` → `CREDENTIALS_ADMIN_ONLY`) and
`backend/src/middleware/rbac.ts` (`requireCredentialAdmin`), not by hiding
buttons.

| Action | Super Admin | Admin | HR / Manager | Employee |
|---|---|---|---|---|
| Create role, edit role, delete role | ✅ | ❌ | ❌ | ❌ |
| Assign module access to a role | ❌ | ✅ | ❌ | ❌ |
| Create a login ID + password | ❌ | ✅ | ❌ | ❌ |
| Change / reset someone else's password | ❌ | ✅ | ❌ | ❌ |
| Deactivate, activate, unlock an account | ❌ | ✅ | ❌ | ❌ |
| Change own password (current required) | ✅ | ✅ | ✅ | ✅ |
| View own data | ✅ | ✅ | ✅ | ✅ |
| Force another user to change password | ❌ | ✅ | ❌ | ❌ |
| View sessions / revoke / block IPs | ✅ | ✅ | ❌ | ❌ |

A Super Admin who calls `POST /api/credentials` receives **403
`CREDENTIALS_ADMIN_ONLY`** — the response does not depend on the UI. Verified by
the test `Super Admin cannot create or change credentials` in
`backend/src/tests/securityControls.test.ts`.

There is no self-registration (`ALLOW_SELF_REGISTRATION=false`) and no
anonymous forgot-password (`ALLOW_PUBLIC_PASSWORD_RESET=false`); those routes
return **410 `PUBLIC_RESET_DISABLED`**. `frontend/src/lib/auth.ts` no longer
contains the seed-admin quick-login list, and the mock BFF route that forged
JWTs has been deleted.

---

## 5. Password lifecycle

`backend/src/services/passwordPolicy.ts` + `passwordService.ts`.

- Minimum 12 characters, all four classes, evaluated **server-side** on every
  write and by `POST /api/session/password/evaluate` for the UI meter.
- Rejected if it is on the common-password list, contains the login ID or the
  name, or repeats any of the last `PASSWORD_HISTORY_COUNT` (5) hashes.
- Storage: `Argon2id(m = 64 MiB, t = 3, p = 4)` over
  `HMAC-SHA256(pepper, password)`, unique salt per hash. bcrypt cost 12 is the
  fallback if the native Argon2 module is unavailable.
- **The plaintext password is never logged, never returned by any API, never
  stored.** Admin-issued passwords are returned exactly once in the create /
  reset response and shown in a one-time modal; the audit row records
  `auto-generated` / `admin-supplied` / `redacted` instead.
- A pre-pepper hash still authenticates and is transparently re-hashed with the
  pepper on that successful login (`needsRehash`), so existing users were not
  forced into a reset.
- First login and any Admin reset set `mustChangePassword`; `authenticate()`
  then returns **403 `PASSWORD_CHANGE_REQUIRED`** for every route except the
  password-change endpoints, so a stolen temporary password cannot browse data.
- Expiry after `PASSWORD_EXPIRY_DAYS` (90) is enforced on login, with a
  grace-free rejection path.

---

## 6. Login protection

`backend/src/services/loginProtection.ts`, `captchaService.ts`,
`authentication.ts`.

Order of evaluation on `POST /api/session/login`:

1. **Cooldown check** — a locked account is rejected even with the *correct*
   password, with `retryAfterSeconds` for the countdown.
2. **CAPTCHA** — required from `CAPTCHA_AFTER_ATTEMPTS` (2) consecutive failures.
   Server-generated SVG, answer hashed in Redis with a 300 s TTL, single use,
   compared with `timingSafeEqual`.
3. Password verify. An unknown login ID verifies against a **dummy hash** so
   the response time does not reveal whether the account exists.
4. On success: clear counters, upgrade legacy hash, issue session + tokens.
5. On failure: `MAX_ATTEMPTS` (4) consecutive → `LOCKOUT_SECONDS` (180)
   cooldown, counters keyed by login ID *and* IP in Redis with TTL, mirrored to
   `login_attempt` for durability and for the dashboard.

Every response is the same generic `Invalid credentials` body and the same
status code, and every one is held until `LOGIN_MIN_RESPONSE_MS` (350 ms) has
elapsed. Argon2id already equalises the expensive branch, but a locked account
answers in about a millisecond while a real verification takes hundreds — without
the floor, timing alone reveals which login IDs exist and which are locked. The cooldown is per account by default. `LOCKOUT_PER_IP=true` extends it to the
whole source address, which is a real control and a real self-inflicted outage:
a showroom shares one NAT line, so four typos by one clerk would lock out every
colleague. Per-IP attempts are counted either way and feed the dashboard, the
brute-force alert and the auto-block list.

`ALERT_AFTER_LOCKOUTS` (2) escalates to the Admin by email and
webhook with the source IP and the last failure window; `ESCALATE_AFTER_LOCKOUTS`
can make it permanent until an Admin unlocks.

---

## 7. Rate limiting and IP rules

`backend/src/middleware/securityGuards.ts`.

- Global: `RATE_LIMIT_PER_SECOND` (100) per client IP, sliding window, one Lua
  script on Redis (`SLIDING_WINDOW_SCRIPT`) so the window is atomic and shared
  across API replicas.
- Sensitive (`/api/auth/*`, `/api/credentials/*`): 5 per 60 s keyed on
  IP **+ login ID**, so a botnet spraying one account still gets 5 tries per
  account per minute rather than 5 per IP.
- Responses carry `X-RateLimit-Limit`, `-Remaining`, `-Reset` and `Retry-After`;
  over the limit is **429**.
- `RATE_LIMIT_AUTOBLOCK_TRIPS` (5) trips → the IP gets a temporary `deny` row in
  `ip_rules` for `RATE_LIMIT_AUTOBLOCK_SECONDS` (900) and an Admin alert.
  `ipRuleGuard` runs before everything else, so a blocked IP is refused before
  any query is parsed. Admins manage the allow/deny list at
  `GET|POST|DELETE /api/admin/security/ip-rules`.
- The edge applies its own `limit_req` zones first (`infra/nginx/nginx.conf`) so
  most abuse never reaches Node at all.

---

## 8. Tokens

`backend/src/services/signingKeys.ts`, `tokenService.ts`.

| | Access token | Refresh token |
|---|---|---|
| Type | JWT, ES256 with `kid` header | opaque 256-bit random string |
| Lifetime | `ACCESS_TOKEN_TTL` (15 m) | `REFRESH_TOKEN_TTL` (7 d) |
| Stored where | nowhere; revoked by `jti` list in Redis | SHA-256 hash in `refresh_token` |
| Transport | `__Host-bsc_at` HttpOnly cookie | `__Host-bsc_rt`, `Path=/api/auth/session` only |
| Rotation | re-minted every 15 m | **every** refresh replaces it and invalidates the previous one |

- Claims: `iss`, `aud`, `sub`, `email`, `role`, `ptv` (permission/token version),
  `sid` (session id), `jti`, `iat`, `exp`. Nothing else — no PII in a JWT.
- Verification is pinned to an algorithm allowlist; `alg: none` and RS/HS
  confusion are refused, and the key is chosen by `kid`, never by the token's
  own claim. Public keys are published at `/.well-known/jwks.json` and
  `/api/auth/jwks.json`.
- **Reuse detection.** Presenting an already-rotated refresh token means the
  family is compromised: the whole family is revoked, every session for that
  user is ended, the user is forced to re-login, and a
  `SECURITY_EVENT_*` audit row plus an Admin alert are written. Covered by the
  test `refresh rotation spends the old token and reuse kills the family`.
- **Instant invalidation.** Changing a password, deactivating an account,
  unlocking it, or reassigning module access bumps `user.tokenVersion`; every
  `authenticate()` compares the `ptv` claim against the row and returns 401
  `TOKEN_STALE` on mismatch. Permission caches for that user are dropped at the
  same moment (`invalidateAccessCaches`).
- Key rotation is a button (`POST /api/admin/security/keys/rotate`) and a
  scheduled job. A retired key keeps verifying for `JWT_KEY_GRACE` (24 h) so
  in-flight tokens do not error mid-rotation. Private keys are sealed with
  `TOKEN_KEY_ENCRYPTION_KEY` before they touch the database.

---

## 9. Sessions and cookies

`backend/src/services/authCookies.ts`, `sessionService` usage in
`authentication.ts`, `frontend/src/components/security/SessionGuard.tsx`.

- `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no `Domain` attribute, and
  the `__Host-` prefix whenever `COOKIE_SECURE=true`. The prefix is what stops
  a sibling subdomain from setting or reading the session, and it is dropped in
  local HTTP development only because browsers reject the prefix without TLS.
- **No token is ever written to `localStorage`.** `frontend/src/lib/api.ts`
  reads nothing from storage for authorisation; it relies on the cookie plus a
  readable `csrf_token` mirror. Legacy keys are deleted on load.
- Server-side session record in `session` + Redis: idle `IDLE_TIMEOUT` (15 m),
  absolute `ABSOLUTE_TIMEOUT` (8 h), warning `SESSION_WARNING_SECONDS` (60 s)
  before expiry with **Stay signed in** (`POST /api/session/extend`) or
  **Sign out now**. The countdown comes from the server's clock, not the
  browser's.
- `SINGLE_ACTIVE_SESSION` optionally collapses a user to one session; otherwise
  `MAX_CONCURRENT_SESSIONS` applies. Admins list and revoke sessions per user at
  `/api/admin/security/sessions`.
- Changing a password revokes every session and refresh token for that account
  (logout-everywhere) and notifies the Admin who is responsible.
- CSRF: double-submit cookie **plus** server-side binding to `sid`, checked for
  every unsafe method that presents a session cookie. A bearer-token request
  (mobile, connector) is exempt because it cannot be forged by a browser form.
  `POST /api/auth/session/{refresh,logout}` are exempt so a stuck client can
  always recover. The three **sign-in** paths (`/api/session/login`,
  `/api/auth/login`, `/api/auth/session/login`) are exempt as well: a browser can
  reach the login page still holding an unexpired access cookie, and it has no
  session to bind a token to yet, so requiring the header locked users out until
  they cleared cookies. Login CSRF stays covered by `SameSite=Strict`.
  Regression-tested in `securityControls.test.ts` →
  *"a cookie-bearing POST needs the header, except at sign-in"*.
- NextAuth is used only as the UI's identity marker. It receives a short-lived
  one-time **ticket** exchanged at `/api/session/exchange`; it never holds
  the access token. Deleting `frontend/src/app/api/auth/login/route.ts` removed
  the endpoint that minted unsigned-looking sessions with
  `Access-Control-Allow-Origin: *`.

---

## 10. Access control

`backend/src/services/accessControl.ts`, `backend/src/middleware/rbac.ts`.

Resolution is per module **per action** (view/create/edit/update/delete/export/
approve) plus an `enabled` master switch, unioned across all active roles, with
`'ALL'` as a real wildcard and a documented legacy fallback for rows that
predate the matrix. `attachAccess` runs before any guard; `requireAction(module,
action)` is on every mutating route, and the check is repeated on **object
access**, not just on the route (IDOR: fetching another location's roster is
refused even when the module is granted).

Denied attempts write `UNAUTHORIZED_PERMISSION_ATTEMPT` /
`UNAUTHORIZED_ROLE_ATTEMPT` with the user, route, module and action.

The frontend mirrors this only to decide what to *show*:
`frontend/src/lib/rbac.ts` caches `/api/me/permissions`. Hiding a
button is never the control; the API is.

---

## 11. Edge, transport and headers

`infra/nginx/nginx.conf` + `infra/nginx/snippets/security-headers.conf`,
`backend/src/middleware/securityHeaders.ts`, `frontend/next.config.ts`.

- TLS 1.2 minimum, 1.3 preferred, ECDHE-only cipher suite, session tickets off,
  OCSP stapling on, HTTP→HTTPS `308`, `ssl_reject_handshake` for unknown SNI.
- `server_tokens off`; upstream `X-Powered-By` hidden.
- `client_max_body_size 12m` (biometric face snapshots are the only large
  upload), slowloris timeouts, connection caps, `limit_req` zones.
- One authoritative copy of each header: the edge hides the upstream values and
  re-emits its own, because nginx `add_header` appends and two disagreeing HSTS
  lines are undefined behaviour.
- Headers: `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS with `preload`, `COOP: same-origin`,
  `CORP: same-site`, `Origin-Agent-Cluster`, `X-Request-Id`.
- CORS is an exact-origin allowlist (`CORS_ALLOWLIST`), credentials enabled only
  for those origins. The previous wildcard for `192.168.*` and any non-prod
  origin is gone.
- **Never cached:** every `/api/` and socket response is `no-store`, asserted at
  the proxy and not merely inherited from the app. Hashed static assets under
  `/_next/static` are `public, max-age=31536000, immutable`. Uploaded personal
  files are `private` and short-lived, so no CDN edge keeps an employee photo.

---

## 12. Application-layer protections

| Risk | Control | Where |
|---|---|---|
| SQL injection | Parameterised queries only; the "zero-Prisma" shim exposes `pool.execute(sql, params)` and every route uses placeholders. Migrations run as a separate credential. | `backend/src/nativeDb.ts` |
| Mass assignment | Explicit field lists in every create/update; the ORM shim has no `.create(data)` passthrough | service layer |
| XSS | React escaping, no `dangerouslySetInnerHTML` on user input, CSP restricts where a script can talk to | components, `next.config.ts` |
| CSRF | §9 | `csrfProtection.ts` |
| IDOR | Ownership/scope check on every object fetch and every object **write** | `rbac.ts` + routes |
| SSRF | No user-controlled URL is fetched; device and connector endpoints take IDs, not targets | `credentials`, device routes |
| Path traversal | Uploads are renamed to random IDs, stored outside any web root, served by an authenticated route; the static mount is pinned to one subdirectory | `index.ts` (`/uploads/attendance` only) |
| Open redirect | Login and 403 destinations are allowlisted paths, never raw query values | `frontend/src/middleware.ts` |
| Enumeration | Dummy-hash verify for unknown users, identical error bodies, generic "Invalid credentials" | `authentication.ts` |
| Upload abuse | MIME allowlist + magic-byte detection + size cap + quarantine directory | `core/services/security/FileSecurityService.ts` |
| Error leakage | Central handler returns a request-id and no stack; secrets are excluded from log fields | `backend/src/index.ts` |
| Privileged login network | `admin_ip_allowlist_enabled` + `privileged_login_cidrs` (Admin-managed at runtime): a correct Admin/Super Admin password from a network outside the list is refused and raises `PRIVILEGED_LOGIN_BLOCKED`. Checked after password verification so the control cannot be used to probe accounts. Enabled with an empty list warns and allows, rather than locking every administrator out | `authentication.ts` |
| Dependency and secret scanning in CI | gitleaks over full history, a grep guard for connection strings with embedded passwords, a check that `.env` is never tracked, `npm ci` for lockfile integrity, `npm audit` failing on critical, and the four suites against real MySQL + Redis | `.github/workflows/ci.yml` |

---

## 13. Audit, monitoring and alerts

Audit writes are append-only **in the application** — there is no update or delete
path for `auditlog` anywhere in the codebase — and each row carries actor, action,
entity, before/after, IP, user agent and timestamp.

Every row is also linked into a hash chain (`AuditService`): `hash` covers the
row's fields plus the previous row's hash, `previousHash` carries the link, and
`verifyIntegrity()` walks it and reports gaps and altered entries. Verified live:
the credential created during this delivery wrote `hash`/`previousHash` with
`integrityVerified = 1`, and its `newValue` contains the login ID, email and role
— and **no password**, confirmed by searching the log for the issued plaintext.

Two honest limits. First, the chain is unsalted SHA-256 with no secret, so anyone
who can write rows can also recompute the chain; it detects tampering only against
an anchor held somewhere the attacker cannot edit (section 15 item 12). Second,
database-level immutability is not in place: the container creates the app user
with full privileges on one schema, so until the GRANT block in section 16 runs,
the app credential can rewrite history. Security-relevant
events include `LOGIN_SUCCESS`, account lockouts, `UNAUTHORIZED_*_ATTEMPT`,
credential create/update/reset/unlock with old-vs-new and **no password**,
role and module-access changes, token revocations, session revocations, IP
auto-blocks, and `SECURITY_EVENT_SESSION_HIJACK_ATTEMPT` for refresh reuse.

Admin/Super Admin dashboard: `frontend/src/app/admin/security/page.tsx` on top
of `/api/admin/security/*` — posture (hashing, signing kid, shared store),
failed-logins and top-failing-IPs, locked accounts with one-click unlock, active
sessions with revoke, IP rules, key rotation, runtime policy, retention run,
and the event feed with acknowledgement.

Real-time alerts go to `SECURITY_ALERT_EMAIL` and `SECURITY_WEBHOOK_URL` for
brute force, repeated lockouts, credential resets, token reuse, auto-blocked IPs,
privileged sign-ins from a new device (`NEW_DEVICE`), a correct privileged
password offered from outside the allowed networks (`PRIVILEGED_LOGIN_BLOCKED`)
and two successful sign-ins for one account from different networks inside
`IMPOSSIBLE_TRAVEL_WINDOW_MINUTES` (`IMPOSSIBLE_TRAVEL`, severity HIGH). Structured logs carry
`request_id`, which nginx also emits as a header, so one incident reads across
edge log → app log → audit row.

---

## 14. Privacy and retention

`backend/src/services/privacy.ts`, `frontend/src/app/privacy/**`.

- Privacy Policy, Terms of Use, Cookie Policy and Data Retention Policy are
  reachable from the login screen and the product footer.
- Cookie consent: necessary / analytics / preferences, recorded in
  `cookie_consent` with the policy version; the banner is
  `frontend/src/components/security/CookieConsentBanner.tsx` and re-appears when
  `CONSENT_POLICY_VERSION` changes.
- Data subject export (`GET /api/privacy/me/export`) and deletion requests
  (`POST /api/privacy/me/requests`) with an Admin workflow
  (`.../requests/:id/transition`). Anonymisation masks PII and removes
  sessions, tokens, password history, MFA secrets, device fingerprints and
  consent records; **operational HR records are retained** where the law requires
  it, and the reason is recorded on the request.
- Sensitive fields are masked in the UI (`maskEmail`, `maskPhone`,
  `maskIdNumber`) and full values are only ever fetched by a route the RBAC
  engine allows.
- `runRetentionPurge()` validates every table/column against
  `information_schema` before deleting, batches at 50 000 rows, and runs on
  `RETENTION_PURGE_INTERVAL_HOURS`. It is additive-safe: it only ever removes
  rows past their documented retention window (`retention_policy`), never
  employee or payroll records.

---

## 15. Known gaps and accepted risks

Stated plainly, worst first. Items 1–2 are **action required today**.

1. **A live database credential is in this repository's history.**
   `backend/src/nativeDb.ts`, `backend/src/postgresDb.ts` and
   `backend/src/scripts/verify_supabase.ts` carried
   `postgresql://postgres.<project>:<password>@aws-0-ap-northeast-2.pooler.supabase.com`
   as a default. The defaults are now removed and Postgres certificate
   verification is on by default — but removing a secret from a file does not
   revoke it. **Rotate that Supabase password and revoke any personal access
   tokens issued from the same account before going live.** If the repo is
   public, assume the credential is burned.
2. **The frontend could still reach a wildcard backend in development.**
   `NEXT_PUBLIC_API_URL` must be `/api` in production so cookies stay
   first-party. Verify with the browser's network tab that no request goes to a
   second origin.
3. **`script-src 'unsafe-inline'` remains in the app's CSP.** This is a Next.js
   15 App Router limit, not a shortcut: the router streams its payload as inline
   `<script>` tags (`self.__next_f.push(...)`) — 24 on the login page — and
   cannot attach a nonce to them. A nonce makes the browser ignore
   `'unsafe-inline'`, so the choice is inline-allowed or a blank page. The
   compensating controls are the ones that actually cap an injected script:
   `connect-src 'self'`, `form-action 'self'`, `base-uri 'self'`, `object-src
   'none'`, HttpOnly cookies, and a 15-minute access token that is not readable
   from JavaScript. `'unsafe-eval'` exists in the development policy only.
4. **MySQL connections are not TLS-encrypted.** `mysql2` is created without an
   `ssl` option (`backend/src/nativeDb.ts`), so
   `--require-secure-transport=ON` would refuse every application connection.
   The compensating control is real: 3306 is unpublished and the `services`
   network is `internal: true`. Closing this means adding `ssl` to the pool and
   then flipping the compose flag.
5. **Redis TLS is configured but disabled.** The TLS block in
   `infra/redis/redis.conf` is commented because Redis exits immediately if a
   named certificate is missing, which would leave a stack that cannot start.
   Auth (`requirepass` from the environment), command renaming
   (`FLUSHALL`/`FLUSHDB`/`KEYS` removed), `protected-mode`, `maxmemory` and an
   internal-only network are active. Issuing the certificates and switching to
   `rediss://` is a deployment task.
6. **`maxmemory-policy noeviction` will fail writes before it forgets a
   lockout.** That is the safer direction — an LRU eviction can silently reset a
   brute-force counter or resurrect a revoked token — but it means Redis
   exhaustion shows up as refused logins. Monitor `used_memory` and `rejected_*`.
7. **Without Redis, all counters are per-process.** The security suite runs on
   the in-memory store, and `/api/health` says so. Two API replicas without
   `REDIS_URL` each hold their own lockouts, which is no lockout at all. That is
   why compose sets `REDIS_REQUIRED=true`.
8. **Breach screening is a bundled list, not a corpus.**
   `isKnownBreached()` checks `COMMON_PASSWORDS` locally. There is no HIBP-style
   range query, so "P@ssw0rd!2026xyz" can pass. Adding a k-anonymity check
   against a breach corpus is a bounded change in `passwordPolicy.ts`.
9. **The CAPTCHA is deterrent, not proof.** It is a self-hosted SVG challenge
   designed to break naive scripts and single-account spraying. A determined
   solver with an OCR model gets past it; the lockout, the per-account rate
   limit and the 429 budget are the controls that carry weight.
10. **No malware scanner is wired.** Uploads are validated by MIME allowlist,
    magic bytes and size, then quarantined on scan status — but there is no
    ClamAV call in the code, and an earlier `.env` template advertised
    `CLAMAV_SOCKET` that nothing reads. That variable has been removed rather
    than kept as a fiction. Adding `clamd` is a deployment step plus one client
    call.
11. **The session endpoints had to move out from under NextAuth.** They were
   `/api/auth/session/*`, and Next.js serves NextAuth from a catch-all at
   `/api/auth/*`. With the production same-origin API base
   (`NEXT_PUBLIC_API_URL=/api`), a browser request to
   `/api/auth/session/login` is matched by that route before the `/api` rewrite
   runs, so it never reaches the Express server. Login would have failed for
   every user in production while still working in development, where the login
   page uses an absolute backend URL — exactly the kind of bug that survives
   staging. They now live at `/api/session/*`, with the old path kept as an
   alias for direct API clients (mobile, connector, curl), which were never
   affected because they do not pass through Next.js. Re-pointing them back
   reintroduces a failure that only appears in production. Tell them apart with
   `curl -s localhost:3000/api/session/status` (reaches Express) versus
   `curl -s localhost:3000/api/auth/session/consent` (answered by NextAuth).
12. **The audit chain has no secret in it.** `AuditService` links rows with plain
    SHA-256 over the row plus the previous hash. A writer with database access can
    recompute the whole chain and leave no evidence. Close it by HMACing the chain
    with a key from `SECRETS_DIR/audit-chain-key`, and by exporting the current head
    hash to the edge log or a backup on a schedule — the chain is only tamper-evident
    against an anchor the attacker cannot rewrite.
13. **Impossible travel is a network-velocity check, not a distance one.**
    `detectAnomaly` in `backend/src/services/authentication.ts` raises
    `IMPOSSIBLE_TRAVEL` when the same account signs in successfully from two
    different /24 (IPv4) or /64 (IPv6) networks within
    `IMPOSSIBLE_TRAVEL_WINDOW_MINUTES`. It does not know where either address
    is. That catches the case the requirement is about — one account working in
    two places at once — and it deliberately avoids sending employee IPs to a
    GeoIP vendor on every sign-in. Limits: two offices on one provider NAT can
    look like one network (no alert), and a laptop on mobile broadband that
    changes cells will alert. Upgrading to real distances means a resolver plus
    a privacy decision; the event already carries `method` so the two can be
    told apart in the log.
14. **CSP violation reporting is not enabled.** No `report-to`/`report-uri` is
    emitted because there is no collector endpoint; inventing one would produce
    a silently 404ing report queue.
15. **The CDN/WAF layer is documentation, not configuration.** Section 11
    describes the policy (hashed static assets, never cache authenticated or
    `/api` responses, bot and geo rules). Cloudflare/FASTly rules are not in
    this repository and cannot be verified from here.
16. **Docker, nginx and Redis configurations are unverified by execution.**
    They were written for this delivery on a machine with no Docker engine, so
    `docker compose up`, `nginx -t` and a TLS handshake have not been run. The
    YAML parses and the directives follow current upstream syntax, but the first
    deploy must be treated as a validation exercise.
17. **Biometric terminals cannot do TLS.** eSSL/ZKTeco ADMS push plain HTTP. Do
    not open a plaintext `/iclock/` listener to the internet — put the terminals
    on a firewalled showroom VLAN that reaches the proxy over an IPsec/WireGuard
    tunnel, or terminate a second nginx server block restricted by
    `ip_rules` allowlist to the showroom IPs.
18. **2FA is available and can be mandated, but defaults to off**
    (`MFA_REQUIRED_FOR_PRIVILEGED=false`, switchable at runtime on the security
    dashboard). Turning it on for Admin and Super Admin is the single cheapest
    improvement to this deployment.

---

## 16. Pre-deployment checklist

Run in order. Anything unchecked means the system is **not** in the posture this
document describes.

**Secrets**
- [ ] Supabase credential above rotated; the old project reviewed for logins.
- [ ] `PASSWORD_PEPPER` generated (`openssl rand -base64 48`), stored in the
      vault, backed up, and **not** the value used in staging.
- [ ] `TOKEN_KEY_ENCRYPTION_KEY` generated (`openssl rand -hex 32`).
- [ ] `HIRING_ENCRYPTION_KEY` generated (`openssl rand -base64 32`).
- [ ] `NEXTAUTH_SECRET` generated (`openssl rand -base64 32`).
- [ ] `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `REDIS_PASSWORD`,
      `BIOMETRIC_CONNECTOR_KEY` set, unique per environment.
- [ ] `.env` is not in git (`git ls-files | grep '^\.env$'` prints nothing) and
      no secret is baked into an image layer (`.dockerignore` excludes `.env*`).

**Transport**
- [ ] Certificates present at `infra/nginx/tls/{fullchain.pem,privkey.pem}`;
      renewal is automated (certbot timer or the ACME provider's API).
- [ ] `curl -I http://host` returns `308`, `curl -sIv https://host 2>&1 | grep -i "TLSv"` shows 1.2 or 1.3.
- [ ] `curl -sI https://host | grep -iE "strict|frame|referrer|nosniff|content-security"`
      shows exactly one of each.
- [ ] HSTS preloaded; `nabladot`/SSLLabs grade A.
- [ ] `CORS_ALLOWLIST` lists exact origins; no `*`, no wildcards.
- [ ] `TRUST_PROXY_HOPS` equals the real hop count.

**Exposure**
- [ ] Host firewall opens only 80/443 (see below); `ss -tlnp` from the host
      shows no 3306, 6379, 4000 or 3000 bound publicly.
- [ ] `docker compose ps` shows every service healthy; `docker port api` empty.
- [ ] `nc -zv host 3306` and `nc -zv host 6379` fail from outside the VLAN.

```bash
# ufw: the only ports the world may reach
ufw default deny incoming && ufw default allow outgoing
ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

**Application**
- [ ] `NODE_ENV=production`, `REQUIRE_HTTPS=true`, `COOKIE_SECURE=true`;
      `/api/health` reports `configWarnings: []`.
- [ ] `REDIS_URL` set and `REDIS_REQUIRED=true`.
- [ ] `MAX_ATTEMPTS=4`, `LOCKOUT_SECONDS=180`, `RATE_LIMIT_PER_SECOND=100`,
      `ACCESS_TOKEN_TTL=15m`, `REFRESH_TOKEN_TTL=7d`, `IDLE_TIMEOUT=15m`,
      `ABSOLUTE_TIMEOUT=8h` — the values the specification names.
- [ ] `ALLOW_SELF_REGISTRATION=false`, `ALLOW_PUBLIC_PASSWORD_RESET=false`.
- [ ] `MFA_REQUIRED_FOR_PRIVILEGED=true` and every Admin/Super Admin enrolled.
- [ ] `ESCALATE_AFTER_LOCKOUTS` set for your risk appetite.
- [ ] SMTP and webhook configured, then a forced lockout proves an alert
      arrives (see runbook 17.4).
- [ ] `CONSENT_POLICY_VERSION` and all `RETENTION_*` values signed off.
- [ ] Migrations applied additively; `SELECT * FROM _migrations` shows 030–038.

**Database privileges (required; not applied automatically)**

MySQL has no `DENY`. A schema-wide grant cannot be narrowed per table, so the
application account must receive table-level grants and never the wildcard —
that distinction is what makes `auditlog` insert-only for the very credential an
SQL injection would use. Run as root after the migrations, then restart the API:

```sql
-- 1) drop the blanket grant the container entrypoint created
REVOKE ALL PRIVILEGES, GRANT OPTION FROM `bsc_hrms_app`@`%`;

-- 2) emit one grant per business table, auditlog excluded, then run the output
SELECT CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON `bsc_textiles_hrms`.', QUOTE(table_name),
                ' TO `bsc_hrms_app`@`%`;') AS grant_stmt
FROM information_schema.tables
WHERE table_schema = 'bsc_textiles_hrms' AND table_name <> 'auditlog';

-- 3) the audit trail stays append-only for the app user
GRANT SELECT, INSERT ON `bsc_textiles_hrms`.`auditlog` TO `bsc_hrms_app`@`%`;
FLUSH PRIVILEGES;
```

- [ ] `SHOW GRANTS` for the app user lists no `ALL PRIVILEGES` and no DDL.
- [ ] As the app user, updating `auditlog` is refused.
- [ ] As the app user, `DROP TABLE user` is refused.
- [ ] Migrations run as a different, short-lived credential (the `migrator`
      service), never as the app account.

**People and process**
- [ ] At least two Admins who can issue and revoke credentials, and a named
      Super Admin who cannot.
- [ ] The last standing Super Admin is documented; `LAST_SUPER_ADMIN` protects
      it from deactivation but not from leaving the company.
- [ ] Backup restore tested: MySQL restore + `redis` AOF replay on a spare box.
- [ ] This document, `INCIDENT_RESPONSE.md` and the key-rotation runbook below
      are known to whoever gets paged.

---

## 17. Runbooks

### 17.1 Rotate the token signing key
1. `POST /api/admin/security/keys/rotate`. A new `kid` becomes active; the old
   key stays verifiable for `JWT_KEY_GRACE` (24 h) so live access tokens finish
   their short life instead of erroring.
2. Confirm `GET /.well-known/jwks.json` lists both and `active` moved.
3. After the grace window, the old key is retired. No user notices: access
   tokens are 15 minutes old at most.
4. Emergency (key possibly leaked): rotate, then `POST
   /api/admin/security/users/:id/sign-out` for privileged accounts, or bump
   `tokenVersion` for all accounts to force everyone to re-login at once.

### 17.2 Account is locked and the owner is waiting
1. `/admin/security` → Lockouts, or `GET /api/admin/security/lockouts`.
2. `POST /api/admin/security/lockouts/:userId/unlock` — clears Redis counters
   **and** the durable `login_attempt`/`lockedUntil` state.
3. If the cause was a forgotten password rather than an attack, reset it
   (`POST /api/credentials/:id/password/reset`) so the next login is forced to
   change.

### 17.3 Suspected stolen refresh token
Reuse detection usually fires by itself (`SECURITY_EVENT_SESSION_HIJACK_ATTEMPT`
→ family revoked → user forced out). Then:
1. Revoke the user's sessions and tokens.
2. Reset the password and force change.
3. Read `auditlog` for that actor across the abuse window: look for
   `VERIFY`/`EXPORT`/`UPDATE` rows that were not theirs.
4. If module access had been granted too broadly, revoke the grant — the
   permission bump invalidates outstanding tokens immediately.

### 17.4 Prove the alerting path works
```bash
# four deliberate failures, then check /admin/security and the mailbox
for i in 1 2 3 4; do curl -s -X POST https://host/api/auth/session/login \
  -H "Content-Type: application/json" -H "x-csrf-token: none" \
  -d '{"loginId":"someone@bsctextiles.com","password":"wrong-$i"}'; done
```
Expect attempt 4 → `429` with `Retry-After` and a body that still reads `Invalid credentials`, then an
Admin email/webhook after `ALERT_AFTER_LOCKOUTS`.

### 17.5 Block an IP
`POST /api/admin/security/ip-rules {"type":"deny","cidr":"203.0.113.0/24",
"label":"credential stuffing","reason":"...","expiresAt":"..."}`. Refused at
`ipRuleGuard`, before routing. Temporary auto-blocks appear here too and expire
on their own.

### 17.6 Redis is down
- With `REDIS_REQUIRED=true` the API refuses to start rather than run with
  counters nobody shares. Scale Redis back or set the flag knowingly.
- A running API that loses Redis keeps sessions in the database, reports
  `sharedStore: "memory"` and adds a `configWarnings` entry. Treat that warning
  as an incident, not noise.
- After a restart the AOF restores revocations and sessions. `FLUSHALL` is not
  available to the app user.

### 17.7 Rotate a leaked secret
Order matters, because two of these destroy data or logins:
1. `PASSWORD_PEPPER` — every stored hash becomes unverifiable. Combine with a
   forced reset for all accounts; do not rotate it casually.
2. `TOKEN_KEY_ENCRYPTION_KEY` — re-seal existing keys before replacing this, or
   the app cannot read its own signing keys.
3. `HIRING_ENCRYPTION_KEY` — legacy rows derive from `JWT_SECRET`, which is
   still accepted; changing this only affects newly encrypted values.
4. `MYSQL_PASSWORD` / `REDIS_PASSWORD` / `BIOMETRIC_CONNECTOR_KEY` — safe to
   replace at any time; restart the dependent service.

### 17.8 A Super Admin asks for a password reset
They cannot reset their own or anyone else's credentials — that is the design.
An Admin performs it, and both actors appear in the audit trail. If no Admin is
available, that is a break-glass procedure to write down *before* it is needed,
not to improvise; the recommended arrangement is two Admins with separate
login IDs, both MFA-enrolled, neither able to create roles.

---

## 18. Test coverage

`backend/src/tests/securityControls.test.ts` (`npm run test:security`, 28 cases) covers:
policy length/class/common rules, login-ID-in-password rejection, strong
password scoring, generated temporary passwords, expiry maths and the disabled
case, pepper is part of the hash (raw password must not verify), pre-pepper
legacy hash still logs in and is flagged for upgrade, sliding-window admits
exactly N then blocks, independent windows per key, CIDR matching and
trusted-proxy IP resolution including a forged chain, cookie names and flags,
Super Admin refused credential writes, duplicate login IDs refused, first-login
flag blocks protected routes, captcha demanded after the configured failures,
the 4th wrong password starts a 180 s cooldown that **rejects the correct
password**, unknown login ID gets the identical generic rejection, clearing the
guard restores access, refresh rotation spends the old token and reuse revokes
the family, revoking all tokens makes outstanding access tokens unusable, and
credential writes are audited with the password replaced by a placeholder.

`backend/src/tests/rbacAccess.test.ts` (`npm run test:rbac`) covers the action
ladder, legacy fallback, cross-role unions and the `'ALL'` wildcard.

The login-protection group adds: IPv4 /24 and IPv6 /64 network grouping,
the minimum-response-time floor (an unknown login ID may not answer faster
than a real verification), an `IMPOSSIBLE_TRAVEL` event raised when the same
account signs in successfully from two networks, a correct Admin password
refused from outside `privileged_login_cidrs` with a
`PRIVILEGED_LOGIN_BLOCKED` event, and the deliberate fail-open when the
allowlist is enabled with no entries.

`backend/src/tests/attendanceExport.test.ts` (`npm run test:export`, 10 cases)
covers the attendance workbooks: the download is a real openable `.xlsx` with the
documented sheets, frozen header row and autofilter range; first/last punch and
punch count come from `biometric_raw_punches` rather than a default; punch times
stay on the store-timezone calendar day; the verification cell is the device's own
label and **no face-match percentage may appear anywhere in the file**; weekly off,
holiday and absent are never inferred from the weekday; a period with no records
says so instead of filling rows; an employee designation beginning with `=` is
neutralised (formula-injection guard) and no exported cell starts with a formula
trigger; the month summary equals the sum of its day rows; the annual sheet splits
by month; and a store-scoped export cannot leak another store's employees. Its
fixtures are created and removed by the suite itself (`exp-test-%` ids on dates with
no production data).

The export routes themselves (`GET /api/attendance/exports/monthly|annual|punches`)
require the `ATTENDANCE` + `export` action server-side — verified live: a
`FLOOR_MANAGER` token receives `403 Your role does not allow export on attendance`,
an unauthenticated request receives `401`, and an invalid period receives `400`
with a reason. Every download writes `ATTENDANCE_EXPORT_DOWNLOAD` to the audit log
with the filters and the row count, and above 5,000 rows raises `MASS_EXPORT`.

What is **not** automated: the Nginx/Redis/Docker layer (no runner available
here — section 15 item 16), the browser session-timeout modal, and the cookie
consent banner. Those are verified manually in the delivery report.

---

## 19. Repository layout

Everything the security layer adds, and where to look for a behaviour named
earlier in this document.

```
backend/src/
  config/
    security.ts                  every tunable, env-driven; refuses to boot without
                                 production secrets
  services/
    redisStore.ts                Redis with an in-process fallback (same interface)
    passwordPolicy.ts            length/classes/common/identity/reuse rules + scoring
    passwordService.ts           Argon2id + pepper, verify, legacy upgrade, history
    signingKeys.ts               ES256 keypair generation, sealing, rotation, JWKS
    tokenService.ts              access/refresh issuance, rotation, family revocation
    authentication.ts            the sign-in core: gate order, MFA, tickets, anomalies
    loginProtection.ts           attempt counters, cooldowns, Admin unlock
    captchaService.ts            server-issued SVG challenge, hashed answer, single use
    credentials.ts               Admin-only create/reset/unlock/status + self change
    authCookies.ts               cookie names/__Host-, CSRF binding, visitor id
    sessionService.ts            server-side sessions, idle + absolute expiry
    securityAlerts.ts            email + webhook fan-out for security events
    securityMonitoringService.ts security_event store and the alert taxonomy
    accessControl.ts             RBAC resolution engine (module x action)
    rbacAdmin.ts                 role lifecycle and the module-access matrix
    privacy.ts                   consent, masking, export, erasure, retention purge
    systemSettings.ts            runtime-adjustable policy (expiry, MFA, allowlists)
    auditService.ts              append-only, hash-chained audit writes
  middleware/
    auth.ts                      authenticate/authorize, tokenVersion + CSRF binding
    rbac.ts                      requireAction and the Super Admin / Admin guards
    securityGuards.ts            real client IP, ip_rules, sliding-window limiters
    csrfProtection.ts            double-submit + session-bound token
    securityHeaders.ts           CSP and header set for API responses
  routes/
    authSession.ts               /api/session/*  login, refresh, extend, consent, JWKS
    credentials.ts               /api/credentials/*
    securityAdmin.ts             /api/admin/security/*  dashboard, sessions, keys
    privacy.ts                   /api/privacy/*
    accessControl.ts             /api/access, /api/me, /api/module-access
    auth.ts                      legacy bearer routes (mobile, connector)

frontend/src/
  lib/api.ts                     cookie transport, single-flight refresh, CSRF header
  lib/auth.ts                    NextAuth as a UI identity marker only (ticket exchange)
  lib/rbac.ts                    cached /api/me/permissions, canAction(), widget gating
  app/login/page.tsx             cooldown countdown, captcha, MFA, legal links
  app/change-password/page.tsx   forced change, server-driven strength meter
  app/admin/credentials/         Admin credential manager
  app/admin/security/            security dashboard (posture/sessions/IPs/keys)
  components/security/           SessionGuard.tsx, CookieConsentBanner.tsx
  components/legal/, app/privacy-policy|terms-of-use|cookie-policy|data-retention

database/
  migrations/030..035            action-level RBAC, credential modules
  migrations/033,034             sessions, refresh_token, jwt_signing_key, ip_rules,
                                 cookie_consent, data_request, retention_policy,
                                 security_config
  migrations/039                 reconciles accessLevel with the action booleans
  migrations/040                 PRIVILEGED_LOGIN_BLOCKED in security_event.type

infra/
  nginx/nginx.conf               TLS, real IP from trusted hops, limit zones, routing
  nginx/snippets/security-headers.conf  the authoritative header set, per location
  redis/redis.conf               auth, removed commands, noeviction, AOF, TLS block
docker-compose.yml               proxy/web/api/worker/migrator/cache/db, 2 networks
.github/workflows/ci.yml         secret scan, dependency audit, typecheck, suites
```

