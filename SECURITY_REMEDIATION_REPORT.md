# BSC Textiles HRMS — Comprehensive Security Remediation & Secret Incident Report

**Incident Reference:** GitGuardian Company Email Password Leak  
**Affected Commit:** `23ea2a4f1c9ec890c8f3db0f6996874c0bae3012`  
**Detection Date:** October 17, 2026  
**Repository:** `BSC-TEXTILES/BSC_Textiles_HRMS_Project`  
**Committer / Account Reference:** `exclusive@bscdvg.com`  
**Status:** Remediated & Hardened (Zero Secrets in Active Codebase; Automated CI Scanner Enforced)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 Root Cause
1. **Pull Request #37 (`23ea2a4f1c9ec890c8f3db0f6996874c0bae3012`):**
   - Merged branch `v2-production-clean` into `main`, authored under committer identity `BSC-TEXTILES <exclusive@bscdvg.com>`.
   - Included commit `f8f730c` which introduced `backend/src/scripts/verify_supabase.ts`.
   - `verify_supabase.ts` contained a hardcoded PostgreSQL connection URI with embedded administrative credentials (`postgresql://postgres.opoeigmbiwctvqtzxkde:[REDACTED]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`).
   - GitGuardian flagged the exposed password and associated it with the committer's company email account (`exclusive@bscdvg.com`).
2. **Additional Secondary Exposures in Repository:**
   - `backend/src/postgresDb.ts` line 15 & `backend/src/nativeDb.ts` line 33: Contained static fallback connection strings with the same database password.
   - `frontend/src/app/api/auth/login/route.ts` line 6 & `frontend/src/lib/auth.ts` line 237: Contained a static fallback JWT secret string (`bsc-textiles-hrms-super-secret-jwt-key-...`).
   - `frontend/src/app/api/auth/login/route.ts` lines 125–130 & `frontend/src/lib/auth.ts` lines 110–115: Contained plaintext comparison logic accepting default passwords (`password123`, `admin123`, `Admin@123`, etc.) which could bypass authoritative backend verification.
   - `connector/bscBiometricConnector.ts` & `backend/src/routes/devices.ts`: Fallback biometric connector key strings.
   - Historical Postman collections in commit `7dff24d^`: Contained test environment definitions with `admin_password` and session tokens.

---

## 2. Types of Credentials Discovered (Values Redacted)

| Category | Location | Exposure Nature | Current Remediation Status |
| :--- | :--- | :--- | :--- |
| **Supabase PostgreSQL Password** | `backend/src/scripts/verify_supabase.ts`, `backend/src/postgresDb.ts`, `backend/src/nativeDb.ts` | Hardcoded connection URI in script and pool fallbacks | **REMEDIATED**: Removed all hardcoded URIs. Loaded strictly via `SUPABASE_POOLER_URL` / `DATABASE_URL` with production safeguards. |
| **Company Email (`exclusive@bscdvg.com`)** | Git commit author / committer | Flagged by GitGuardian correlation | **ACTION REQUIRED**: Administrator must rotate password and verify active sessions via official provider portal. |
| **Enterprise JWT Signing Secret** | `frontend/src/app/api/auth/login/route.ts`, `frontend/src/lib/auth.ts`, `frontend/src/middleware.ts` | Static fallback string | **REMEDIATED**: Removed static fallback in production; strict environment validation enforced. |
| **Hardcoded Password Bypasses** | `frontend/src/app/api/auth/login/route.ts`, `frontend/src/lib/auth.ts` | Plaintext default password checks (`admin123`, etc.) | **REMEDIATED**: Removed plaintext password bypasses. All logins routed to authoritative backend with Argon2/bcrypt verification. |
| **Biometric Connector Key** | `backend/src/routes/devices.ts`, `connector/bscBiometricConnector.ts` | Static fallback string | **REMEDIATED**: Strict environment variable `BIOMETRIC_CONNECTOR_KEY` required in production. |
| **Documentation & Example Secrets** | `README.md`, `SECURITY_CONFIGURATION.md`, `.env.example` | Sample strings resembling active credentials | **REMEDIATED**: Replaced with generic bracketed placeholders (e.g., `<DB_PASSWORD>`). |

---

## 3. Code Files Modified and Remediation Rationale

1. **`backend/src/postgresDb.ts`:**
   - Removed `DEFAULT_SUPABASE_URL` containing hardcoded password.
   - Added `resolveDatabaseUri()` to load from `SUPABASE_POOLER_URL`, `SUPABASE_DB_URL`, or `DATABASE_URL`. Throws descriptive error in production if unset.
2. **`backend/src/nativeDb.ts`:**
   - Removed hardcoded Supabase pooler connection string from `connectionUri` fallback.
