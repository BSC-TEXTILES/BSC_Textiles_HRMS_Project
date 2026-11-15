# HRMS documentation library

Start with the [project README](../../README.md) for the current modules, operating modes, architecture, data flow diagrams, configuration and commands.

## Workspace guides

- [Frontend](../../frontend/README.md)
- [Backend](../README.md)
- [Database and migrations](../../database/README.md)
- [LAN edge connector](../connector/README.md)
- [Root security policy](../../SECURITY.md)

## Deployment and operations

| Guide | Use |
| --- | --- |
| [Current session and Hostinger fixes](SESSION-DEPLOYMENT.md) | Shared-listener startup, database/schema recovery and session checks |
| [Hostinger deployment](HOSTINGER_DEPLOYMENT_GUIDE.md) | Hosting background; prefer the current repair guide for changed startup behavior |
| [Installation](INSTALLATION.md) | Installation background; verify commands against current package.json |
| [Local database](LOCAL_DATABASE.md) | Local storage/development context |
| [Backup and restore](BACKUP_RESTORE.md) | Procedures to adapt to actual databases, shards and storage |
| [Troubleshooting](TROUBLESHOOTING.md) | Operational diagnosis |
| [Testing](TESTING.md) | Test prerequisites and workflows |
| [Offline mode](OFFLINE_MODE.md) | Historical design context; current scripts do not package a desktop installer |

## Architecture and functional guides

- [Architecture](ARCHITECTURE.md) and [root architecture notes](../../ARCHITECTURE.md)
- [Database sharding](DATABASE_SHARDING_ARCHITECTURE.md)
- [Attendance flow](ATTENDANCE_FLOW.md)
- [Bulk employee import](bulk_employee_import_guide.md)
- [RBAC](RBAC.md) and [security notes](SECURITY.md)
- [Device setup](DEVICE_SETUP.md)
- [Biometric MB160](BIOMETRIC_MB160.md)
- [eSSL integration](ESSL_MB160_BIOMETRIC_INTEGRATION.md)
- [Biometric IoT report](BIOMETRIC_IOT_INTEGRATION_REPORT.md)

## Reports and history

- [API documentation report](reports/API_DOCUMENTATION.md)
- [Security architecture report](reports/SECURITY_ARCHITECTURE.md)
- [Organization module report](reports/ORGANIZATION_MODULE_DELIVERY.md)
- [Optimization report](OPTIMIZATION_REPORT.md)
- [Project memory](PROJECT_MEMORY.md)
- [Documentation changelog](CHANGELOG.md) and [root changelog](../../CHANGELOG.md)
- [Hiring change note](change-memory/2026-10-17-001-candidate-hiring-module.md)

Reports and change-memory entries are point-in-time records. Executable scripts, route registration and migrations take precedence over older instructions. A historical test result is not evidence that the current live deployment passes.

## Data accuracy and recent coverage

Screens must represent actual database/device evidence. Unknown enrollments need exception handling. Ping is not authenticated synchronization. Do not invent punches or verification percentages. Keep weekly off, holiday, leave and absence distinct. Verify schema readiness, authorized login and real device ingestion separately.

The workspace READMEs cover unified startup, explicit MySQL configuration, session proxy routing, missing-schema handling, retryable consent saves, device modes, hiring/outbox flow and migrations through 048. The root README contains the overall flow diagrams.
