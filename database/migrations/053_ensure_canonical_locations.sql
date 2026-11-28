-- ===========================================================================
-- 053: ENSURE CANONICAL SHOWROOM LOCATIONS, FLOORS, AND DEPARTMENTS
-- Guarantees BEL, DAV, SHI showrooms always exist in the production database
-- so foreign keys (Employee_locationId_fkey, etc.) never fail.
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Canonical Showrooms: Belagavi (BEL), Davanagere (DAV), Shivamogga (SHI)
INSERT INTO `location` (`id`, `code`, `name`, `address`, `city`, `state`, `pin`, `phone`, `email`, `status`, `createdAt`, `updatedAt`)
VALUES
  ('cmuzam5fe00014n4pq25hkcww', 'BEL', 'Belagavi Head Store', 'Khade Bazar, Belagavi', 'Belagavi', 'Karnataka', '590001', '0831-2400100', 'belagavi@bsctextiles.com', 'ACTIVE', NOW(3), NOW(3)),
  ('cmuzam5fr00024n4p4izbomev', 'DAV', 'Davanagere Mega Store', 'P.B. Road, Davanagere', 'Davanagere', 'Karnataka', '577001', '08192-250100', 'davanagere@bsctextiles.com', 'ACTIVE', NOW(3), NOW(3)),
  ('cmuzam5g400034n4p89o33l8e', 'SHI', 'Shivamogga Flagship', 'B.H. Road, Shivamogga', 'Shivamogga', 'Karnataka', '577201', '08182-270100', 'shivamogga@bsctextiles.com', 'ACTIVE', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `status` = 'ACTIVE',
  `updatedAt` = NOW(3);

-- 2. Default Ground Floors for each Showroom
INSERT INTO `floor` (`id`, `name`, `floorNumber`, `locationId`, `status`, `createdAt`, `updatedAt`)
VALUES
  ('cmuzam5ia000e4n4powtzmu78', 'Ground Floor', 0, 'cmuzam5fe00014n4pq25hkcww', 'ACTIVE', NOW(3), NOW(3)),
  ('cmuzam5jp000m4n4p99oh4jy1', 'Ground Floor', 0, 'cmuzam5fr00024n4p4izbomev', 'ACTIVE', NOW(3), NOW(3)),
  ('cmuzam5l2000u4n4pshxdhfny', 'Ground Floor', 0, 'cmuzam5g400034n4p89o33l8e', 'ACTIVE', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `status` = 'ACTIVE',
  `updatedAt` = NOW(3);

-- 3. Core Departments for Belagavi (BEL)
INSERT INTO `department` (`id`, `name`, `code`, `locationId`, `createdAt`, `updatedAt`)
VALUES
  ('cmuzam5nr001a4n4plprevjz0', 'Sales & Retail', 'SALES', 'cmuzam5fe00014n4pq25hkcww', NOW(3), NOW(3)),
  ('cmuzam5o4001c4n4pisdzjge6', 'Store Operations', 'OPS', 'cmuzam5fe00014n4pq25hkcww', NOW(3), NOW(3)),
  ('cmuzam5og001e4n4p95zq5mk4', 'Human Resources', 'HR', 'cmuzam5fe00014n4pq25hkcww', NOW(3), NOW(3)),
  ('cmuzam5os001g4n4pxt2of7lb', 'Finance & Accounts', 'FIN', 'cmuzam5fe00014n4pq25hkcww', NOW(3), NOW(3)),
  ('cmuzam5p4001i4n4p3y63uvpd', 'Inventory & Logistics', 'INV', 'cmuzam5fe00014n4pq25hkcww', NOW(3), NOW(3)),
  ('cmuzam5pg001k4n4pal5r7qej', 'Customer Service & Billing', 'CS', 'cmuzam5fe00014n4pq25hkcww', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `updatedAt` = NOW(3);

-- 4. Core Departments for Davanagere (DAV)
INSERT INTO `department` (`id`, `name`, `code`, `locationId`, `createdAt`, `updatedAt`)
VALUES
  ('cmuzam5pv001m4n4pqvaal86w', 'Sales & Retail', 'SALES', 'cmuzam5fr00024n4p4izbomev', NOW(3), NOW(3)),
  ('cmuzam5qk001o4n4p16x3h527', 'Store Operations', 'OPS', 'cmuzam5fr00024n4p4izbomev', NOW(3), NOW(3)),
  ('cmuzam5rt001q4n4puxdb5h0f', 'Human Resources', 'HR', 'cmuzam5fr00024n4p4izbomev', NOW(3), NOW(3)),
  ('cmuzam5ss001s4n4p95lru428', 'Finance & Accounts', 'FIN', 'cmuzam5fr00024n4p4izbomev', NOW(3), NOW(3)),
  ('cmuzam5u8001u4n4piqdrfwye', 'Inventory & Logistics', 'INV', 'cmuzam5fr00024n4p4izbomev', NOW(3), NOW(3)),
  ('cmuzam5v3001w4n4p1oiiuf6m', 'Customer Service & Billing', 'CS', 'cmuzam5fr00024n4p4izbomev', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `updatedAt` = NOW(3);

-- 5. Core Departments for Shivamogga (SHI)
INSERT INTO `department` (`id`, `name`, `code`, `locationId`, `createdAt`, `updatedAt`)
VALUES
  ('cmuzam5w5001y4n4p5lr98aq3', 'Sales & Retail', 'SALES', 'cmuzam5g400034n4p89o33l8e', NOW(3), NOW(3)),
  ('cmuzam5wk00204n4psff9160q', 'Store Operations', 'OPS', 'cmuzam5g400034n4p89o33l8e', NOW(3), NOW(3)),
  ('cmuzam5wv00224n4pndk6339d', 'Human Resources', 'HR', 'cmuzam5g400034n4p89o33l8e', NOW(3), NOW(3)),
  ('cmuzam5x800244n4p4i1j0a81', 'Finance & Accounts', 'FIN', 'cmuzam5g400034n4p89o33l8e', NOW(3), NOW(3)),
  ('cmuzam5xk00264n4phmviih30', 'Inventory & Logistics', 'INV', 'cmuzam5g400034n4p89o33l8e', NOW(3), NOW(3)),
  ('cmuzam5xv00284n4p57361r4h', 'Customer Service & Billing', 'CS', 'cmuzam5g400034n4p89o33l8e', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `updatedAt` = NOW(3);

-- 6. Canonical Shifts for each Showroom
INSERT INTO `shift` (`id`, `name`, `code`, `locationId`, `startTime`, `endTime`, `gracePeriod`, `lateThreshold`, `status`, `createdAt`, `updatedAt`)
VALUES
  ('shift-gen-bel', 'General Shift', 'GENERAL', 'cmuzam5fe00014n4pq25hkcww', '2024-01-01 09:30:00.000', '2024-01-01 19:30:00.000', 15, 30, 'ACTIVE', NOW(3), NOW(3)),
  ('shift-gen-dav', 'General Shift', 'GENERAL', 'cmuzam5fr00024n4p4izbomev', '2024-01-01 09:30:00.000', '2024-01-01 19:30:00.000', 15, 30, 'ACTIVE', NOW(3), NOW(3)),
  ('shift-gen-shi', 'General Shift', 'GENERAL', 'cmuzam5g400034n4p89o33l8e', '2024-01-01 09:30:00.000', '2024-01-01 19:30:00.000', 15, 30, 'ACTIVE', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `status` = 'ACTIVE',
  `updatedAt` = NOW(3);

SET FOREIGN_KEY_CHECKS = 1;
