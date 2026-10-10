CREATE TABLE `notification_preferences` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channels` json NOT NULL COMMENT '{"inApp":true,"email":true,"browserPush":false,"realtime":true}',
  `categories` json NOT NULL COMMENT 'Per-category channel preferences',
  `quietHours` json DEFAULT NULL COMMENT '{"enabled":true,"start":"22:00","end":"07:00","timezone":"Asia/Kolkata"}',
  `digestMode` json DEFAULT NULL COMMENT '{"enabled":false,"frequency":"daily","time":"08:00"}',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `NotificationPreferences_userId_key` (`userId`),
  CONSTRAINT `NotificationPreferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notification_delivery_log` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notificationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel` enum('IN_APP','EMAIL','PUSH','REALTIME') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','SENT','DELIVERED','FAILED','BOUNCED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `attempt` int NOT NULL DEFAULT '1',
  `error` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sentAt` datetime(3) DEFAULT NULL,
  `deliveredAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `NotificationDeliveryLog_notificationId_idx` (`notificationId`),
  KEY `NotificationDeliveryLog_channel_status_idx` (`channel`,`status`),
  CONSTRAINT `NotificationDeliveryLog_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notification` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notification_policy` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `eventId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `defaultSeverity` enum('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `defaultChannels` json NOT NULL COMMENT '["inApp","realtime"]',
  `mandatoryChannels` json NOT NULL COMMENT '["inApp"]',
  `recipientRoles` json NOT NULL COMMENT '["HR_MANAGER","SUPER_ADMIN"]',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `deduplicationWindowMinutes` int NOT NULL DEFAULT '60',
  `aggregationRule` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `NotificationPolicy_eventId_key` (`eventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;