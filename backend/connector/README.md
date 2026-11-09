# BSC Textiles HRMS — Biometric Hardware Edge Connector

## Overview

The **BSC Textiles Biometric Hardware Edge Connector** is a lightweight, supervised daemon designed to run on a local PC within each BSC Textiles showroom LAN:
- **Belagavi Flagship (BEL)**: `192.168.0.136:4370` (SN: `JNP2252300795`)
- **Davanagere Mega Store (DAV)**: `192.168.0.131:4370` (SN: `JNPJNP2252300802`)
- **Shivamogga Flagship (SHI)**: `192.168.30.131:4370` (SN: `JNP2252300797`)

It securely bridges isolated showroom subnets to the authoritative Cloud MySQL HRMS without requiring incoming firewall holes on the biometric terminals.

---

## Architecture Flow

```
┌─────────────────────────────────┐
│ Showroom LAN (e.g. 192.168.0.x) │
│                                 │
│  [eSSL SilkBio-101TC Terminal]  │
│         (Port 4370 TCP/UDP)     │
│                 │               │
│                 ▼               │
│    [Local Edge Connector]       │
│     - ZK Binary Protocol        │
│     - Offline Queue (JSON)      │
│     - SHA256 Deduplication      │
│     - Health Server (:4371)     │
└─────────────────┬───────────────┘
                  │ Outbound HTTPS (TLS 1.3)
                  ▼
┌─────────────────────────────────┐
│ Cloud / Datacenter Infrastructure│
│                                 │
│  [BSC Textiles HRMS API]        │
│     POST /api/devices/ingest-raw│
│     Dual-Key Auth               │
│                 │               │
│                 ▼               │
│   [Cloud MySQL 8.0 Database]    │
│     - biometric_raw_punches     │
│     - attendance (real-time)    │
│     - audit_logs                │
└─────────────────────────────────┘
```

---

## Setup & Running Instructions

### 1. Requirements
- Node.js v20+ or v22+
- Network reachability to the local eSSL terminal (`Test-NetConnection -ComputerName <IP> -Port 4370`)
- Outbound internet access to the Cloud HRMS URL (e.g., `https://hrms.bsctextiles.com/api` or `http://localhost:4000/api`)

### 2. Quick Run (PowerShell)

```powershell
# For Belagavi
$env:CLOUD_API_URL = "http://localhost:4000/api"
$env:DEVICE_IP = "192.168.0.136"
$env:DEVICE_SERIAL = "JNP2252300795"
$env:SHOWROOM_CODE = "BEL"
npx tsx connector/bscBiometricConnector.ts

# For Davanagere
$env:CLOUD_API_URL = "http://localhost:4000/api"
$env:DEVICE_IP = "192.168.0.131"
$env:DEVICE_SERIAL = "JNPJNP2252300802"
$env:SHOWROOM_CODE = "DAV"
npx tsx connector/bscBiometricConnector.ts

# For Shivamogga
$env:CLOUD_API_URL = "http://localhost:4000/api"
$env:DEVICE_IP = "192.168.30.131"
$env:DEVICE_SERIAL = "JNP2252300797"
$env:SHOWROOM_CODE = "SHI"
npx tsx connector/bscBiometricConnector.ts
```

### 3. Diagnostic Health Server
Once running, the connector exposes a local HTTP health check at:
```
http://localhost:4371/health
```
Example response:
```json
{
  "status": "HEALTHY",
  "connectorName": "BSC Textiles Biometric Hardware Edge Connector",
  "version": "1.2.0-prod",
  "lastPollTimestamp": "2026-10-15T14:15:00.000Z",
  "lastSyncSuccessTimestamp": "2026-10-15T14:15:02.000Z",
  "totalPunchesIngested": 128,
  "queuedPunches": 0,
  "consecutiveFailures": 0
}
```

---

## Alternative: eSSL ADMS Cloud Push (Zero Middleware)
If the eSSL SilkBio terminal has ADMS enabled in its firmware:
1. On the terminal: Go to **Comm.** -> **Cloud Server / ADMS**.
2. Set **Server Address**: `your-cloud-ip-or-domain`.
3. Set **Server Port**: `4000` (or `443` for HTTPS).
4. Set **Enable Domain Name**: `OFF` (or `ON` if using domain name).
5. The terminal will directly push punches to `GET/POST /iclock/cdata` without needing this local connector!
