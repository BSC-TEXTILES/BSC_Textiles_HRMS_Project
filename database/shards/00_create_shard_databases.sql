-- BSC Textiles HRMS — Sharded Topology: database provisioning
--
-- The control database (MYSQL_DATABASE, default `bsc_textiles_hrms`) is created
-- automatically by the MySQL entrypoint. This script creates the per-showroom
-- operational shards and grants the application user access to them, so the
-- schema/data provisioning step (npm run provision:hiring-shards and
-- src/scripts/provisionShards.ts) can run from the backend container.
--
-- NOTE: keep the user name below in sync with MYSQL_USER in docker-compose.shards.yml.

CREATE DATABASE IF NOT EXISTS `bsc_shard_bel` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `bsc_shard_dav` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `bsc_shard_shi` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `bsc\_shard\_%`.* TO 'bsc_user'@'%';
FLUSH PRIVILEGES;
