# Device setup — eSSL MB160 terminals

Who does what: the **terminal** performs face recognition and decides the verify
method. The **HRMS** consumes the resulting event. The website never runs face
recognition itself and never claims a match score the device did not send.

## The fleet as it is registered today

`biometric_devices` in `bsc_textiles_hrms`, read at the time of writing:

| Name | Serial | IP:port | Store | Timezone | Poll | Status |
|---|---|---|---|---|---|---|
| eSSL MB160 Belagavi Demo Terminal *(development fixture)* | `SIMMB160DEMO01` | 127.0.0.1:4370 | BEL | Asia/Kolkata | 2500 ms | simulator, served by `npm run device:simulator` |
| eSSL Davangere Terminal 1 (Main Entrance) | `JNP2252300795` | 192.168.100.136:4370 | DAV | Asia/Kolkata | 2500 ms | DISCONNECTED from this host |
| eSSL Davangere Terminal 2 (Staff Lounge) | `JNPJNP2252300802` | 192.168.100.135:4370 | DAV | Asia/Kolkata | 2500 ms | DISCONNECTED, never synced |
| eSSL Davangere Terminal 3 (Admin / Billing) | `JNP2252300797` | 192.168.100.137:4370 | DAV | Asia/Kolkata | 2500 ms | DISCONNECTED from this host |

The demo row carries `biometric_devices.isFixture = 1` (migration 045). The worker
polls fixture devices only while boot fixtures are allowed
(`HRMS_BOOT_FIXTURES`, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §12a), so a
production start neither polls nor reports on a loopback simulator. The device
endpoints report fixtures separately (`usableAsProductionEvidence: false`, and an
`developmentFixtures` count in the ops summary) rather than mixing them into
shop-floor totals; the fixture's own punch history stays in the database for
development, so nothing is deleted.

**Two discrepancies need a human with the physical devices before go-live.** They
are recorded here rather than "fixed" in the database, because guessing a serial or
an IP is how punches get attributed to the wrong store:

1. The project brief states Terminal 1 (Main Entrance, `JNP2252300795`) is
   `192.168.100.137`. The registry has `.137` on **Terminal 3** and `.136` on
   Terminal 1. One of the two is wrong; only a label on the device housing or the
   terminal's own network menu can say which.
2. Terminal 2's serial is `JNPJNP2252300802` — the `JNP` prefix is doubled. Real
   eSSL serials in this fleet are `JNP22523007xx`. Until it is corrected, any
   inbound record carrying the true serial will not match this registry row and the
   event lands as "Unregistered terminal".

Read the serial from the device: *Menu → Device → About* (or the ADMS registration
log at `GET /api/devices/adms-handshake`). Then
`PUT /api/devices/:id` with the corrected value; the API refuses a duplicate
serial with `409 SERIAL_TAKEN`.

## What this integration actually is (read before trusting any claim below)

**There is no vendor SDK in this repository.** `git ls-files` finds no `.dll`,
`.so`, `.node`, `.exe` or `.jar`, nothing imports `zkemkeeper`, and no code shells
out to an eSSL/ZKTeco binary. Both transports are implemented by hand in
TypeScript against the published ZK wire format:

| Layer | File | What it is |
|---|---|---|
| ZK over TCP (port 4370) | `backend/src/services/zkProtocolAdapter.ts`, `backend/src/services/biometricService.ts` | packet framing, checksum, `ATTLOG`/`USERDATA` pulls |
| ADMS / HTTP push | `backend/src/routes/adms.ts` mounted under `/iclock` | the terminal-side HTTP protocol: `cdata`, `push`, `getrequest`, `devicecmd`, `registry` |
| Loopback simulator | `backend/src/tools/mb160Simulator.ts` | speaks the same framing on `127.0.0.1` for tests |

Because the protocol code is ours rather than the vendor's, "supported" in this
document means *this code speaks the format and parses what comes back* — it does
**not** mean *validated against a specific MB160 firmware build*. Two consequences
that are easy to lose sight of:

