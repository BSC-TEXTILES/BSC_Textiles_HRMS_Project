-- ===========================================================================
-- 021: USER ORGANIZATION LOCATION SCOPES
--
-- Gives an account an explicit, backend-enforced list of authorized store
-- locations. `user.locationId` stays the primary location (it drives every
-- legacy module), this table carries any additional authorized locations so
-- the organization module never grants blanket access by accident.
--
--   * no rows + NULL user.locationId  -> unrestricted (explicitly authorized)
--   * no rows + set user.locationId   -> that single location only
--   * rows present                    -> primary location + these locations
-- ===========================================================================

CREATE TABLE IF NOT EXISTS `userorgscope` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `locationId` varchar(191) NOT NULL,
  `grantedById` varchar(191) DEFAULT NULL,
  `changeRequestId` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UserOrgScope_userId_locationId_key` (`userId`, `locationId`),
  KEY `UserOrgScope_locationId_idx` (`locationId`),
  KEY `UserOrgScope_changeRequestId_idx` (`changeRequestId`),
  CONSTRAINT `UserOrgScope_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserOrgScope_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserOrgScope_changeRequestId_fkey` FOREIGN KEY (`changeRequestId`) REFERENCES `orgchangerequest` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed every location-bound account with its own primary location so scope
-- resolution is explicit rather than inferred (idempotent).
INSERT IGNORE INTO `userorgscope` (`id`, `userId`, `locationId`, `grantedById`)
SELECT CONCAT('uos_', SUBSTRING(MD5(CONCAT(u.id, '-', l.id)), 1, 24)),
       u.id,
       l.id,
       NULL
  FROM `user` u
  JOIN `location` l ON l.id = u.locationId
 WHERE u.locationId IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM `userorgscope` s WHERE s.userId = u.id AND s.locationId = l.id
       );

-- ROLLBACK (manual):
-- DROP TABLE IF EXISTS `userorgscope`;