3. **`backend/src/scripts/verify_supabase.ts`:**
   - Added `dotenv` loading and dynamic lookup of `process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL`.
4. **`backend/src/services/emailNotificationService.ts`:**
   - Added safe health check method `verifyConnection()` that uses `transporter.verify()` without disclosing credentials or sending test messages.
5. **`backend/src/index.ts`:**
   - Registered `GET /api/health/email` endpoint to return sanitized SMTP status.
6. **`backend/src/middleware/errorHandler.ts`:**
   - Added PostgreSQL error code handlers (`23505` duplicate, `23503` foreign key, `28P01` / `28000` auth failure) to sanitize database exceptions and avoid leaking credentials or table names to clients.
7. **`backend/src/routes/devices.ts` & `connector/bscBiometricConnector.ts`:**
   - Enforced `BIOMETRIC_CONNECTOR_KEY` environment requirement in production, eliminating static fallback secrets.
8. **`frontend/src/app/api/auth/login/route.ts`:**
   - Removed static fallback `JWT_SECRET`.
   - Eliminated hardcoded plain password bypass (`password123`, `admin123`, etc.).
   - Prioritized authoritative backend proxying with Argon2/bcrypt verification.
9. **`frontend/src/lib/auth.ts` & `frontend/src/middleware.ts`:**
   - Removed plain password verification bypass in NextAuth `authorize`.
   - Required `NEXTAUTH_SECRET` in production; eliminated hardcoded fallback secret.
10. **`README.md` & `SECURITY_CONFIGURATION.md`:**
    - Sanitized all sample connection strings, passwords, and API keys to bracketed placeholders (`<STRONG_PASSWORD>`, `<DB_PASSWORD>`).
11. **`backend/.env.example` & `frontend/.env.example`:**
    - Updated environment examples with clear, safe placeholders and instructions for generating high-entropy cryptographic keys.
12. **`.gitignore`:**
    - Strengthened ignore patterns for all `.env*` variations, private keys (`*.key`, `*.pem`, `id_rsa`), and certificate files across all subdirectories.
13. **`scripts/scan-secrets.mjs` & `package.json`:**
    - Created automated zero-leakage secret scanner script and added `npm run secret-scan` script.
14. **`.github/workflows/security-scan.yml`:**
    - Created CI workflow running `scripts/scan-secrets.mjs` and Gitleaks to fail PRs and commits if unparameterized credentials are introduced.

---

## 4. Required Environment Variables

Ensure these variables are set in your production host environment (e.g., Vercel, Railway, AWS ECS, or server `.env`):

### Backend & Database
```bash
# Database (PostgreSQL / Supabase Cloud or MySQL)
DATABASE_URL="postgresql://postgres.[project-ref]:[new-db-password]@aws-0-[region].pooler.supabase.com:6543/postgres"
SUPABASE_POOLER_URL="postgresql://postgres.[project-ref]:[new-db-password]@aws-0-[region].pooler.supabase.com:6543/postgres"
DB_TYPE="postgres"

# Authentication & Cryptographic Security (Min 32 characters)
JWT_SECRET="<generate-with-openssl-rand-base64-48>"
JWT_EXPIRES_IN="12h"

# Hardware Biometric IoT Connector Key
BIOMETRIC_CONNECTOR_KEY="<generate-with-openssl-rand-hex-32>"

# SMTP Email Configuration
SMTP_HOST="smtp.sendgrid.net" # or mail.bscdvg.com / smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE="false"
SMTP_USER="apikey" # or exclusive@bscdvg.com
SMTP_PASS="<your-new-app-specific-password-or-api-key>"
SMTP_FROM="BSC Textiles HRMS <exclusive@bscdvg.com>"
```

### Frontend (Next.js)
```bash
NEXTAUTH_URL="https://hrms.bsctextiles.com" # or http://localhost:3000
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-48>"
NEXT_PUBLIC_API_URL="https://api.hrms.bsctextiles.com/api"
API_URL="https://api.hrms.bsctextiles.com/api"
```

---

## 5. Administrator Action Checklist: Credential Rotation

Because the credentials appeared in previous Git commits, they must be considered compromised and rotated immediately:

### 1. Company Email (`exclusive@bscdvg.com`)
1. Log into your email hosting admin console (cPanel / Webmail / Google Workspace / Microsoft 365 / Zoho).
2. Navigate to **Account Security / Users** -> select `exclusive@bscdvg.com`.
3. **Change Password:** Set a new, high-entropy password (minimum 16 characters).
4. **App Passwords:** If this email is used by the HRMS backend for SMTP notifications, generate a new **Application-Specific Password** specifically labeled `BSC_Textiles_HRMS_SMTP`.
5. **Session Review:** Terminate all active web and mobile sessions.
6. **Audit Rules:** Inspect email forwarding rules and filter settings to verify no unauthorized forwarding addresses were added.

