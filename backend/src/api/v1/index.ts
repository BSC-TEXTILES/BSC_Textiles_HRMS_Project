import { Router } from 'express';

import authRoutes from '../../routes/auth.js';
import userRoutes from '../../routes/users.js';
import locationRoutes from '../../routes/locations.js';
import floorRoutes from '../../routes/floors.js';
import departmentRoutes from '../../routes/departments.js';
import sectionRoutes from '../../routes/sections.js';
import sellingPointRoutes from '../../routes/sellingPoints.js';
import employeeRoutes from '../../routes/employees.js';
import shiftRoutes from '../../routes/shifts.js';
import attendanceRoutes from '../../routes/attendance.js';
import breakRoutes from '../../routes/breaks.js';
import faceVerificationRoutes from '../../routes/faceVerification.js';
import qrCodeRoutes from '../../routes/qrCodes.js';
import incentiveRoutes from '../../routes/incentives.js';
import observationRoutes from '../../routes/observations.js';
import liveStreamRoutes from '../../routes/liveStreams.js';
import weeklyOffRoutes from '../../routes/weeklyOffs.js';
import holidayRoutes from '../../routes/holidays.js';
import reportRoutes from '../../routes/reports.js';
import auditRoutes from '../../routes/audit.js';
import payrollRoutes from '../../routes/payroll.js';
import penaltyRoutes from '../../routes/penalties.js';
import notificationRoutes from '../../routes/notifications.js';
import roleRoutes from '../../routes/roles.js';
import settingRoutes from '../../routes/settings.js';
import deviceRoutes from '../../routes/devices.js';
import kycRoutes from '../../routes/kyc.js';
import exitRoutes from '../../routes/exits.js';
import leaveRoutes from '../../routes/leaves.js';
import mobileRoutes from '../../routes/mobile.js';
import securityRoutes from '../../routes/security.js';
import fileSecurityRoutes from '../../routes/fileSecurity.js';
import { staffOpsRouter, observationLevelsRouter } from '../../routes/workerOps.js';
import lateFineRoutes from '../../routes/lateFines.js';
import employeeDocumentRoutes from '../../routes/employeeDocuments.js';
import myDeskRouter from '../../routes/myDesk.js';
import localDatabaseRoutes from '../../routes/localDatabase.js';
import analysisRoutes from '../../routes/analysis.js';
import employeeImportRoutes, { employeeExportRouter } from '../../routes/employeeImport.js';
import searchRoutes from '../../routes/search.js';
import shardsRouter from '../../routes/shards.js';
import organizationRoutes from '../../routes/organization.js';
import orgApprovalsRoutes from '../../routes/orgApprovals.js';

export const apiV1Router = Router();

// Domain Route Mounting under /api/v1 (or /api for backwards compatibility)
apiV1Router.use('/shards', shardsRouter);
apiV1Router.use('/search', searchRoutes);
apiV1Router.use('/analysis', analysisRoutes);
apiV1Router.use('/system', localDatabaseRoutes);
apiV1Router.use('/my-desk', myDeskRouter);
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/security', securityRoutes);
apiV1Router.use('/files', fileSecurityRoutes);
apiV1Router.use('/users', userRoutes);
apiV1Router.use('/locations', locationRoutes);
apiV1Router.use('/floors', floorRoutes);
apiV1Router.use('/departments', departmentRoutes);
apiV1Router.use('/sections', sectionRoutes);
apiV1Router.use('/selling-points', sellingPointRoutes);
apiV1Router.use('/employees/documents', employeeDocumentRoutes);
apiV1Router.use('/employee-documents', employeeDocumentRoutes);
// Bulk import + workforce export MUST be mounted before the generic
// /employees router, otherwise /employees/:id would swallow them.
apiV1Router.use('/employees/import', employeeImportRoutes);
apiV1Router.use('/employees/export', employeeExportRouter);
apiV1Router.use('/employees', employeeRoutes);
apiV1Router.use('/shifts', shiftRoutes);
apiV1Router.use('/attendance', attendanceRoutes);
apiV1Router.use('/late-fines', lateFineRoutes);
apiV1Router.use('/staff-ops', staffOpsRouter);
apiV1Router.use('/observation-levels', observationLevelsRouter);
apiV1Router.use('/breaks', breakRoutes);
apiV1Router.use('/face-verification', faceVerificationRoutes);
apiV1Router.use('/qr-codes', qrCodeRoutes);
apiV1Router.use('/incentives', incentiveRoutes);
apiV1Router.use('/observations', observationRoutes);
apiV1Router.use('/live-streams', liveStreamRoutes);
apiV1Router.use('/weekly-offs', weeklyOffRoutes);
apiV1Router.use('/holidays', holidayRoutes);
apiV1Router.use('/reports', reportRoutes);
apiV1Router.use('/audit', auditRoutes);
apiV1Router.use('/payroll', payrollRoutes);
apiV1Router.use('/penalties', penaltyRoutes);
apiV1Router.use('/notifications', notificationRoutes);
apiV1Router.use('/roles', roleRoutes);
apiV1Router.use('/settings', settingRoutes);
apiV1Router.use('/devices', deviceRoutes);
apiV1Router.use('/kyc', kycRoutes);
apiV1Router.use('/exits', exitRoutes);
apiV1Router.use('/leaves', leaveRoutes);
apiV1Router.use('/mobile', mobileRoutes);

// Organization Management module
// Mount approvals before the general organization router so
// /organization/approvals/* is handled by the approvals router.
apiV1Router.use('/organization/approvals', orgApprovalsRoutes);
apiV1Router.use('/organization', organizationRoutes);

export default apiV1Router;
