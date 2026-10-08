-- DropForeignKey
ALTER TABLE `breaks` DROP FOREIGN KEY `fk_brk_attendance`;

-- DropForeignKey
ALTER TABLE `breaks` DROP FOREIGN KEY `fk_brk_employee`;

-- DropForeignKey
ALTER TABLE `departments` DROP FOREIGN KEY `fk_departments_floor`;

-- DropForeignKey
ALTER TABLE `departments` DROP FOREIGN KEY `fk_departments_location`;

-- DropForeignKey
ALTER TABLE `employees` DROP FOREIGN KEY `fk_emp_dept`;

-- DropForeignKey
ALTER TABLE `employees` DROP FOREIGN KEY `fk_emp_floor`;

-- DropForeignKey
ALTER TABLE `employees` DROP FOREIGN KEY `fk_emp_location`;

-- DropForeignKey
ALTER TABLE `employees` DROP FOREIGN KEY `fk_emp_section`;

-- DropForeignKey
ALTER TABLE `employees` DROP FOREIGN KEY `fk_emp_shift`;

-- DropForeignKey
ALTER TABLE `employees` DROP FOREIGN KEY `fk_emp_sp`;

-- DropForeignKey
ALTER TABLE `face_verification_logs` DROP FOREIGN KEY `fk_face_emp`;

-- DropForeignKey
ALTER TABLE `floors` DROP FOREIGN KEY `fk_floors_location`;

-- DropForeignKey
ALTER TABLE `holidays` DROP FOREIGN KEY `fk_hol_loc`;

-- DropForeignKey
ALTER TABLE `incentive_grants` DROP FOREIGN KEY `fk_inc_grant_emp`;

-- DropForeignKey
ALTER TABLE `incentive_grants` DROP FOREIGN KEY `fk_inc_grant_rule`;

-- DropForeignKey
ALTER TABLE `incentive_rules` DROP FOREIGN KEY `fk_inc_rule_loc`;

-- DropForeignKey
ALTER TABLE `leave_requests` DROP FOREIGN KEY `fk_leave_emp`;

-- DropForeignKey
ALTER TABLE `leave_requests` DROP FOREIGN KEY `fk_leave_loc`;

-- DropForeignKey
ALTER TABLE `live_streams` DROP FOREIGN KEY `fk_stream_host`;

-- DropForeignKey
ALTER TABLE `live_streams` DROP FOREIGN KEY `fk_stream_loc`;

-- DropForeignKey
ALTER TABLE `notifications` DROP FOREIGN KEY `fk_notif_user`;

-- DropForeignKey
ALTER TABLE `observations` DROP FOREIGN KEY `fk_obs_emp`;

-- DropForeignKey
ALTER TABLE `observations` DROP FOREIGN KEY `fk_obs_loc`;

-- DropForeignKey
ALTER TABLE `observations` DROP FOREIGN KEY `fk_obs_user`;

-- DropForeignKey
ALTER TABLE `payroll_items` DROP FOREIGN KEY `fk_pay_items_emp`;

-- DropForeignKey
ALTER TABLE `payroll_items` DROP FOREIGN KEY `fk_pay_items_run`;

-- DropForeignKey
ALTER TABLE `payroll_runs` DROP FOREIGN KEY `fk_payroll_loc`;

-- DropForeignKey
ALTER TABLE `penalty_policies` DROP FOREIGN KEY `fk_pen_pol_loc`;

-- DropForeignKey
ALTER TABLE `penalty_records` DROP FOREIGN KEY `fk_pen_rec_emp`;

-- DropForeignKey
ALTER TABLE `penalty_records` DROP FOREIGN KEY `fk_pen_rec_pol`;

-- DropForeignKey
ALTER TABLE `qr_codes` DROP FOREIGN KEY `fk_qr_emp`;

-- DropForeignKey
ALTER TABLE `qr_scan_records` DROP FOREIGN KEY `fk_scan_emp`;

-- DropForeignKey
ALTER TABLE `qr_scan_records` DROP FOREIGN KEY `fk_scan_qr`;

-- DropForeignKey
ALTER TABLE `sections` DROP FOREIGN KEY `fk_sections_dept`;

