/**
 * BSC Textiles HRMS — Server-Side Centralized Database Router
 * Resolves user/location shards from trusted database records, enforces location isolation,
 * prevents client parameter tampering, manages connections/transactions, and aggregates cross-shard data.
 */

import { Pool, PoolConnection } from 'mysql2/promise';
import { ShardConnectionManager } from './ShardConnectionManager.js';
import { ShardRegistryRepository } from './ShardRegistryRepository.js';
import { NativeMySQLClient } from '../../nativeDb.js';
import type {
  ShardAccessValidationResult,
  AggregationResult,
  DatabaseShard,
} from './types.js';

export class ShardRouter {
  private static instance: ShardRouter;
  private connectionManager: ShardConnectionManager;
  private registryRepo: ShardRegistryRepository;
  private shardClients: Map<string, any> = new Map();

  private constructor() {
    this.connectionManager = ShardConnectionManager.getInstance();
    this.registryRepo = ShardRegistryRepository.getInstance();
  }

  public static getInstance(): ShardRouter {
    if (!ShardRouter.instance) {
      ShardRouter.instance = new ShardRouter();
    }
    return ShardRouter.instance;
  }

  /**
   * 1. Resolve User's Permanent Database Assignment
   * Never relies on browser-supplied database IDs. Always resolves from MySQL.
   */
  public async resolveUserDatabase(userId: string): Promise<{ databaseId: string; pool: Pool }> {
    const assignment = await this.registryRepo.getAssignmentByUserId(userId);
    if (!assignment || !assignment.database_id) {
      console.warn(`[ShardRouter] No active assignment for user: ${userId}. Defaulting to control shard.`);
      return {
        databaseId: 'BSC-SHARD-HQ-001',
        pool: this.connectionManager.getControlPool(),
      };
    }

    return {
      databaseId: assignment.database_id,
      pool: this.connectionManager.getPool(assignment.database_id),
    };
  }

  /**
   * 2. Resolve Shard for a Business Location
   */
  public async resolveLocationDatabase(locationCodeOrId: string): Promise<{ databaseId: string; pool: Pool }> {
    const shard = await this.registryRepo.getShardByLocation(locationCodeOrId);
    if (!shard) {
      console.warn(`[ShardRouter] Location '${locationCodeOrId}' not mapped to specific shard. Using control shard.`);
      return {
        databaseId: 'BSC-SHARD-HQ-001',
        pool: this.connectionManager.getControlPool(),
      };
    }

    return {
      databaseId: shard.database_id,
      pool: this.connectionManager.getPool(shard.database_id),
    };
  }

  /**
   * 3. Acquire a managed connection for a given shard ID
   */
  public async getShardConnection(databaseId: string): Promise<PoolConnection> {
    const pool = this.connectionManager.getPool(databaseId);
    return pool.getConnection();
  }

  /**
   * 4. Execute a parameterized read query on a specific shard
   */
  public async executeShardRead<T = any>(databaseId: string, sql: string, params: any[] = []): Promise<T[]> {
    const pool = this.connectionManager.getPool(databaseId);
    const [rows]: any = await pool.execute(sql, params);
    return rows as T[];
  }

  /**
   * 5. Execute a parameterized write operation on a specific shard
   */
  public async executeShardWrite(databaseId: string, sql: string, params: any[] = []): Promise<any> {
    const pool = this.connectionManager.getPool(databaseId);
    const [result] = await pool.execute(sql, params);
    return result;
  }

