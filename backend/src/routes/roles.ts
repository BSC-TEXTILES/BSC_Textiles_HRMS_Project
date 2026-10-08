import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const ALL_ROLES = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full system control across all locations' },
  { code: 'ADMIN', name: 'Admin', description: 'Administrative access to all locations' },
  { code: 'HR_MANAGER', name: 'HR Manager', description: 'Workforce, shifts, attendance and payroll management' },
  { code: 'HR_EXECUTIVE', name: 'HR Executive', description: 'Day-to-day HR operations and employee management' },
  { code: 'PAYROLL_MANAGER', name: 'Payroll Manager', description: 'Payroll runs, deductions, and payslip generation' },
  { code: 'LOCATION_MANAGER', name: 'Location Manager', description: 'Oversees single branch operations' },
  { code: 'FLOOR_MANAGER', name: 'Floor Manager', description: 'Floor floor supervision and attendance tracking' },
  { code: 'DEPARTMENT_MANAGER', name: 'Department Manager', description: 'Department performance and schedules' },
  { code: 'TEAM_LEAD', name: 'Team Lead', description: 'Team level supervision and shift tracking' },
  { code: 'SALES_EMPLOYEE', name: 'Sales Employee', description: 'Floor sales operations and self-service desk' },
  { code: 'TEA_BREAK_MANAGER', name: 'Tea Break Manager', description: 'QR scanning and break timing verification' },
  { code: 'T_SHOP_OWNER', name: 'T-Shop Owner', description: 'Authorized canteen / tea break QR scanner' },
  { code: 'HR_AUDITOR', name: 'HR Auditor', description: 'Read-only audit and compliance inspection' },
  { code: 'EMPLOYEE', name: 'Employee', description: 'Self-service desk and attendance tracking' },
];

const ALL_PERMISSIONS = [
  { code: 'VIEW', name: 'View', category: 'Read' },
  { code: 'ADD', name: 'Add / Create', category: 'Write' },
  { code: 'EDIT', name: 'Edit / Update', category: 'Write' },
  { code: 'DELETE', name: 'Delete', category: 'Write' },
  { code: 'APPROVE', name: 'Approve', category: 'Workflow' },
  { code: 'REJECT', name: 'Reject', category: 'Workflow' },
  { code: 'ASSIGN', name: 'Assign Staff', category: 'Operations' },
  { code: 'EXPORT', name: 'Export Data', category: 'Reporting' },
  { code: 'IMPORT', name: 'Import Data', category: 'Operations' },
  { code: 'CONFIGURE', name: 'System Configuration', category: 'Administration' },
  { code: 'MANAGE', name: 'Manage Resources', category: 'Administration' },
  { code: 'RECORD', name: 'Record Punches & Logs', category: 'Operations' },
  { code: 'UPLOAD', name: 'Upload Media', category: 'Operations' },
  { code: 'PUBLISH', name: 'Publish Broadcasts', category: 'Operations' },
  { code: 'SCAN', name: 'Scan QR & Badges', category: 'Operations' },
  { code: 'VIEW_SENSITIVE_DATA', name: 'View Sensitive PII / Salaries', category: 'Security' },
];

// Get roles and permissions metadata
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    res.json({
      roles: ALL_ROLES,
      permissions: ALL_PERMISSIONS,
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to retrieve roles' });
  }
});

// Update user permissions
router.put('/user/:userId', authorize('CONFIGURE'), async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        role: role || undefined,
        permissions: permissions || undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'UPDATE',
        entityType: 'UserRolePermission',
        entityId: userId,
        newValue: { role, permissions },
      },
    });

    res.json({ message: 'User role & permissions updated successfully', user });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

export default router;