-- DropForeignKey
ALTER TABLE `selling_points` DROP FOREIGN KEY `fk_sp_section`;

-- DropForeignKey
ALTER TABLE `shifts` DROP FOREIGN KEY `fk_shifts_location`;

-- DropForeignKey
ALTER TABLE `stream_messages` DROP FOREIGN KEY `fk_msg_stream`;

-- DropForeignKey
ALTER TABLE `stream_messages` DROP FOREIGN KEY `fk_msg_user`;

-- DropForeignKey
ALTER TABLE `stream_observations` DROP FOREIGN KEY `fk_so_obs`;

-- DropForeignKey
ALTER TABLE `stream_observations` DROP FOREIGN KEY `fk_so_stream`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `fk_users_employee`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `fk_users_location`;

-- DropForeignKey
ALTER TABLE `weekly_offs` DROP FOREIGN KEY `fk_wo_loc`;

-- DropIndex
DROP INDEX `idx_att_emp` ON `attendance`;

-- AlterTable
ALTER TABLE `attendance` DROP PRIMARY KEY,
    DROP COLUMN `attendance_date`,
    DROP COLUMN `early_login_incentive`,
    DROP COLUMN `employee_id`,
    DROP COLUMN `is_face_verified`,
    DROP COLUMN `late_login_penalty`,
    DROP COLUMN `location_id`,
    DROP COLUMN `punch_in`,
    DROP COLUMN `punch_out`,
    DROP COLUMN `shift_id`,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `employeeId` VARCHAR(191) NOT NULL,
    MODIFY `locationId` VARCHAR(191) NOT NULL,
    MODIFY `shiftId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EARLY', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK', 'WEEKLY_OFF', 'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED', 'FACE_VERIFICATION_FAILED') NOT NULL DEFAULT 'ABSENT',
    MODIFY `notes` VARCHAR(191) NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT,
    ADD PRIMARY KEY (`id`);

-- DropTable
DROP TABLE `_migrations`;

-- DropTable
DROP TABLE `audit_logs`;

-- DropTable
DROP TABLE `breaks`;

-- DropTable
DROP TABLE `departments`;

-- DropTable
DROP TABLE `devices`;

-- DropTable
DROP TABLE `employees`;

-- DropTable
DROP TABLE `face_verification_logs`;

-- DropTable
DROP TABLE `floors`;

-- DropTable
DROP TABLE `holidays`;

-- DropTable
DROP TABLE `incentive_grants`;

-- DropTable
DROP TABLE `incentive_rules`;

-- DropTable
DROP TABLE `leave_requests`;

-- DropTable
DROP TABLE `live_streams`;

-- DropTable
DROP TABLE `locations`;

-- DropTable
DROP TABLE `notifications`;

-- DropTable
DROP TABLE `observations`;

-- DropTable
DROP TABLE `payroll_items`;

-- DropTable
DROP TABLE `payroll_runs`;

-- DropTable
DROP TABLE `penalty_policies`;

-- DropTable
DROP TABLE `penalty_records`;

-- DropTable
DROP TABLE `qr_codes`;

-- DropTable
DROP TABLE `qr_scan_records`;

-- DropTable
DROP TABLE `sections`;

-- DropTable
DROP TABLE `selling_points`;

-- DropTable
DROP TABLE `shifts`;

-- DropTable
DROP TABLE `stream_messages`;

-- DropTable
DROP TABLE `stream_observations`;

-- DropTable
DROP TABLE `system_settings`;

-- DropTable
DROP TABLE `users`;

-- DropTable
DROP TABLE `weekly_offs`;

-- CreateIndex
CREATE INDEX `Attendance_shiftId_idx` ON `Attendance`(`shiftId`);

-- CreateIndex
CREATE INDEX `Attendance_status_idx` ON `Attendance`(`status`);

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `attendance` RENAME INDEX `idx_att_lookup` TO `Attendance_locationId_attendanceDate_idx`;

-- RenameIndex
ALTER TABLE `attendance` RENAME INDEX `uq_emp_att_date` TO `Attendance_employeeId_attendanceDate_key`;

