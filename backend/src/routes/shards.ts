/**
 * BSC Textiles HRMS — Database Shards Administration API
 * Provides authorized endpoints for inspecting database shards, health monitoring,
 * user-to-shard mapping management, and audited reassignments.
 */

import { Router, Response } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import {
  shardManager,
  shardRegistry,
  shardRouter,
  shardMigrationService,
  ShardStatus,
} from '../core/sharding/index.js';

export const shardsRouter = Router();

// Protect all shard administrative endpoints
shardsRouter.use(requireAuth);

/**
 * 1. GET /api/v1/shards
 * List all registered database shards with health status and metrics
 */
shardsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const shards = await shardRegistry.getAllShards();

    // If not super admin, filter only the user's assigned shard
    const visibleShards = isSuperAdmin
      ? shards
      : shards.filter((s) => s.database_id === (req.user?.locationId ? `BSC-SHARD-${req.user.locationId}-001` : 'BSC-SHARD-HQ-001'));

    return res.json({
      success: true,
      count: visibleShards.length,
      shards: visibleShards,
    });
  } catch (err: any) {
    console.error('[shardsRouter] Failed to fetch shards:', err);
    return res.status(500).json({ error: 'Failed to retrieve database shards', message: err.message });
  }
});

/**
 * 2. GET /api/v1/shards/health
 * Real-time health ping across all configured shards
 */
shardsRouter.get('/health', async (req: AuthRequest, res: Response) => {
  try {
    const reports = await shardManager.checkAllShardsHealth();
    const allHealthy = reports.every((r) => r.healthStatus === 'HEALTHY');

    return res.json({
      success: true,
      overallStatus: allHealthy ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      reports,
    });
  } catch (err: any) {
    console.error('[shardsRouter] Health check failure:', err);
    return res.status(500).json({ error: 'Health check failed', message: err.message });
  }
});

/**
 * 3. GET /api/v1/shards/assignments
 * Paginated list of user database assignments with filters
 */
shardsRouter.get('/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const locationId = isSuperAdmin ? (req.query.locationId as string) : req.user?.locationId;
    const databaseId = isSuperAdmin ? (req.query.databaseId as string) : undefined;
    const search = req.query.search as string;

    const result = await shardRegistry.listAssignments({
      page,
      limit,
      locationId,
      databaseId,
      search,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[shardsRouter] Failed to list assignments:', err);
    return res.status(500).json({ error: 'Failed to retrieve user assignments', message: err.message });
  }
});

/**
 * 4. POST /api/v1/shards/assignments/reassign
 * Reassign a user to a different database shard (Super Admin only)
 */
shardsRouter.post(
  '/assignments/reassign',
  requireRole('SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId, targetDatabaseId, targetLocationId, reason } = req.body;

      if (!userId || !targetDatabaseId) {
        return res.status(400).json({ error: 'Missing required fields: userId and targetDatabaseId are mandatory.' });
      }

      const result = await shardMigrationService.reassignUser({
        userId,
        targetDatabaseId,
        targetLocationId,
        requestedBy: req.user!.id,
        reason: reason || 'Administrative reallocation',
      });

      return res.json(result);
    } catch (err: any) {
      console.error('[shardsRouter] User reassignment failed:', err);
      return res.status(400).json({ error: 'User reassignment failed', message: err.message });
    }
  }
);

/**
 * 5. PUT /api/v1/shards/:id/status
 * Change administrative status of a shard (ACTIVE, READ_ONLY, MAINTENANCE) (Super Admin only)
 */
shardsRouter.put(
  '/:id/status',
  requireRole('SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses: ShardStatus[] = ['ACTIVE', 'READ_ONLY', 'MAINTENANCE', 'OFFLINE'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await shardRegistry.updateShardStatus(id, status);
      if (!updated) {
        return res.status(404).json({ error: `Shard with ID '${id}' not found.` });
      }

      return res.json({
        success: true,
        message: `Shard '${id}' status updated to ${status}.`,
        databaseId: id,
        status,
      });
    } catch (err: any) {
      console.error('[shardsRouter] Failed to update shard status:', err);
      return res.status(500).json({ error: 'Failed to update shard status', message: err.message });
    }
  }
);

/**
 * 6. GET /api/v1/shards/migrations
 * Audit history of shard migrations and cross-shard transfers
 */
shardsRouter.get('/migrations', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 25;
    const migrations = await shardRegistry.listMigrations(limit);
    return res.json({
      success: true,
      count: migrations.length,
      migrations,
    });
  } catch (err: any) {
    console.error('[shardsRouter] Failed to fetch migration history:', err);
    return res.status(500).json({ error: 'Failed to retrieve migration logs', message: err.message });
  }
});

export default shardsRouter;