1. **No physical terminal has been connected to this codebase yet.** Every
   end-to-end result on record came from the loopback simulator (registered as
   `isFixture = 1`, labelled "development fixture" in the device console) or from
   unit tests. The three `JNP…` Davanagere rows have only ever produced
   `CONNECT_TIMEOUT`, because this workstation is not on the shop-floor VLAN. The
   first real acceptance run at a store is still outstanding, and until it is
   done, verify on the device itself: serial number, which verification modes it
   actually reports, whether `PHOTOLOG` arrives, and whether the punch count the
   terminal displays matches `attLogCount` after a pull.
2. **Device authentication is weak and is not TLS.** An ADMS request is accepted
   when its serial number matches a registered, active row; unknown serials get
   `UNAUTHORIZED: UNKNOWN_DEVICE`. A serial number is printed on the outside of
   the device, so it identifies the terminal but does not prove who is sending.
   The `commKey` column exists in the registry but the HTTP receiver does not
   challenge with it. If a terminal cannot speak HTTPS, its punches cross the
   public internet as cleartext and anyone who can guess a serial can submit
   events — bind the endpoint to an IP allowlist, or put the store behind a VPN.
   Do not describe this link as secure.

If eSSL supplies an official SDK for the firmware your terminals run, it should be
evaluated against `zkProtocolAdapter.ts` rather than bolted alongside it, and its
Linux support and Node ABI checked before it is added to `backend/package.json`.

## Choosing the transport

`DEVICE_SYNC_MODE` in the environment (`.env.example`), resolved by
`backend/src/config/deviceConfig.ts`:

| Mode | What happens | Use when |
|---|---|---|
| `local_lan` | the worker dials each terminal over TCP 4370 and pulls logs | the HRMS host sits on the store network |
| `cloud_push` | the worker **skips private RFC-1918 addresses**; terminals push to `POST /iclock/cdata` instead | the HRMS is hosted in the cloud (default in production) |
| `hybrid` | both | a gateway PC polls while devices also push |

A cloud-hosted site cannot reach `192.168.100.x`: no port scan, retry or timeout
change fixes that. Either put the HRMS on the store LAN, or point each terminal's
server setting at the public HTTPS endpoint. **Never expose a terminal directly to
the internet** — it has no TLS and no real authentication.

### Terminal-side settings (ADMS / cloud push)

On each MB160: *Menu → System Settings → Comm / Server*:

- Protocol: `ADMS` / HTTP push
- Server: `https://<your-host>/iclock` (port 443; plain `http://host:4000/iclock`
  only inside a trusted network)
- Device ID / serial: the enrolled serial exactly as registered
- Proxy/keep-alive: enabled, so the terminal re-registers after a network blip

The backend accepts the standard endpoints under `/iclock`: `POST /cdata`
(`ATTLOG`, `PHOTOLOG`, `OPERLOG`, `USERINFO`, `enrolllog`), `POST /push`,
`GET /getrequest` (heartbeat + command poll), `POST /devicecmd`,
`GET|POST /registry`. Rate limited (`ADMS_RATE_LIMIT_PER_MINUTE`, default 180),
request body capped at 12 MB to fit face snapshots, and protected by the IP rule
guard. Nginx must pass these paths through without buffering the response, because
the terminal expects a plain-text `OK`/`GET Command` body.

### Connector relay

`connector/bscBiometricConnector.ts` runs on a shop-floor PC, polls the terminals
locally and forwards verified batches:

```
BIOMETRIC_CONNECTOR_KEY=<secret>   # required in production; the code throws if unset
npm run connector
```

It authenticates with `x-connector-key: <secret>` against
`POST /api/devices/ingest-raw` and `POST /api/devices/ingest-users`. Same key for
the heartbeat relay (`POST /api/devices/heartbeat`).

## Registering a terminal

UI: **Attendance → Devices → Add device** (Admin/HR; enforced server-side).
API: `POST /api/devices` — `name`, `serialNumber` (unique), `model`, `ipAddress`,
`port`, `locationCode`/`locationId`, optional `floorId`, `sectionId`, `timezone`,
`pollIntervalMs`, `heartbeatTimeoutSeconds`, `realtimeEnabled`, `photoPushEnabled`,
`commKey`.

