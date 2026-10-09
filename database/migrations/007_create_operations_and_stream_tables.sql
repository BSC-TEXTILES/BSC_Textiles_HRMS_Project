-- ===========================================================================
-- 007: LIVESTREAM, OBSERVATIONS, AND STORE OPERATIONS
-- Observations with threads, live streams, video notes (Prisma-canonical DDL)
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `observation` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observationType` enum('POSITIVE','IMPROVEMENT','CUSTOMER_SERVICE','SALES','GROOMING','PRODUCT_KNOWLEDGE','ATTENDANCE','DISCIPLINE','SELLING_SKILL','STORE_STANDARD','SAFETY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` enum('EXCELLENT','VERY_GOOD','GOOD','NEEDS_IMPROVEMENT','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` int NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actionRequired` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assignedToId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dueDate` datetime(3) DEFAULT NULL,
  `status` enum('OPEN','IN_PROGRESS','RESOLVED','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `videoUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photoUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Observation_employeeId_idx` (`employeeId`),
  KEY `Observation_locationId_idx` (`locationId`),
  KEY `Observation_status_idx` (`status`),
  KEY `Observation_createdAt_idx` (`createdAt`),
  KEY `Observation_floorId_fkey` (`floorId`),
  KEY `Observation_sectionId_fkey` (`sectionId`),
  KEY `Observation_sellingPointId_fkey` (`sellingPointId`),
  KEY `Observation_assignedToId_fkey` (`assignedToId`),
  KEY `Observation_createdById_fkey` (`createdById`),
  CONSTRAINT `Observation_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Observation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Observation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Observation_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Observation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Observation_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `section` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Observation_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `observationreaction` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reactionType` enum('ACKNOWLEDGED','COMPLETED','EXCELLENT','REVIEWING','ATTENTION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ObservationReaction_observationId_userId_reactionType_key` (`observationId`,`userId`,`reactionType`),
  KEY `ObservationReaction_observationId_idx` (`observationId`),
  KEY `ObservationReaction_userId_idx` (`userId`),
  CONSTRAINT `ObservationReaction_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ObservationReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `observationcomment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mentions` json DEFAULT NULL,
  `attachments` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ObservationComment_observationId_idx` (`observationId`),
  KEY `ObservationComment_userId_idx` (`userId`),
  KEY `ObservationComment_parentId_idx` (`parentId`),
  CONSTRAINT `ObservationComment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ObservationComment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `observationcomment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ObservationComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `observationattachment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileUrl` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileSize` int NOT NULL,
  `uploadedById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ObservationAttachment_observationId_idx` (`observationId`),
  KEY `ObservationAttachment_uploadedById_fkey` (`uploadedById`),
  CONSTRAINT `ObservationAttachment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ObservationAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `livestream` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hostId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamUrl` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamKey` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('SCHEDULED','LIVE','PAUSED','ENDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `viewerCount` int NOT NULL DEFAULT '0',
  `startedAt` datetime(3) DEFAULT NULL,
  `endedAt` datetime(3) DEFAULT NULL,
  `scheduledAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `LiveStream_streamKey_key` (`streamKey`),
  KEY `LiveStream_locationId_idx` (`locationId`),
  KEY `LiveStream_status_idx` (`status`),
  KEY `LiveStream_hostId_idx` (`hostId`),
  KEY `LiveStream_floorId_fkey` (`floorId`),
  KEY `LiveStream_sectionId_fkey` (`sectionId`),
  KEY `LiveStream_sellingPointId_fkey` (`sellingPointId`),
  CONSTRAINT `LiveStream_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `section` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `livestreamviewer` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joinedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leftAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `LiveStreamViewer_streamId_userId_key` (`streamId`,`userId`),
  KEY `LiveStreamViewer_streamId_idx` (`streamId`),
  KEY `LiveStreamViewer_userId_idx` (`userId`),
  CONSTRAINT `LiveStreamViewer_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStreamViewer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `livestreammessage` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LiveStreamMessage_streamId_idx` (`streamId`),
  KEY `LiveStreamMessage_userId_idx` (`userId`),
  CONSTRAINT `LiveStreamMessage_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStreamMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `livestreamreaction` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reactionType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LiveStreamReaction_streamId_idx` (`streamId`),
  KEY `LiveStreamReaction_userId_idx` (`userId`),
  CONSTRAINT `LiveStreamReaction_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStreamReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `streamobservation` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestampSeconds` int NOT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `StreamObservation_streamId_idx` (`streamId`),
  KEY `StreamObservation_observationId_idx` (`observationId`),
  KEY `StreamObservation_createdById_fkey` (`createdById`),
  CONSTRAINT `StreamObservation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StreamObservation_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StreamObservation_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `streamtimestamp` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestampSeconds` int NOT NULL,
  `label` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `StreamTimestamp_streamId_idx` (`streamId`),
  KEY `StreamTimestamp_createdById_fkey` (`createdById`),
  CONSTRAINT `StreamTimestamp_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StreamTimestamp_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `videonote` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `videoUrl` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnailUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `recordedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `VideoNote_employeeId_idx` (`employeeId`),
  KEY `VideoNote_locationId_idx` (`locationId`),
  KEY `VideoNote_observationId_idx` (`observationId`),
  KEY `VideoNote_sellingPointId_fkey` (`sellingPointId`),
  CONSTRAINT `VideoNote_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `VideoNote_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `VideoNote_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `VideoNote_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
