-- ===========================================================================
-- 047: employee custody assets (My Desk floor shortcuts)
-- ===========================================================================
-- `backend/src/routes/myDesk.ts` reads and updates this table, but until now it
-- was only created by `backend/src/scripts/setupCustodyAssets.ts` — a manual
-- script that is not part of `db:migrate`. A fresh deployment therefore had a
-- My Desk summary that failed with ER_NO_SUCH_TABLE. The table belongs in the
-- migration chain like every other schema object.
--
-- No rows are seeded here: custody items are operational data issued per
-- employee, not reference data. `CREATE TABLE IF NOT EXISTS` keeps the
-- migration safe for databases where the manual script already ran.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS `employee_custody_assets` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assetType` enum('HANDHELD_SCANNER','STAFF_LOCKER','RFID_SECURITY_CARD','POS_TERMINAL','OTHER')
    COLLATE utf8mb4_unicode_ci DEFAULT 'OTHER',
  `serialNumber` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NULL,
  `status` enum('ASSIGNED','ACKNOWLEDGED','RETURN_REQUESTED','RETURNED')
    COLLATE utf8mb4_unicode_ci DEFAULT 'ASSIGNED',
  `issuedAt` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `acknowledgedAt` datetime(3) NULL,
  `returnedAt` datetime(3) NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci NULL,
  `createdAt` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_emp` (`employeeId`),
  KEY `idx_custody_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===========================================================================
-- ROLLBACK
--   DROP TABLE IF EXISTS `employee_custody_assets`;
-- ===========================================================================