Writes go through the registry-role guard, so a floor manager with `EDIT` on the
devices module cannot move a terminal to another store — that silently re-routes
every punch from it.

## Verifying a connection

Do not trust a ping. Use the step-by-step diagnostic, which reports the first
failing stage:

```
POST /api/devices/:id/test-connection
```
DNS → TCP → ZK handshake → authentication → clock → log read.

Fleet-wide:

```
GET  /api/devices/status              # per-terminal connection state and counters
GET  /api/devices/sdk-status          # transport/protocol availability
GET  /api/devices/ops-summary         # online/offline, open mismatches, unknown users
GET  /api/devices/report              # reconciliation report (xlsx/csv export available)
npm run diagnose                      # offline health check, fatal issues first
```

Statuses are the truthful set — `CONNECTED`, `DISCONNECTED`, `SYNCING`, `SYNCED`,
`DELAYED`, `ERROR`, `CONFIGURATION_REQUIRED`. `lastSyncAt` is written only by the
importer that actually stored records, so a reachable device that pulled nothing
never looks "synced". `consecutiveFailures` drives the exponential backoff
(`backoffMs`), and a private IP in `cloud_push` mode is skipped rather than
retried forever.

## Clock drift

A terminal whose clock is off can put a punch on the wrong date. Check and correct:

```
GET  /api/devices/:id/info          # deviceClockAt, clockDriftSeconds
POST /api/devices/:id/sync-clock    # measures drift before and after
```

Drift beyond `clockDriftCheckedAt` windows is logged per terminal. Punches are
still stored with the timestamp the device sent, plus the UTC-normalised copy —
the system never silently rewrites the original.

## Enrolment and verify codes

```
GET|POST|DELETE /api/devices/verify-mapping     # raw code → label + method family
POST /api/devices/calibration                   # discover the codes this firmware sends
GET  /api/devices/calibration/:id
POST /api/devices/calibration/:id/confirm
GET  /api/devices/mappings                      # employee ↔ device user id
POST /api/devices/sync-employee/:employeeId
```

An unmapped code displays as `Unknown (n)`; a payload with no code displays as
`Not reported by device`. Both are deliberate: the alternative was labelling every
punch "Face". **The MB160s in this fleet do not report a confidence value** — every
`matchValue` in the ledger is `NULL` — so no screen may show one.

## Exception queue

```
GET  /api/devices/unmapped                 # events whose device id matched no employee
POST /api/devices/unmapped/:id/assign      # HR assigns the right employee
GET  /api/devices/rejected                 # INVALID_TIME and other refused events
POST /api/devices/retry-held               # re-run ingestion for held rows
GET  /api/devices/raw-punches              # the ledger, with original + normalised times
```

Nothing is dropped and nothing is auto-assigned by partial matching. Resolving a
mismatch re-projects the affected days and writes an immutable before/after audit
entry (Admin/HR only, server-side).

## Retention and housekeeping

| What | Where | Default |
|---|---|---|
| worker under supervision | `npm run worker:supervised` | restarts with backoff |
| mismatch scan cadence | `MISMATCH_SCAN_INTERVAL_MINUTES` | 15 |
| poll interval per device | `biometric_devices.pollIntervalMs` | 2500 ms |
| heartbeat timeout | `BIOMETRIC_HEARTBEAT_TIMEOUT_SECONDS` | 15 s |
| default device timezone | `BIOMETRIC_DEFAULT_TIMEZONE` | `Asia/Kolkata` |
| ADMS rate limit | `ADMS_RATE_LIMIT_PER_MINUTE` | 180/min |
| structured device logs | `BIOMETRIC_LOG_DIR`, `BIOMETRIC_LOG_LEVEL` | `./logs`, `info` |

Logs carry timestamp, severity, terminal id, operation, counts and error detail.
Passwords, tokens, comm keys and biometric templates are never logged.

## Related documents

[ATTENDANCE_FLOW.md](ATTENDANCE_FLOW.md) ·
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) ·
[BIOMETRIC_MB160.md](BIOMETRIC_MB160.md) ·
[SECURITY.md](SECURITY.md)
