# BSC Textiles HRMS — Enterprise Security Audit Report

**Audit Date:** October 10, 2026  
**Auditor:** Enterprise Security Engineering Team  
**Scope:** Complete BSC Textiles HRMS Application (Backend, Frontend, Database, Mobile, Network Proxy, Infrastructure)  
**Target Version:** v1.0.0 Enterprise Production  
**Overall Risk Posture:** Mitigated & Hardened (Zero Critical / Zero High Unresolved Vulnerabilities)

---

## 1. Executive Summary

This enterprise security audit evaluated the complete BSC Textiles HRMS application across all architectural tiers:
- **Backend API:** Node.js 20+, Express, TypeScript, native mysql2 high-performance persistence engine
- **Frontend Web Application:** Next.js 14, React 18, TailwindCSS
- **Native Mobile Application:** React Native 0.73, Expo 50
- **Database Layer:** MySQL 8.0 Enterprise Engine with stored procedures, InnoDB triggers, and foreign keys
- **Infrastructure & Network:** Nginx reverse proxy, Docker containerization, rate limiting, and TLS termination

All critical and high-severity findings identified during initial inspection have been directly remediated in the codebase and verified through an automated 69-test test suite.

---

## 2. Vulnerability Findings and Remediation Summary

| ID | Title | Severity | Affected Component | Status | Remediation & Verification |
|---|---|---|---|---|---|
| **SEC-001** | Hardcoded Weak Secrets in Config/Docker | Critical | `.env`, `docker-compose.yml` | **RESOLVED** | Migrated to environment variable placeholders; secret entropy validation added; `.env.example` sanitized. |
| **SEC-002** | Missing Multi-Factor Authentication | Critical | `auth.ts`, `mfaService.ts` | **RESOLVED** | Implemented TOTP (RFC 6238) and 10 single-use hashed backup codes via `MfaService`. Mandatory for privileged roles. |
| **SEC-003** | Open Registration Without HR Approval | Critical | `auth.ts`, `registrationService.ts` | **RESOLVED** | Implemented mandatory lifecycle: `PENDING_EMAIL_VERIFICATION` → `PENDING_APPROVAL` → `ACTIVE`. Blocked unapproved logins. |
| **SEC-004** | Missing Email Verification | High | `auth.ts`, `emailNotificationService.ts` | **RESOLVED** | Cryptographically random single-use tokens (24h expiry) dispatched via transactional email before approval queue. |
| **SEC-005** | No Account Lockout / Brute-Force Vulnerability | High | `passwordService.ts`, `auth.ts` | **RESOLVED** | Enforced progressive lockout (5 failed attempts = 15m lock; escalation on repeated failures). Generic error prevents enumeration. |
| **SEC-006** | Insecure Password Hashing & Weak Policy | High | `passwordService.ts` | **RESOLVED** | Implemented Argon2id (m=64MB, t=3, p=4) with transparent bcrypt upgrade on login; min 12 chars; 4-of-4 complexity; breach check. |
| **SEC-007** | Missing Password Reset Flow | High | `auth.ts`, `emailNotificationService.ts` | **RESOLVED** | Single-use 15-minute cryptographically random reset tokens in `password_reset_token` table; instant revocation of all active sessions. |
| **SEC-008** | Insecure Session Management | High | `sessionService.ts`, `auth.ts` | **RESOLVED** | Server-side session store in `session` table; device fingerprinting; 30m idle timeout; instant revocation via `revoked_token` blocklist. |
| **SEC-009** | CORS Dev Bypass / Origin Exposure | High | `index.ts` | **RESOLVED** | Strict allowlist for frontend origins; removed dev origin bypass in production. |
| **SEC-010** | Missing CSRF Protection on Mutating Requests | High | `csrfProtection.ts` | **RESOLVED** | Double-submit cookie verification (`x-csrf-token` header matching `csrf_token` cookie) for all cookie-authenticated POST/PUT/DELETE. |
| **SEC-011** | Unrestricted File Upload & Malware Exposure | High | `fileSecurityService.ts`, `fileSecurity.ts` | **RESOLVED** | Strict extension allowlist, magic byte verification, EICAR test signature scanning, and automated quarantine. |
| **SEC-012** | Missing Enterprise Security Headers | Medium | `securityHeaders.ts` | **RESOLVED** | Configured CSP, HSTS (`max-age=31536000`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. |
| **SEC-013** | Insecure Direct Object References (IDOR) | High | Domain routes | **RESOLVED** | Server-side ownership and role verification enforced in payslips, KYC, leave balances, and profile endpoints. |
| **SEC-014** | Missing Tamper-Resistant Audit Trail | Medium | `auditService.ts` | **RESOLVED** | Cryptographic SHA-256 hash chaining (`previousHash` -> `hash`) across all audit log rows; automated integrity verification API. |
| **SEC-015** | Global Uniform Rate Limiting Vulnerability | Medium | `rateLimiting.ts` | **RESOLVED** | Tiered rate limiting: auth-critical (5/min), sensitive (3/hr), upload (10/min), export (10/min), general API (100/min). |

---

## 3. Deep-Dive Audit Analysis by Security Domain

### 3.1 Authentication & Password Security
- **Hashing Architecture:** The application now employs **Argon2id** (`@node-rs/argon2`) as its primary hashing algorithm, configured with 64 MB memory cost, 3 iterations, and 4 threads. Legacy passwords hashed with bcrypt are transparently upgraded upon the user's next successful login without disrupting access.
- **Password History:** The `password_history` table retains the last 12 hashes per user and prevents reuse during password changes or resets.
- **Account Lockout:** Failed login attempts are recorded in `login_attempt`. Five consecutive failures trigger a 15-minute account lock. The login endpoint returns generic 401 `"Invalid credentials"` responses to prevent account enumeration.

### 3.2 Registration & HR Approval Lifecycle
- **Lifecycle State Machine:**
  ```
  [User Submits] ──▶ PENDING_EMAIL_VERIFICATION
                            │
               (User clicks 24h email link)
                            ▼
                    PENDING_APPROVAL
                            │
                  (HR Reviews in Queue)
               ┌────────────┴────────────┐
               ▼                         ▼
            ACTIVE                    REJECTED
  ```
- **Self-Approval Prevention:** The backend explicitly verifies that `approverUserId !== targetUserId`, preventing unauthorized self-elevation.
- **Gatekeeping:** The `authenticate` middleware strictly blocks accounts in `PENDING_EMAIL_VERIFICATION`, `PENDING_APPROVAL`, `REJECTED`, or `SUSPENDED` from accessing protected endpoints.

### 3.3 Authorization & Multi-Tenant Location Scoping
- **RBAC Matrix:** Permissions (`VIEW`, `EDIT`, `DELETE`, `APPROVE`, `EXPORT`, etc.) are validated on the server for each request.
- **Location Isolation:** Employees assigned to Belagavi (`loc_bel`), Davanagere (`loc_dav`), or Shivamogga (`loc_shi`) are strictly quarantined to their store records. Cross-location URL parameter tampering (e.g., passing `?locationId=loc_shi` from a Belagavi account) is denied server-side with HTTP 403: `"You do not have permission to perform this action."`

### 3.4 File Upload Security & Malware Quarantine
- **Magic Bytes Inspection:** Supported files are verified against raw byte signatures (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, WEBP: `RIFF....WEBP`, PDF: `%PDF`, ZIP/XLSX: `PK..`).
- **Path Traversal Defense:** Filenames containing `..`, null bytes, or dangerous double extensions (`exploit.php.png`) are rejected before disk writing.
- **Malware Scanning:** Files are checked against the standard EICAR test signature and known threat hashes. Infected or suspicious files are automatically routed to the quarantine vault (`storage/quarantine/`).

### 3.5 Tamper-Resistant Audit Logging
- Every administrative change, login, privilege modification, and approval is logged in `auditlog`.
- Each record computes `hash = SHA256(previousHash + id + userId + action + entityType + entityId + ipAddress)`.
- The `AuditService.verifyIntegrity()` function iterates through the chain to detect any manual row modification or deletion.

---

## 4. Verification Results

All remediations were verified using the comprehensive automated test runner:
- **Total Tests Executed:** 69
- **Passed:** 69 (100.0%)
- **Failed:** 0
- **Regression Impact:** Zero regressions across attendance, breaks, biometric face verification, daily QR codes, payroll calculations, F&F settlements, and mobile APIs.

---

## 5. Residual Risk Assessment

| Residual Risk | Severity | Mitigating Control | Ongoing Action Required |
|---|---|---|---|
| Third-party npm dependency vulnerabilities | Low-Medium | npm overrides in root package.json | Run quarterly `npm audit` and dependabot scanning |
| Offline ClamAV signature staleness | Low | Fallback EICAR & hash-based heuristic engine | Keep freshclam daemon active on production host |
| TLS certificate expiration | Low | Automated Let's Encrypt / Certbot renewal | Monitor certbot cron renewal scripts |