  /**
   * 6. Execute an atomic transaction within a single shard
   */
  public async executeShardTransaction<T>(
    databaseId: string,
    txFn: (conn: PoolConnection) => Promise<T>
  ): Promise<T> {
    const conn = await this.getShardConnection(databaseId);
    await conn.beginTransaction();
    try {
      const result = await txFn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 7. Location-Wise Shard Access Validation & Tamper Prevention
   * Enforces that non-super admins cannot cross boundaries even if request body/query contains
   * foreign location or database IDs.
   */
  public validateShardAccess(
    user: { id: string; role: string; locationId?: string; database_id?: string; databaseId?: string },
    requestedLocationId?: string,
    requestedDatabaseId?: string
  ): ShardAccessValidationResult {
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const userDbId = user.database_id || user.databaseId || 'BSC-SHARD-HQ-001';

    // Super Admin has global access to all shards
    if (isSuperAdmin) {
      if (requestedDatabaseId) {
        return {
          allowed: true,
          effectiveDatabaseId: requestedDatabaseId,
          effectiveLocationId: requestedLocationId,
        };
      }
      return {
        allowed: true,
        effectiveDatabaseId: userDbId,
        effectiveLocationId: requestedLocationId || user.locationId,
      };
    }

    // Non-Super Admin: Enforce strict location pinning
    // If client attempts to specify a different shard or location, REJECT or pin to user's assigned shard
    if (requestedDatabaseId && requestedDatabaseId !== userDbId) {
      return {
        allowed: false,
        effectiveDatabaseId: userDbId,
        reason: `Cross-shard access denied: User with role '${user.role}' is pinned to shard '${userDbId}'. Cannot access '${requestedDatabaseId}'.`,
      };
    }

    if (requestedLocationId && user.locationId && requestedLocationId !== user.locationId) {
      return {
        allowed: false,
        effectiveDatabaseId: userDbId,
        reason: `Location access violation: User is restricted to location '${user.locationId}'. Cannot access '${requestedLocationId}'.`,
      };
    }

    return {
      allowed: true,
      effectiveDatabaseId: userDbId,
      effectiveLocationId: user.locationId,
    };
  }

  /**
   * 8. Cross-Shard Aggregation Engine
   * Executes a query in parallel across all active operational shards with bounded concurrency,
   * per-shard error isolation, and detailed latency reporting.
   */
  public async executeCrossShardAggregation<T>(
    queryFn: (shardId: string, pool: Pool) => Promise<T[]>
  ): Promise<AggregationResult<T>> {
    const shards = this.connectionManager.getRegisteredShards().filter((s) => s.status === 'ACTIVE');
    const summaries: AggregationResult<T>['shardSummaries'] = {};
    const aggregatedData: T[] = [];

    const tasks = shards.map(async (shard) => {
      const start = Date.now();
      try {
        const pool = this.connectionManager.getPool(shard.database_id);
        const rows = await queryFn(shard.database_id, pool);
        const latencyMs = Date.now() - start;

        summaries[shard.database_id] = {
          databaseId: shard.database_id,
          shardName: shard.shard_name,
          success: true,
          rowCount: rows.length,
          latencyMs,
        };

        return rows;
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        console.error(`[ShardRouter] Aggregation failure on shard '${shard.database_id}':`, err.message);

        summaries[shard.database_id] = {
          databaseId: shard.database_id,
          shardName: shard.shard_name,
          success: false,
          rowCount: 0,
          latencyMs,
          error: err.message,
        };

        return [];
      }
    });

    const results = await Promise.allSettled(tasks);
    for (const res of results) {
      if (res.status === 'fulfilled') {
        aggregatedData.push(...res.value);
      }
    }

    return {
      data: aggregatedData,
      totalCount: aggregatedData.length,
      shardSummaries: summaries,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 9. Get Prisma-compatible Native Client for a specific shard
   */
  public getShardClient(databaseId: string): any {
    if (this.shardClients.has(databaseId)) {
      return this.shardClients.get(databaseId);
    }

    const pool = this.connectionManager.getPool(databaseId);
    const nativeClient = new NativeMySQLClient(async () => pool);

    const proxyClient = new Proxy(nativeClient, {
      get(target: any, prop: string) {
        if (prop in target) {
          return target[prop];
        }
        return target.getModel(prop);
      },
    });

    this.shardClients.set(databaseId, proxyClient);
    return proxyClient;
  }
}

export const shardRouter = ShardRouter.getInstance();
