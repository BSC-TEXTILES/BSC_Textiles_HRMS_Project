# BSC Textiles HRMS — Hostinger Production Deployment & eSSL MB160 Configuration Guide

This guide details the complete production deployment procedure for **BSC Textiles HRMS** on a **Hostinger VPS** and the hardware configuration steps for **eSSL MB160 Multi-Biometric Terminals**.

---

## 1. Hosting Architecture & Plan Requirements

### Why Hostinger VPS is Required
The BSC Textiles HRMS system architecture comprises:
- An Express API server with Socket.IO websockets (port 4000).
- A Next.js 15 Server-Side Rendering (SSR) web application (port 3000).
- A supervised background biometric worker (`superviseWorker.ts`) managing heartbeats, timeouts, mismatch sweeps, and attendance queues.
- A native MySQL 8.0 database engine with multi-tenant showroom sharding (`HQ`, `BEL`, `DAV`, `SHI`).
- An incoming eSSL MB160 ADMS push receiver mounted at `/iclock`.

> [!IMPORTANT]
> **Hostinger Plan Requirement:** Shared or cPanel-style "Cloud Web Hosting" **cannot** run persistent background daemon processes or custom WebSocket services reliably. A **Hostinger KVM VPS** (Ubuntu 22.04 or 24.04 LTS, minimum **KVM 2** with 8 GB RAM / 2 vCPU, recommended **KVM 4**) is the verified, supported production platform.

> [!NOTE]
> **Status of this guide, 2026-10-18.** The architectural requirement above is
> real and was checked against the code: the API, the SSR frontend and
> `backend/src/workers/superviseWorker.ts` are three long-lived processes, and
> `/iclock` is an inbound HTTP listener for the terminals. Managed shared hosting
> cannot run those, so a VPS (or an equivalent container host you control) is the
> only supported shape. **What has not happened is an actual deployment from this
> branch** — no Hostinger account has been provisioned with this repository, so
> every command below is untested here. Treat the plan tiers as guidance to
> confirm against your own Hostinger dashboard, not as a result.
>
> Two facts the rest of this guide depends on, verified in the code today:
>
> * `npm ci` works on Linux x64 with no Windows-only binary. Password hashing
>   uses `@node-rs/argon2`, which ships `linux-x64-gnu` and `-musl` prebuilds, and
>   `better-sqlite3` is an **optional** dependency (offline-desktop mode only), so
>   a failed native build cannot break the install. `build-essential` from Step 2
>   is still worth having for that optional module.
> * There is **no vendor SDK**. The ZK framing and the ADMS receiver are
>   hand-written (`docs/DEVICE_SETUP.md` → "What this integration actually is"),
>   and no physical MB160 has been connected to this codebase yet.


---

## 2. Server Provisioning & OS Setup

### Step 1: Connect to your Hostinger VPS
```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: System Update & Core Packages
```bash
apt update && apt upgrade -y
apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw
```

### Step 3: Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v # Verifies >= v20.x
npm -v
npm install -g pm2
```

### Step 4: Install and Secure MySQL 8.0
```bash
apt install -y mysql-server
mysql_secure_installation
```
Create the application database and service user:
```sql
CREATE DATABASE bsc_textiles_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE bsc_shard_bel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE bsc_shard_dav CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE bsc_shard_shi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'bsc_hrms_app'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PROD_PASSWORD';
GRANT ALL PRIVILEGES ON bsc_textiles_hrms.* TO 'bsc_hrms_app'@'localhost';
GRANT ALL PRIVILEGES ON bsc_shard_bel.* TO 'bsc_hrms_app'@'localhost';
GRANT ALL PRIVILEGES ON bsc_shard_dav.* TO 'bsc_hrms_app'@'localhost';
GRANT ALL PRIVILEGES ON bsc_shard_shi.* TO 'bsc_hrms_app'@'localhost';
FLUSH PRIVILEGES;
```

### Step 5: (Optional but Recommended) Install Redis
```bash
apt install -y redis-server
systemctl enable redis-server && systemctl start redis-server
```

---

## 3. Application Deployment

### Step 1: Clone Repository
```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/BSC-TEXTILES/BSC_Textiles_HRMS_Project.git bsc-textiles-hrms
cd bsc-textiles-hrms
```

### Step 2: Configure Production `.env`
Create the production `.env` file in the repository root:
```bash
cp .env.example .env
nano .env
```

Ensure critical production values are set:
```ini
# Production Environment
NODE_ENV="production"
PORT=4000
FRONTEND_URL="https://hrms.bsctextiles.com"

# Dual-Mode Biometric Configuration
DEVICE_SYNC_MODE="cloud_push"

# Database Connections
DATABASE_URL="mysql://bsc_hrms_app:YOUR_STRONG_PROD_PASSWORD@localhost:3306/bsc_textiles_hrms"
DATABASE_URL_HQ="mysql://bsc_hrms_app:YOUR_STRONG_PROD_PASSWORD@localhost:3306/bsc_textiles_hrms"
DATABASE_URL_BEL="mysql://bsc_hrms_app:YOUR_STRONG_PROD_PASSWORD@localhost:3306/bsc_shard_bel"
DATABASE_URL_DAV="mysql://bsc_hrms_app:YOUR_STRONG_PROD_PASSWORD@localhost:3306/bsc_shard_dav"
DATABASE_URL_SHI="mysql://bsc_hrms_app:YOUR_STRONG_PROD_PASSWORD@localhost:3306/bsc_shard_shi"

# Security Secrets (Must be 32+ random characters)
JWT_SECRET="GENERATE_A_64_CHAR_RANDOM_HEX_SECRET_FOR_PROD"
NEXTAUTH_SECRET="GENERATE_ANOTHER_64_CHAR_RANDOM_SECRET"
NEXTAUTH_URL="https://hrms.bsctextiles.com"
BIOMETRIC_CONNECTOR_KEY="GENERATE_A_STRONG_CONNECTOR_KEY"

# Frontend Public Endpoints
NEXT_PUBLIC_API_URL="https://hrms.bsctextiles.com/api"
NEXT_PUBLIC_WS_URL="https://hrms.bsctextiles.com"
```

