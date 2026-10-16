/**
 * BSC Textiles HRMS — Server-Side Secure Shard Connection Manager
 * Manages dedicated, bounded MySQL 8.0 connection pools for the central metadata shard
 * and all operational showroom shards. Handles connection acquisition timeouts, pool sizing,
 * ping health-checking, latency metrics, and safe shutdown.
 */

import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import type { DatabaseShard, ShardHealthReport, ShardHealthStatus, ShardStatus } from './types.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export class ShardConnectionManager {
  private static instance: ShardConnectionManager;
  private pools: Map<string, Pool> = new Map();
  private shardConfigs: Map<string, DatabaseShard> = new Map();
  private controlDatabaseId: string = 'BSC-SHARD-HQ-001';
  private isInitialized: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): ShardConnectionManager {
    if (!ShardConnectionManager.instance) {
      ShardConnectionManager.instance = new ShardConnectionManager();
    }
    return ShardConnectionManager.instance;
  }

  /**
   * Initialize shard pools from the central registry
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('[ShardConnectionManager] Initializing Multi-Tenant Shard Connections...');
    
    // 1. Establish control database pool first
    const controlPool = this.createPoolForDatabase(
      process.env.DATABASE_URL_HQ || process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms',
      'bsc_textiles_hrms'
    );
    this.pools.set(this.controlDatabaseId, controlPool);

    // 2. Fetch registered shards from control database
    try {
      const [rows]: any = await controlPool.query(
        'SELECT * FROM `database_shards` ORDER BY is_control_shard DESC, database_id ASC'
      );

      for (const shard of rows as DatabaseShard[]) {
        this.shardConfigs.set(shard.database_id, shard);

        if (shard.database_id === this.controlDatabaseId) {
          continue; // Already registered
        }

        // Resolve connection string from env secret_reference or base database URL
        const connString = this.resolveShardUri(shard);
        const shardPool = this.createPoolForDatabase(connString, shard.database_name);
        this.pools.set(shard.database_id, shardPool);

        console.log(
          `[ShardConnectionManager] Registered Pool for Shard: ${shard.database_id} (${shard.database_name}) [Status: ${shard.status}]`
        );
      }

      this.isInitialized = true;
      console.log(`[ShardConnectionManager] Successfully initialized ${this.pools.size} active shard connection pools.`);

      // Perform initial health check
      await this.checkAllShardsHealth();

      // Schedule periodic background health checks every 60 seconds
      this.healthCheckInterval = setInterval(() => {
        this.checkAllShardsHealth().catch((err) => {
          console.warn('[ShardConnectionManager] Periodic health check warning:', err.message);
        });
      }, 60000);
      if (this.healthCheckInterval.unref) {
        this.healthCheckInterval.unref();
      }
    } catch (err: any) {
      console.error('[ShardConnectionManager] Failed to load shard registry:', err.message);
      // Fallback: Ensure control pool is at least accessible
      this.isInitialized = true;
    }
  }

  /**
   * Resolves connection URI for a shard securely without exposing secrets
   */
  private resolveShardUri(shard: DatabaseShard): string {
    const envKey = shard.secret_reference || `DATABASE_URL_${shard.location_code || 'SHARD'}`;
    if (process.env[envKey]) {
      return process.env[envKey] as string;
    }

    const baseUri = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';
    try {
      const url = new URL(baseUri.startsWith('mysql://') ? baseUri : `mysql://${baseUri}`);
      url.pathname = `/${shard.database_name}`;
      return url.toString();
    } catch {
      return `mysql://root@localhost:3306/${shard.database_name}`;
    }
  }

  /**
   * Creates a dedicated MySQL2 pool for a specific database
   */
  private createPoolForDatabase(uri: string, databaseName: string): Pool {
    return mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 20,
      maxIdle: 8,
      idleTimeout: 30000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      decimalNumbers: true,
      dateStrings: false,
      timezone: '+05:30',
      multipleStatements: true,
    });
  }

  /**
   * Get connection pool for a specific shard ID
   */
  public getPool(databaseId: string): Pool {
    const pool = this.pools.get(databaseId);
    if (!pool) {
      // Fallback to control database if not found, with explicit warning
      console.warn(`[ShardConnectionManager] Shard pool '${databaseId}' not found. Falling back to control shard.`);
      const controlPool = this.pools.get(this.controlDatabaseId);
      if (!controlPool) {
        throw new Error(`Database shard '${databaseId}' not found and control shard is unavailable.`);
      }
      return controlPool;
    }
    return pool;
  }

  /**
   * Get control database pool
   */
  public getControlPool(): Pool {
    return this.getPool(this.controlDatabaseId);
  }

  /**
   * Check health of a single shard
   */
  public async checkShardHealth(databaseId: string): Promise<ShardHealthReport> {
    const pool = this.pools.get(databaseId);
    const config = this.shardConfigs.get(databaseId);

    const defaultReport: ShardHealthReport = {
      databaseId,
      shardName: config?.shard_name || databaseId,
      locationCode: config?.location_code || null,
      databaseName: config?.database_name || 'unknown',
      status: (config?.status as ShardStatus) || 'ACTIVE',
      healthStatus: 'UNKNOWN',
      latencyMs: 9999,
      isControl: Boolean(config?.is_control_shard),
      isWritable: Boolean(config?.is_writable ?? true),
      isReadable: Boolean(config?.is_readable ?? true),
      totalUsers: config?.total_users || 0,
      totalEmployees: config?.total_employees || 0,
      activeConnections: 0,
      lastCheck: new Date().toISOString(),
    };

    if (!pool) {
      defaultReport.healthStatus = 'DOWN';
      defaultReport.errorMessage = 'Connection pool not initialized';
      return defaultReport;
    }

    const startTime = Date.now();
    try {
      const conn: PoolConnection = await pool.getConnection();
      try {
        await conn.ping();
        const latencyMs = Date.now() - startTime;

        // Count employees in this shard
        let empCount = 0;
        try {
          const [empRows]: any = await conn.query('SELECT COUNT(*) as count FROM `employee`');
          empCount = Number(empRows[0]?.count || 0);
        } catch {
          // Table might not exist or control shard
        }

        defaultReport.latencyMs = latencyMs;
        defaultReport.healthStatus = latencyMs < 200 ? 'HEALTHY' : 'DEGRADED';
        defaultReport.totalEmployees = empCount || defaultReport.totalEmployees;

        // Update control database shard record
        const controlPool = this.pools.get(this.controlDatabaseId);
        if (controlPool) {
          await controlPool.query(
            `UPDATE database_shards 
             SET latency_ms = ?, health_status = ?, last_health_check_at = CURRENT_TIMESTAMP(3)
             WHERE database_id = ?`,
            [latencyMs, defaultReport.healthStatus, databaseId]
          );
        }

        return defaultReport;
      } finally {
        conn.release();
      }
    } catch (err: any) {
      defaultReport.healthStatus = 'DOWN';
      defaultReport.latencyMs = Date.now() - startTime;
      defaultReport.errorMessage = err.message;

      // Update control DB
      const controlPool = this.pools.get(this.controlDatabaseId);
      if (controlPool) {
        await controlPool.query(
          `UPDATE database_shards 
           SET health_status = 'DOWN', last_health_check_at = CURRENT_TIMESTAMP(3)
           WHERE database_id = ?`,
          [databaseId]
        );
      }

      return defaultReport;
    }
  }

  /**
   * Check health of all registered shards in parallel
   */
  public async checkAllShardsHealth(): Promise<ShardHealthReport[]> {
    const shardIds = Array.from(this.pools.keys());
    const reports = await Promise.all(shardIds.map((id) => this.checkShardHealth(id)));
    return reports;
  }

  /**
   * Return all registered shard configurations
   */
  public getRegisteredShards(): DatabaseShard[] {
    return Array.from(this.shardConfigs.values());
  }

  /**
   * Refresh shard configurations from database
   */
  public async refreshRegistry(): Promise<void> {
    const controlPool = this.getControlPool();
    const [rows]: any = await controlPool.query(
      'SELECT * FROM `database_shards` ORDER BY is_control_shard DESC, database_id ASC'
    );
    this.shardConfigs.clear();
    for (const shard of rows as DatabaseShard[]) {
      this.shardConfigs.set(shard.database_id, shard);
      if (!this.pools.has(shard.database_id)) {
        const connString = this.resolveShardUri(shard);
        const pool = this.createPoolForDatabase(connString, shard.database_name);
        this.pools.set(shard.database_id, pool);
      }
    }
  }

  /**
   * Graceful shutdown of all connection pools
   */
  public async shutdown(): Promise<void> {
    console.log('[ShardConnectionManager] Closing all shard connection pools gracefully...');
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const closePromises = Array.from(this.pools.entries()).map(async ([id, pool]) => {
      try {
        await pool.end();
        console.log(`[ShardConnectionManager] Pool closed for shard: ${id}`);
      } catch (err: any) {
        console.warn(`[ShardConnectionManager] Error closing pool for shard ${id}:`, err.message);
      }
    });

    await Promise.allSettled(closePromises);
    this.pools.clear();
    this.shardConfigs.clear();
    this.isInitialized = false;
    console.log('[ShardConnectionManager] All shard connections terminated cleanly.');
  }
}

export const shardManager = ShardConnectionManager.getInstance();
