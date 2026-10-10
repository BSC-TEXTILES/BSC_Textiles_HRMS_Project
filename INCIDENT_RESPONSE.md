# BSC Textiles HRMS — Incident Response & Security Operations Plan

**Document Version:** 1.0.0 Production  
**Classification:** Operational Security Runbook  
**Target:** BSC Textiles Enterprise Infrastructure & Applications  

---

## 1. Incident Response Team & Escalation Hierarchy

| Role | Responsibility | Contact Channel |
|---|---|---|
| **Incident Commander (IC)** | Leads incident triage, containment decisions, and executive briefings | `security-lead@bsctextiles.com` |
| **Technical Lead** | Coordinates code patches, database integrity audits, and deployment verification | `tech-lead@bsctextiles.com` |
| **Database Administrator (DBA)** | Handles data isolation, point-in-time recovery, and audit log analysis | `dba@bsctextiles.com` |
| **HR Operations Lead** | Coordinates employee communications, account suspensions, and HR policy actions | `hr-lead@bsctextiles.com` |
| **Infrastructure Lead** | Manages Nginx proxy blocks, IP firewalls, and server access control | `devops@bsctextiles.com` |

---

## 2. Severity Classification Matrix

| Severity | Definition | Target Triage Time | Target Resolution |
|---|---|---|---|
| **SEV-1 (Critical)** | Active data exfiltration, root compromise, ransomware, or widespread service outage | < 15 minutes | < 2 hours |
| **SEV-2 (High)** | Single compromised privileged account (Admin/HR), malware detected in quarantine, or persistent brute force | < 30 minutes | < 4 hours |
| **SEV-3 (Medium)** | Non-privileged suspicious login, repeated rate-limit violations, or single unverified upload attempt | < 2 hours | < 24 hours |
| **SEV-4 (Low)** | Minor configuration warning, non-critical dependency advisory, or isolated failed auth | < 24 hours | Next Sprint |

---

## 3. Incident Response Playbooks

### Playbook 1: Compromised Account or Credential Stuffing
1. **Detection:**
   - Security monitoring triggers `BRUTE_FORCE` or `ACCOUNT_TAKEOVER_ATTEMPT` event.
   - User reports unfamiliar login alert email or unexpected password change notification.
2. **Containment:**
   - Immediately revoke all active sessions for the user:
     ```bash
     # Execute emergency session revocation via API or database
     POST /api/security/locked-accounts/{userId}/unlock # (or lock)
     ```
   - Invalidate all tokens by inserting `userId` into `revoked_token`.
   - Set `user.status = 'SUSPENDED'` and `user.lockedUntil = NOW() + INTERVAL 24 HOUR`.
3. **Eradication:**
   - Review `auditlog` for all actions taken by `userId` during the suspected breach window.
   - Revert any unauthorized changes (e.g., modified bank details, leave requests, employee records).
4. **Recovery:**
   - Reset user password to a cryptographically generated temporary secret.
   - Force MFA re-enrollment (`user.mustChangePassword = 1`, `user.mfaEnabled = 0`).
   - Re-activate account to `status = 'ACTIVE'` only after identity re-verification with HR.
5. **Post-Incident:**
   - Add offending source IP addresses to Nginx edge blocklist.

---

### Playbook 2: Credential or Secret Leak (e.g., JWT Secret, Database Password)
1. **Detection:**
   - Secret scanner alerts on git commit, build log, or external paste site.
2. **Containment:**
   - Assume all issued tokens signed with the compromised secret are untrusted.
   - Initiate emergency secret rotation in production `.env` and environment store.
3. **Eradication:**
   - Update `JWT_SECRET` with a freshly generated 64-character cryptographic random string:
     ```bash
     openssl rand -hex 32
     ```
   - Restart backend application containers to load the new secret.
   - Mass-revoke all existing sessions in the database:
     ```sql
     UPDATE session SET revoked = 1, revokedReason = 'EMERGENCY_SECRET_ROTATION';
     ```
4. **Recovery:**
   - All legitimate users will be prompted to sign in with their credentials and MFA codes.
   - Scrub Git history using `git-filter-repo` or BFG Repo-Cleaner if accidentally committed.

---

### Playbook 3: Malicious File Upload or Malware Detection
1. **Detection:**
   - `FileSecurityService` detects EICAR signature, threat hash match, or magic byte forgery.
   - File status is marked `INFECTED` or `QUARANTINED` in `file_upload`.
2. **Containment:**
   - File is automatically confined to `storage/quarantine/` outside the web root.
   - Download endpoint (`GET /api/files/:id/download`) strictly forbids serving non-APPROVED files.
3. **Eradication:**
   - Inspect the uploading user account (`file_upload.userId`) and IP address.
   - If intentional attack: suspend the user account and revoke active sessions.
   - Permanently delete the quarantined payload after taking cryptographic forensic hashes:
     ```bash
     rm storage/quarantine/{storedName}
     ```
4. **Recovery:**
   - Update malware signatures table (`malware_signature`) with new threat indicators.
   - Notify uploading employee if determined to be accidental malware transmission from an infected client device.

---

### Playbook 4: Audit Log Hash Chain Gap or Tampering Attempt
1. **Detection:**
   - `AuditService.verifyIntegrity()` returns `valid: false` with specific `tamperedId`.
2. **Containment:**
   - Freeze application access if an active attacker is modifying database audit records.
   - Snapshot MySQL transaction log and binary logs (`mysqlbinlog`).
3. **Forensic Analysis:**
   - Identify the point in the hash chain where `row.previousHash !== expectedPreviousHash`.
   - Cross-reference with MySQL binary logs to discover which database connection altered the row.
4. **Recovery:**
   - Restore database state from the most recent verified point-in-time backup.
   - Re-verify hash chain integrity across all records.

---

## 4. Post-Mortem Template

Every SEV-1 and SEV-2 incident requires a formal blameless post-mortem within 48 hours:
- **Incident Summary:** Date, duration, severity, impact.
- **Root Cause Analysis (5 Whys):** Underlying flaw that enabled the vulnerability.
- **Timeline of Events:** Chronological breakdown from exploitation to resolution.
- **Corrective Actions:** Immediate fixes applied and permanent preventative architectural tasks.
