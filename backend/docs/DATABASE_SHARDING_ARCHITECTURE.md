# BSC Textiles HRMS — Database Sharding & User Identity Architecture

## 1. Executive Summary

BSC Textiles Pvt. Ltd. operates multi-store retail showrooms across Karnataka (Belagavi Head Store, Davanagere Mega Store, and Shivamogga Flagship). To ensure complete location data isolation, sub-millisecond query performance, fault isolation, and regulatory compliance, the application employs a **Production-Grade MySQL 8.0 Database Sharding Architecture**.

### Key Architectural Tenets
- **Central Metadata / Control Database (`BSC-SHARD-HQ-001`)**: Authoritative repository for user identities, authentication, roles, session tokens, global registry, and audit trails.
- **Operational Location Shards**: Independent, isolated MySQL databases dedicated to specific store locations:
  - `BSC-SHARD-BEL-001` (`bsc_shard_bel`) — Belagavi Head Store
  - `BSC-SHARD-DAV-001` (`bsc_shard_dav`) — Davanagere Mega Store
  - `BSC-SHARD-SHI-001` (`bsc_shard_shi`) — Shivamogga Flagship
- **Permanent Internal User ID & Logical Database ID**: Every user is mapped to a unique, immutable `database_id` persisted in MySQL (`user_database_assignments` and `user.database_id`).
- **Server-Side Secure Routing & Zero Client Tampering**: The server validates user permissions and pins requests to the user's assigned shard. Changing client request parameters (headers, query string, request body) to spoof a foreign location or shard is strictly rejected with a `403 Forbidden` and audited.
- **Cross-Shard Aggregation Engine**: Enables executive dashboards and reports across multiple shards with bounded concurrency, error isolation, and latency annotations.

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    Client[Next.js Frontend / Desktop / Mobile]
    Router[Express API Gateway & Security Layer]
    Auth[Authentication & Shard Access Middleware]
    ShardMgr[Shard Connection Manager & Pool Registry]
    
    subgraph Control_Plane [Central Metadata & Control Database]
        HQ_DB[(BSC-SHARD-HQ-001: bsc_textiles_hrms)]
        T_Users[user & roles]
        T_Shards[database_shards]
        T_Assignments[user_database_assignments]
        T_Migrations[shard_migrations]
        T_Audit[audit_logs]
    end

    subgraph Operational_Shards [Operational Store Shards]
        BEL_DB[(BSC-SHARD-BEL-001: bsc_shard_bel)]
        DAV_DB[(BSC-SHARD-DAV-001: bsc_shard_dav)]
        SHI_DB[(BSC-SHARD-SHI-001: bsc_shard_shi)]
    end

    Client -->|JWT + Request| Router
    Router --> Auth
    Auth -->|1. Resolve User Shard & Verify Scope| HQ_DB
    Auth -->|2. Route Parameterized Query| ShardMgr

    ShardMgr -->|Belagavi Staff & Punches| BEL_DB
    ShardMgr -->|Davanagere Staff & Punches| DAV_DB
    ShardMgr -->|Shivamogga Staff & Punches| SHI_DB
    ShardMgr -->|Cross-Shard Aggregation| Operational_Shards