### Step 3: Run Database Migrations & Initial Seed
```bash
npm ci --workspaces
npm run db:migrate --workspace=database
```

### Step 4: Build Backend & Frontend
```bash
npm run build:backend
npm run build:frontend
```

### Step 5: Start & Supervise Services via PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup # Generates and runs systemd command for reboot persistence
```

---

## 4. Nginx Reverse Proxy & SSL Configuration

### Step 1: Copy Nginx Site Configuration
```bash
cp infra/nginx/hostinger-hrms.conf /etc/nginx/sites-available/bsc-hrms
# Replace hrms.bsctextiles.com with your domain in the file
sed -i 's/hrms.bsctextiles.com/YOUR_DOMAIN.com/g' /etc/nginx/sites-available/bsc-hrms
ln -s /etc/nginx/sites-available/bsc-hrms /etc/nginx/sites-enabled/
```

### Step 2: Install SSL via Let's Encrypt Certbot
```bash
certbot --nginx -d YOUR_DOMAIN.com
nginx -t
systemctl reload nginx
```

---

## 5. eSSL MB160 Hardware Setup for Cloud Mode

### Method: Cloud Server Push (ADMS / iClock Protocol)
1. On the physical eSSL MB160 terminal, press **[ M/OK ]** to open the main menu.
2. Navigate to **Comm.** (Communication Settings) → press **[ OK ]**.
3. Select **Cloud Server Setting** (on some firmware versions: **ADMS** or **Server Setting**) → press **[ OK ]**.
4. Configure the following parameters:
   - **Enable Domain Name:** `ON` (or `Yes`)
   - **Server Address:** `YOUR_DOMAIN.com` (e.g. `hrms.bsctextiles.com`)
   - **Server Port:** `80` (or `443` if your device firmware supports HTTPS)
   - **Enable Proxy:** `OFF`
   - **Realtime Push:** `ON` (the terminal dispatches each punch as it happens
     rather than waiting for a pull — the arrival interval is still measured, not
     assumed; see the caveat below)
5. Save settings and restart the terminal.
6. **Verification on Device:** The network icon on the terminal display will show a globe/cloud icon with checkmark indicating successful handshake with the `/iclock/cdata` endpoint.
7. **Verification in HRMS:** Check the HRMS Executive Dashboard or `/attendance/punches` ledger to observe live socket events arriving on each punch.

> [!WARNING]
> **Port 80 means your attendance data crosses the public internet unencrypted.**
> The receiver accepts a push when its serial number matches a registered, active
> terminal row; unknown serials are answered `UNAUTHORIZED: UNKNOWN_DEVICE`. A
> serial number is printed on the terminal's underside, so it identifies the
> device but does not prove who is sending — anyone who can reach `/iclock` and
> guesses a serial can submit punches for that store. Prefer 443 if the firmware
> supports it; if it does not, restrict `/iclock` at nginx or the firewall to the
> store's public IP range, or put the store behind a VPN. Do not describe this
> link as secure, and do not expose port 4370 to the internet as a workaround.
>
> **Nothing in this section has been executed against a physical MB160 from this
> branch.** The menu paths, the cloud icon and the push interval are described by
> the protocol this code implements, not by an observation of your firmware. On
> the first real terminal, confirm: the exact Comm menu names, whether ADMS is
> present at all, the `verifyMode` codes it reports for face vs fingerprint, and
> the measured punch-to-dashboard latency.

---

## 6. Local LAN Mode Configuration (For Local Development or In-Store Server)

When running locally on a store LAN computer:
1. In `.env`:
   ```ini
   DEVICE_SYNC_MODE="local_lan"
   ```
2. In the terminal network settings:
   - Assign static IP: e.g. `192.168.100.136`
   - Subnet Mask: `255.255.255.0`
   - Gateway: Store router gateway IP
   - Port: `4370`
3. Run the supervised worker locally:
   ```bash
   npm run worker:supervised
   ```
   The worker connects directly to the terminal on port `4370` via native ZK protocol.

---

## 7. Monitoring, Diagnostics & Backup

### Live Service Health & Status
```bash
pm2 status
pm2 logs bsc-backend --lines 50
pm2 logs bsc-worker --lines 50
```

### Running Automated Test Suite on Production
```bash
npm run test:dual-mode --workspace=backend
npm run test:biometric --workspace=backend
npm run test:security --workspace=backend
```

### Automated Database Backup
Set up daily MySQL backup via cron:
```bash
crontab -e
# Add daily backup at 2:00 AM
0 2 * * * mysqldump -u bsc_hrms_app -pYOUR_STRONG_PROD_PASSWORD --all-databases | gzip > /var/backups/hrms_$(date +\%F).sql.gz
```
