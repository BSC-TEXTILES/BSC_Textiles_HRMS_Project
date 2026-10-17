-- ===========================================================================
-- 037_hiring_shard_registry_reconcile.sql
-- ===========================================================================
-- The database_shards registry was seeded (migration 017 / provisioning run)
-- with location ids that predate the current location rows. Shard resolution
-- (ShardRouter.resolveLocationDatabase) matches registry.location_id against
-- location.id first, so stale ids silently fall back to the HQ shard and break
-- location isolation for hiring data.
--
-- This reconciles registry rows against the authoritative `location` table by
-- location_code. Idempotent: rows already correct are untouched.
-- ===========================================================================

UPDATE `database_shards` ds
JOIN `location` l ON l.`code` = ds.`location_code`
SET ds.`location_id` = l.`id`,
    ds.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE ds.`location_id` IS NULL
   OR ds.`location_id` <> l.`id`;
