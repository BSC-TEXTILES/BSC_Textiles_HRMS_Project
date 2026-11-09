# Documentation index

BSC Textiles HRMS — Belagavi/Shivamogga silk retail, Karnataka. What the system
does: it turns face-recognition events from eSSL MB160 terminals into attendance,
and attendance into payroll-visible numbers, with every step attributable.

## Start here

| Document | Read it when |
|---|---|
| [../README.md](../README.md) | setting the project up, running it, finding a route |
| [ARCHITECTURE.md](ARCHITECTURE.md) | you need the module map and the two-source-of-truth rule |
| [ATTENDANCE_FLOW.md](ATTENDANCE_FLOW.md) | you need to know how a punch becomes a day |
| [DEVICE_SETUP.md](DEVICE_SETUP.md) | you are installing, registering or debugging a terminal |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | something looks wrong on screen |
| [../SECURITY.md](../SECURITY.md) | you are deploying, or deciding what a screen may claim |
| [RBAC.md](RBAC.md) | you are granting or auditing module permissions |
| [TESTING.md](TESTING.md) | you are changing attendance, export or device code |

## Deeper dives

| Document | Subject |
|---|---|
| [BIOMETRIC_MB160.md](BIOMETRIC_MB160.md) | terminal integration notes and firmware findings |
| [ESSL_MB160_BIOMETRIC_INTEGRATION.md](ESSL_MB160_BIOMETRIC_INTEGRATION.md) | the original integration write-up |
| [BIOMETRIC_IOT_INTEGRATION_REPORT.md](BIOMETRIC_IOT_INTEGRATION_REPORT.md) | audit report for the IoT layer |
| [DATABASE_SHARDING_ARCHITECTURE.md](DATABASE_SHARDING_ARCHITECTURE.md) | hiring shard topology and the shard guard |
| [LOCAL_DATABASE.md](LOCAL_DATABASE.md), [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | local MySQL setup, backups |
| [OFFLINE_MODE.md](OFFLINE_MODE.md) | the desktop/offline variant |
| [HOSTINGER_DEPLOYMENT_GUIDE.md](HOSTINGER_DEPLOYMENT_GUIDE.md) | cloud deployment and the ADMS push path |
| [OPTIMIZATION_REPORT.md](OPTIMIZATION_REPORT.md) | performance findings |
| [CHANGELOG.md](CHANGELOG.md), [PROJECT_MEMORY.md](PROJECT_MEMORY.md) | history and decisions |

## The rule the whole system is built around

A screen may display only what exists in the database. If a terminal did not
report it, the UI says `—`, `Unknown`, `Not reported by device` or `NO_RECORD`
instead of showing a plausible value. Concretely:

* no face-match percentage is displayed unless the device sent `matchValue`
  (the MB160 firmware in use sends none — every stored `matchValue` is `NULL`);
* no punch row is generated to fill an empty ledger;
* an enrolled ID that matches no employee stays in the exception queue and never
  borrows someone else's identity;
* weekly off, holiday, approved leave and absent come from their own records and
  are not inferred from each other or from the weekday;
* statuses are what the server observed: a device whose IP answers a ping but
  fails the ZK handshake is `DISCONNECTED`, not `SYNCED`.

Related source: `backend/src/services/biometric/verifyMode.ts`,
`backend/src/services/biometric/ingest.ts`,
`backend/src/services/attendance/attendanceWorkbook.ts`,
`backend/src/routes/attendanceExports.ts`.