```

---

## 3. Shard Registry & Configuration

All configured database shards are registered in table `database_shards`:

| Logical Database ID | Shard Name | Showroom Location | Physical DB Name | Secret Reference | Role | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `BSC-SHARD-HQ-001` | Headquarters & Central Control | HQ / Global | `bsc_textiles_hrms` | `DATABASE_URL_HQ` | Control / Master | `ACTIVE` |
| `BSC-SHARD-BEL-001` | Belagavi Operational Store | BEL (Belagavi) | `bsc_shard_bel` | `DATABASE_URL_BEL` | Operational Shard | `ACTIVE` |
| `BSC-SHARD-DAV-001` | Davanagere Mega Store | DAV (Davanagere) | `bsc_shard_dav` | `DATABASE_URL_DAV` | Operational Shard | `ACTIVE` |
| `BSC-SHARD-SHI-001` | Shivamogga Flagship | SHI (Shivamogga) | `bsc_shard_shi` | `DATABASE_URL_SHI` | Operational Shard | `ACTIVE` |

---

## 4. User Identity & Persistent Shard Mapping

### Data Schema (`user_database_assignments`)
```sql
CREATE TABLE `user_database_assignments` (
  `id` VARCHAR(191) PRIMARY KEY,
  `user_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NULL,
  `location_id` VARCHAR(191) NULL,
  `database_id` VARCHAR(64) NOT NULL,
  `status` ENUM('ACTIVE','MIGRATING','REVOKED') DEFAULT 'ACTIVE',
  `assignment_type` ENUM('LOCATION_DEFAULT','EXPLICIT_OVERRIDE','CROSS_SHARD_ADMIN') DEFAULT 'LOCATION_DEFAULT',
  `assigned_by` VARCHAR(191) NULL,
  `assigned_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uk_user_active_assignment` (`user_id`, `status`),
  KEY `idx_uda_database_id` (`database_id`),
  CONSTRAINT `fk_uda_database_id` FOREIGN KEY (`database_id`) REFERENCES `database_shards` (`database_id`)
);
```

### Immutable Mapping Lifecycle
1. When a user logs in, the `authenticate` middleware loads `req.user.databaseId` directly from trusted MySQL records.
2. If the user is assigned to Belagavi (`locationId: 'cmuwszr8t00011vdtc7vgvags'`), their `databaseId` is resolved as `BSC-SHARD-BEL-001`.
3. If an employee transfers between locations, a Super Admin triggers an audited reassignment (`POST /api/v1/shards/assignments/reassign`) which updates the mapping and syncs employee data transactionally.

---

## 5. Server-Side Routing & Connection Pooling

### Connection Pool Configuration
Implemented in `backend/src/core/sharding/ShardConnectionManager.ts`:
- **Pool Sizing**: 20 maximum connections, 8 max idle connections per shard.
- **Acquisition Timeout**: 5,000 ms.
- **Keep-Alive**: Active TCP keep-alive with 10,000 ms initial delay.
- **Health Monitoring**: Background heartbeat every 60 seconds with per-shard latency measurement.
- **Graceful Termination**: All connection pools are drained cleanly upon `SIGINT` or `SIGTERM`.

### Query Routing Protocol
- **Read Operations**: `shardRouter.executeShardRead(databaseId, sql, params)`
- **Write Operations**: `shardRouter.executeShardWrite(databaseId, sql, params)`
- **Local Transactions**: `shardRouter.executeShardTransaction(databaseId, async (conn) => { ... })`
- **Cross-Shard Aggregation**: `shardRouter.executeCrossShardAggregation(async (shardId, pool) => { ... })`

---

## 6. Location Isolation & Anti-Tamper Security

### Security Enforcement Rules
1. **Never Trust Client Shard IDs**:
   A client request specifying `?databaseId=BSC-SHARD-DAV-001` or `?locationId=...` is never accepted as proof of authorization.
2. **Boundary Enforcement**:
   If a non-Super Admin (e.g. Belagavi Floor Manager or Sales Employee) sends a request targeting another location or shard, the `enforceShardAccess` middleware immediately:
   - Blocks the request with `403 Forbidden`.
   - Records a high-priority audit event in `audit_logs` with action `CROSS_SHARD_ACCESS_VIOLATION`.
3. **Super Admin Global Scope**:
   Super Admins have cross-shard permissions, but requests to individual location views are routed explicitly to the corresponding location shard.

---

## 7. Administrative Shard Management UI

Accessible at `/admin/shards` by authorized Super Admins:
- **Operational Shard Topology**: Live status badges, latency in ms, active connection metrics, and employee record counts.
- **User Database Assignments Ledger**: Searchable, filterable table of all users, their showroom location, and assigned logical shard.
- **Controlled Reassignment Modal**: Reassign staff to another shard with audit justification.
- **Live Health Check**: On-demand ping verifying connectivity across all shards.
- **Migration & Checkpoint Audit**: Historical audit trail of all schema and data migrations.

---

## 8. Development & Deployment Runbook

### Windows / Local Development Setup
1. Ensure MySQL 8.0 is running locally on port 3306 (`.\start-mysql.ps1` or Windows Service).
2. Apply database migrations:
   ```powershell
   npm run db:migrate --workspace=database
   ```
3. Provision operational shards and backfill data:
   ```powershell
   npx tsx backend/src/scripts/provisionShards.ts
   ```
4. Run the automated sharding verification suite:
   ```powershell
   npx tsx backend/src/tests/shardingArchitecture.test.ts
   ```
5. Start backend and frontend development servers:
   ```powershell
   npm run dev
   ```

### Backup & Point-in-Time Recovery
- **Database Snapshot Script**:
  ```powershell
  mysqldump -u root -p --databases bsc_textiles_hrms bsc_shard_bel bsc_shard_dav bsc_shard_shi > backup_shards.sql
  ```
- **Restoration**:
  ```powershell
  mysql -u root -p < backup_shards.sql
  ```

---

## 9. Verification Summary

The architecture has undergone comprehensive automated verification (`31/31 PASSED`):
- All 4 core database shards initialized and registered.
- User identity and persistent database ID mapping verified across all showroom staff.
- 100% location isolation verified: Belagavi (`19 employees`), Davanagere (`10 employees`), Shivamogga (`11 employees`).
- Cross-shard parameter tampering successfully rejected (`403 Forbidden`).
- Atomic transactions and rollbacks verified with 0 dirty rows.
- Multi-shard parallel aggregation executed with zero unhandled exceptions.
