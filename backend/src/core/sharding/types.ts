/**
 * BSC Textiles HRMS — Database Sharding Architecture Types
 */

import type { Pool, PoolConnection } from 'mysql2/promise';

export type ShardStatus = 'ACTIVE' | 'READ_ONLY' | 'MAINTENANCE' | 'OFFLINE';
export type ShardHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export type AssignmentStatus = 'ACTIVE' | 'MIGRATING' | 'REVOKED';
export type AssignmentType = 'LOCATION_DEFAULT' | 'EXPLICIT_OVERRIDE' | 'CROSS_SHARD_ADMIN';

export type MigrationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';

export interface DatabaseShard {
  database_id: string;
  shard_name: string;
  location_code: string | null;
  location_id: string | null;
  database_name: string;
  secret_reference: string;
  is_control_shard: boolean | number;
  is_writable: boolean | number;
  is_readable: boolean | number;
  status: ShardStatus;
  health_status: ShardHealthStatus;
  last_health_check_at: Date | string | null;
  latency_ms: number;
  schema_version: string;
  active_connections: number;
  total_users: number;
  total_employees: number;
  notes?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface UserDatabaseAssignment {
  id: string;
  user_id: string;
  employee_id: string | null;
  location_id: string | null;
  database_id: string;
  status: AssignmentStatus;
  assignment_type: AssignmentType;
  assigned_by: string | null;
  assigned_at: Date | string;
  updated_at: Date | string;
  // Joined fields
  fullName?: string;
  email?: string;
  role?: string;
  shard_name?: string;
  location_name?: string;
}

export interface ShardMigrationRecord {
  id: string;
  migration_name: string;
  shard_id: string;
  batch_id: string;
  status: MigrationStatus;
  records_migrated: number;
  details?: any;
  error_message?: string | null;
  started_at: Date | string;
  completed_at?: Date | string | null;
}

export interface ShardHealthReport {
  databaseId: string;
  shardName: string;
  locationCode: string | null;
  databaseName: string;
  status: ShardStatus;
  healthStatus: ShardHealthStatus;
  latencyMs: number;
  isControl: boolean;
  isWritable: boolean;
  isReadable: boolean;
  totalUsers: number;
  totalEmployees: number;
  activeConnections: number;
  lastCheck: string;
  errorMessage?: string;
}

export interface ShardContext {
  userId: string;
  userRole: string;
  userLocationId?: string;
  databaseId: string;
  isSuperAdmin: boolean;
}

export interface ShardAccessValidationResult {
  allowed: boolean;
  effectiveDatabaseId: string;
  effectiveLocationId?: string;
  reason?: string;
}

export interface AggregationResult<T> {
  data: T[];
  totalCount: number;
  shardSummaries: Record<
    string,
    {
      databaseId: string;
      shardName: string;
      success: boolean;
      rowCount: number;
      latencyMs: number;
      error?: string;
    }
  >;
  timestamp: string;
}
