# BSC Textiles HRMS — Security Configuration Baseline & Hardening Guide

**Document Version:** 1.0.0 Production  
**Target:** Production Environment Setup & Infrastructure Hardening  

---

## 1. Environment Configuration Baseline

Production deployments must define all required configuration variables in the host environment or secure secrets vault (e.g., AWS Secrets Manager, HashiCorp Vault):

### 1.1 Mandatory Production Environment Variables

```bash
# ── Database Isolation ──
DATABASE_URL="mysql://app_user:STRONG_PASSWORD@db-host:3306/bsc_textiles_hrms"

# ── JWT Authentication ──
# Minimum 32-character high-entropy secret (generate with: openssl rand -hex 32)
JWT_SECRET="GENERATE_A_CRYPTOGRAPHICALLY_RANDOM_SECRET_MIN_32_CHARS"
JWT_EXPIRES_IN="12h"
JWT_ISSUER="bsc-textiles-hrms"

# ── Host & Perimeter ──
NODE_ENV="production"
PORT="4000"
FRONTEND_URL="https://hrms.bsctextiles.com"
TRUSTED_PROXIES="127.0.0.1,::1"

# ── Transactional Email (SMTP) ──
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="apikey"
SMTP_PASS="YOUR_SENDGRID_PRODUCTION_KEY"
SMTP_FROM="BSC Textiles HRMS <security@bsctextiles.com>"
HR_ADMIN_EMAIL="hr-notifications@bsctextiles.com"

# ── Rate Limiting (Redis Backend) ──
REDIS_URL="redis://:REDIS_AUTH_PASSWORD@redis-host:6379/0"
```

---

## 2. Nginx Reverse Proxy Hardening

Deploy the configuration files located in `./nginx/`:
1. `nginx/nginx.conf`: Rate limiting zones, buffer constraints, and `server_tokens off`.
2. `nginx/conf.d/default.conf`:
   - Enforce TLS 1.2 and TLS 1.3 only (reject SSLv3, TLS 1.0, and TLS 1.1).
   - Strict Transport Security (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).
   - Frame and content options (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
   - Request body limit capped at `15M` to prevent buffer overflow attacks.

### TLS Cipher Suite Configuration:
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
```

---

## 3. Database Hardening Checklist (MySQL 8.0)

1. **Disable Public Access:** MySQL must bind to private network interfaces only. Never expose port 3306 to public IP addresses.
2. **Dedicated Least-Privilege Database Users:**
   - Application User: Grants restricted to `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `bsc_textiles_hrms.*`.
   - Migration User: Grants for `CREATE`, `ALTER`, `DROP`, `INDEX` executed strictly during migration runs.
3. **Prepared Statements Enforced:** All data queries use parameterized prepared statements via `mysql2/promise` driver to prevent SQL injection.
4. **Audit Log Append-Only:** Prevent application users from issuing `UPDATE` or `DELETE` on the `auditlog` table.

---

## 4. Application Rate Limiting Thresholds

The backend implements centralized tiered rate limiters:

| Endpoint Group | Threshold | Action on Exceed |
|---|---|---|
| `/api/auth/login`, `/api/auth/register`, `/api/auth/mfa/*` | 5 requests / minute per IP/Account | HTTP 429 (`Retry-After: 60`) |
| `/api/auth/forgot-password`, `/api/auth/reset-password` | 5 requests / hour per Account | HTTP 429 (`Retry-After: 3600`) |
| `/api/files/upload` | 10 uploads / minute per User | HTTP 429 (`Retry-After: 60`) |
| `/api/reports/*`, `/api/payroll/*/export` | 10 exports / minute per User | HTTP 429 (`Retry-After: 60`) |
| General Protected APIs | 100 requests / minute per User | HTTP 429 |

---

## 5. Security Header Baseline

All HTTP responses from the backend API emit:
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()`
- Removal of all `X-Powered-By` application headers.
