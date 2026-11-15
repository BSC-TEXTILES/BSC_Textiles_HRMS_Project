# Biometric showroom edge connector

[Project overview](../../README.md) · [Device setup](../docs/DEVICE_SETUP.md)

## Purpose and current status

The connector polls eSSL/ZKTeco terminals from a computer on their LAN and forwards punches to the HRMS API. It is separate from the backend device worker and direct ADMS cloud push.

**Known source limitation:** bscBiometricConnector.ts imports adapters through ../backend/src/... from this directory. Those paths do not match the repository layout: the services are under ../src/.... Resolve and validate the imports before deploying this connector. This guide describes its implemented configuration and flow, not a successful hardware test.

## Data flow

~~~mermaid
flowchart TD
    API[HRMS API] -->|GET /api/devices registry| Connector[LAN connector]
    Terminal[Registered terminal] -->|ZK protocol polling| Connector
    Connector --> Queue[(offline-punch-queue.json)]
    Queue -->|POST /api/devices/ingest-raw| API
    API --> Processing[Server validation and attendance processing]
    Connector --> Health[Health endpoint]
~~~

Terminal IP, port, communication key, timezone and polling cadence come from the API registry. CONNECTOR_LOCATION_CODE filters the registry to a showroom. The old DEVICE_IP, DEVICE_SERIAL and SHOWROOM_CODE setup examples do not configure this implementation.

## Configuration and startup

Set variables in the process environment; this entry point does not itself load dotenv.

| Variable | Default | Meaning |
| --- | --- | --- |
| CLOUD_API_URL | http://localhost:4000/api | API base including /api; use deployed HTTPS for cloud |
| BIOMETRIC_CONNECTOR_KEY | Empty | Credential sent in x-connector-key and Bearer headers |
| CONNECTOR_LOCATION_CODE | Empty / all | Registry location filter |
| CONNECTOR_HEALTH_PORT | 4371 | Health HTTP listener |
| CONNECTOR_REFRESH_MS | 30000 | Registry refresh milliseconds |
| CONNECTOR_POLL_INTERVAL | 2500 | Fallback polling milliseconds |

The key must be accepted by both registry and ingestion endpoints. Investigate API authorization for 401/403 responses. Register real terminals and employee enrollment mappings before testing.

After resolving the source limitation above, run from the repository root:

~~~powershell
$env:CLOUD_API_URL = 'https://your-hrms-host.example/api'
$env:CONNECTOR_LOCATION_CODE = 'YOUR_LOCATION_CODE'
# Supply BIOMETRIC_CONNECTOR_KEY through the protected process environment.
npm run connector
~~~

Use a stable working directory: the queue path is resolved against the working directory, not the script directory. Use an appropriate supervisor for unattended operation; the entry point does not install a Windows service.

## Buffering and health limitations

- The JSON queue is capped at 20,000 entries. Older excess records are trimmed; buffering is not unlimited or lossless.
- Poll watermarks are in memory and reset on restart. A one-second overlap can resend records; verify server deduplication.
- Upload failures retain the queue. A successful HTTP response clears the submitted queue, so server acceptance semantics matter.
- A fresh start needs a successful registry fetch to discover terminals; a punch queue is not an offline device registry.
- /health, /healthz and / return registryError, registryDevices, lastPollAt, lastUploadAt, queuedPunches and consecutiveUploadFailures.
- HEALTHY is based on upload failure count; it does not prove terminal reachability or successful ingestion of every punch.
- The health listener does not explicitly bind to loopback. Restrict exposure to the intended management network.

## Alternative transports

ADMS-capable terminals can push directly to deployed /iclock endpoints. Use the public host and transport/port supported by the firmware; unified production has no separate API listener on port 4000.

For backend-worker LAN polling, see DEVICE_SYNC_MODE=local_lan or hybrid in the [project README](../../README.md). Avoid assigning multiple pollers to the same terminal unintentionally.
