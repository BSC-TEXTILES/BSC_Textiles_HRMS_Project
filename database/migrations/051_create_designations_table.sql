-- ===========================================================================
-- 051: CREATE DESIGNATIONS TABLE
-- Designation master data with employee mapping support
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `designations` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `grade` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `band` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `minSalary` decimal(15,2) NOT NULL DEFAULT 0.00,
  `maxSalary` decimal(15,2) NOT NULL DEFAULT 0.00,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `icon` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT 'badge',
  `department` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aliases` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Designations_isActive_idx` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed with common BSC Textiles designations
INSERT INTO `designations` (`id`, `title`, `code`, `grade`, `band`, `minSalary`, `maxSalary`, `description`, `icon`, `department`, `aliases`, `isActive`, `createdAt`, `updatedAt`) VALUES
('desig_sales_emp', 'Sales Employee', 'SE', 'G1', '₹16K – ₹25K', 16000, 25000, 'Frontline retail sales associate', 'shopping-bag', 'Retail Operations', 'sales employee,sales associate,retail sales', 1, NOW(3), NOW(3)),
('desig_floor_mgr', 'Floor Manager', 'FM', 'G3', '₹30K – ₹45K', 30000, 45000, 'Manages floor operations and team', 'users', 'Store Operations', 'floor manager,floor supervisor', 1, NOW(3), NOW(3)),
('desig_hr_exec', 'HR Executive', 'HRE', 'G2', '₹25K – ₹35K', 25000, 35000, 'Handles HR operations and employee relations', 'briefcase', 'Human Resources', 'hr executive,human resources executive', 1, NOW(3), NOW(3)),
('desig_hr_mgr', 'HR Manager', 'HRM', 'G4', '₹45K – ₹65K', 45000, 65000, 'Manages HR department and policies', 'users', 'Human Resources', 'hr manager,human resources manager', 1, NOW(3), NOW(3)),
('desig_tea_mgr', 'Tea Break Manager', 'TBM', 'G2', '₹22K – ₹30K', 22000, 30000, 'Manages break schedules and compliance', 'coffee', 'Store Operations', 'tea break manager,break manager', 1, NOW(3), NOW(3)),
('desig_team_lead', 'Team Lead', 'TL', 'G2', '₹28K – ₹38K', 28000, 38000, 'Leads a team of sales employees', 'users', 'Retail Operations', 'team lead,shift lead', 1, NOW(3), NOW(3)),
('desig_payroll_mgr', 'Payroll Manager', 'PM', 'G4', '₹50K – ₹70K', 50000, 70000, 'Manages payroll processing and compliance', 'calculator', 'Finance', 'payroll manager,payroll specialist', 1, NOW(3), NOW(3)),
('desig_location_mgr', 'Location Manager', 'LM', 'G5', '₹60K – ₹90K', 60000, 90000, 'Manages entire store location operations', 'map-pin', 'Store Operations', 'location manager,store manager,shop manager', 1, NOW(3), NOW(3)),
('desig_t_shop_owner', 'T-Shop Owner', 'TSO', 'G3', '₹35K – ₹50K', 35000, 50000, 'Owns and operates a T-Shop franchise', 'store', 'Franchise', 't shop owner,t-shop owner,franchise owner', 1, NOW(3), NOW(3)),
('desig_hr_auditor', 'HR Auditor', 'HRA', 'G3', '₹35K – ₹50K', 35000, 50000, 'Audits HR processes and compliance', 'clipboard-check', 'Human Resources', 'hr auditor,hr compliance', 1, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE 
  `title` = VALUES(`title`),
  `grade` = VALUES(`grade`),
  `band` = VALUES(`band`),
  `minSalary` = VALUES(`minSalary`),
  `maxSalary` = VALUES(`maxSalary`),
  `description` = VALUES(`description`),
  `icon` = VALUES(`icon`),
  `department` = VALUES(`department`),
  `aliases` = VALUES(`aliases`),
  `isActive` = VALUES(`isActive`),
  `updatedAt` = NOW(3);

SET FOREIGN_KEY_CHECKS = 1;