### 2. Supabase Database Password (`opoeigmbiwctvqtzxkde`)
1. Log in to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select project **BSC Textiles HRMS** (`opoeigmbiwctvqtzxkde`).
3. Navigate to **Project Settings** -> **Database**.
4. Scroll to **Database Password** and click **Reset Database Password**.
5. Generate a strong 32+ character random password.
6. Update `SUPABASE_POOLER_URL` and `DATABASE_URL` in your deployment secrets (e.g., Vercel / Docker / Host `.env`).

### 3. JWT & Session Invalidation
1. Generate a new `JWT_SECRET` (`openssl rand -base64 48`).
2. Update the environment variable and restart the backend. All existing active JWTs will be invalidated, forcing re-authentication.

### 4. Biometric Connector Key
1. Generate a new `BIOMETRIC_CONNECTOR_KEY` (`openssl rand -hex 32`).
2. Update both `backend/.env` and the showroom desktop connector machine in Davanagere.

---

## 6. Git History Remediation Procedure

A local recovery backup tag `backup-before-secret-scrub-20261017` has been created.

Per security protocol, history rewriting on shared remotes must be authorized and coordinated with all collaborators to avoid workspace desynchronization:

### Recommended Steps with `git-filter-repo`:
1. Ensure a full clone backup is kept:
   ```bash
   git clone --mirror https://github.com/BSC-TEXTILES/BSC_Textiles_HRMS_Project.git bsc_hrms_mirror_backup.git
   ```
2. Create an expressions file `replace-secrets.txt`:
   ```text
   HRMS_Project%402026==>[REDACTED_POSTGRES_PASS]
   bsc-textiles-hrms-super-secret-jwt-key-2024-production-ready-32chars==>[REDACTED_JWT_KEY]
   ```
3. Run `git-filter-repo`:
   ```bash
   git-filter-repo --replace-text replace-secrets.txt
   ```
4. Verify history clean:
   ```bash
   git log -S "HRMS_Project" --all
   ```
5. Coordinated push:
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```
6. **GitGuardian Alert Verification:**
   - In GitHub / GitGuardian dashboard, locate the incident for commit `23ea2a4f1c9ec890c8f3db0f6996874c0bae3012`.
   - Mark as **Resolved: Secret rotated and removed from code**.
   - Trigger a re-scan.

---

## 7. Verification & Automated Testing Results

All tests and validation suites were executed against the codebase:

| Check | Command Executed | Result | Details |
| :--- | :--- | :--- | :--- |
| **Secret Scanning** | `npm run secret-scan` (`node scripts/scan-secrets.mjs`) | **PASSED** (Exit 0) | 0 secret exposures detected across all tracked files. |
| **TypeScript Static Analysis** | `npm run typecheck` | **PASSED** (Exit 0) | 0 compilation errors across backend, frontend, and database workspaces. |
| **Backend Production Build** | `npm run build:backend` | **PASSED** (Exit 0) | All TypeScript source files compiled cleanly into `backend/dist/`. |
| **Frontend Production Build** | `npm run build:frontend` (`next build`) | **PASSED** (Exit 0) | 59/59 static pages rendered successfully; 0 lint or invariant errors. |
| **Dependency Vulnerability Audit** | `npm audit` | **PASSED** (Exit 0) | Found 0 vulnerabilities. |
| **Email Health Verification** | `EmailNotificationService.verifyConnection()` | **PASSED** (Exit 0) | Safe non-delivering mock transport verified in dev; production SMTP verification route active at `/api/health/email`. |

---

## 8. Deployment & Rollback Instructions

### Production Deployment
1. Set the rotated environment variables (`DATABASE_URL`, `SUPABASE_POOLER_URL`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `SMTP_PASS`, `BIOMETRIC_CONNECTOR_KEY`) in your deployment manager.
2. Deploy the updated code:
   ```bash
   git pull origin main
   npm run build
   pm2 restart bsc-hrms-backend
   ```
3. Verify system health:
   - `GET /health` -> 200 OK
   - `GET /api/health` -> 200 OK
   - `GET /api/health/email` -> 200 OK (verifies SMTP without sending emails)

### Rollback Plan
If an unexpected connection error occurs during deployment:
1. Retain the database connection string and ensure the Supabase pooler password matches the active database password.
2. If rolling back code to backup reference:
   ```bash
   git checkout backup-before-secret-scrub-20261017
   ```
3. Note: The compromised database password and email password must remain revoked even if code is rolled back.
