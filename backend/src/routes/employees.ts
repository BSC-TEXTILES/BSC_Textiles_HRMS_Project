import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { container } from '../core/container/ServiceContainer.js';

const router = Router();

router.use(authenticate);

const employeeSchema = z.object({
  body: z.object({
    employeeCode: z.string().min(2).max(30),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    locationId: z.string().min(1),
    floorId: z.string().optional(),
    departmentId: z.string().optional(),
    sectionId: z.string().optional(),
    shiftId: z.string().optional(),
    designation: z.string().optional(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE']).optional(),
    joiningDate: z.string().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, departmentId, sectionId, shiftId, status, page = 1, limit = 20, search } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Number(page) - 1) * safeLimit;
    
    const isElevated = ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'].includes(req.user!.role);
    const where: any = {};
    if (locationId) {
      where.locationId = locationId;
    } else if (!isElevated && req.user!.locationId) {
      where.locationId = req.user!.locationId;
    }
    if (floorId) where.floorId = floorId;
    if (departmentId) where.departmentId = departmentId;
    if (sectionId) where.sectionId = sectionId;
    if (shiftId) where.shiftId = shiftId;
    if (status) where.status = status;
    if (search) where.OR = [
      { employeeCode: { contains: String(search), mode: 'insensitive' } },
      { firstName: { contains: String(search), mode: 'insensitive' } },
      { lastName: { contains: String(search), mode: 'insensitive' } },
    ];
    
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { employeeCode: 'asc' },
        include: {
          location: { select: { id: true, name: true, code: true } },
          floor: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          shift: { select: { id: true, name: true, startTime: true, endTime: true } },
          sellingPoints: { include: { sellingPoint: { select: { id: true, name: true, code: true } } } },
        },
      }),
      prisma.employee.count({ where }),
    ]);
    
    res.json({ employees, total, page: Number(page), limit: safeLimit });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'Failed to get employees' });
  }
});

router.get('/lookup', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const isElevated = ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'].includes(req.user!.role);
    const where: any = { status: 'ACTIVE' };
    if (!isElevated && req.user!.locationId) {
      where.locationId = req.user!.locationId;
    }
    const employees = await prisma.employee.findMany({
      where,
      select: { id: true, employeeCode: true, fullName: true, locationId: true, departmentId: true, shiftId: true },
      orderBy: { employeeCode: 'asc' },
    });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(employees);
  } catch (error) {
    console.error('Get employee lookup error:', error);
    res.status(500).json({ error: 'Failed to get employee lookup' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        location: { select: { id: true, name: true, code: true } },
        floor: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true, gracePeriod: true } },
        sellingPoints: { include: { sellingPoint: { select: { id: true, name: true, code: true } } } },
        faceProfile: { select: { id: true, enrolledAt: true, isActive: true } },
        qrCode: { select: { id: true, token: true, validFrom: true, validTo: true, isConsumed: true } },
        dailyQRCode: { select: { id: true, token: true, validFrom: true, validTo: true, isConsumed: true } },
        attendances: { take: 5, orderBy: { attendanceDate: 'desc' } },
        breaks: { take: 5, orderBy: { breakDate: 'desc' } },
        faceVerifications: { take: 5, orderBy: { verifiedAt: 'desc' } },
        qrScanRecords: { take: 5, orderBy: { scannedAt: 'desc' } },
        observations: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const isProfileElevated = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR'].includes(req.user!.role);
    const isOwnProfile = req.user!.employeeId && req.user!.employeeId === employee.id;
    const isSameLocation = req.user!.locationId && req.user!.locationId === employee.locationId;

    if (!isProfileElevated && !isOwnProfile && !isSameLocation) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: 'Failed to get employee' });
  }
});

router.post('/', authorize('ADD'), validate(employeeSchema), async (req: AuthRequest, res) => {
  try {
    const { employeeCode, firstName, lastName, email, phone, gender, locationId, floorId, departmentId, sectionId, shiftId, designation, role, joiningDate } = req.body;
    
    const isMutationElevated = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role);
    if (!isMutationElevated && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const existing = await prisma.employee.findUnique({ where: { employeeCode } });
    if (existing) {
      return res.status(400).json({ error: 'Employee code already exists' });
    }
    
    const fullName = `${firstName} ${lastName}`;
    
    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        firstName,
        lastName,
        fullName,
        email,
        phone,
        gender,
        locationId,
        floorId,
        departmentId,
        sectionId,
        shiftId,
        designation,
        role: role || 'EMPLOYEE',
        joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
        status: 'ACTIVE',
      },
    });
    
    // Generate QR codes
    const empQR = await prisma.qRCode.create({
      data: {
        token: `EMP-${employeeCode}-${Date.now()}`,
        type: 'EMPLOYEE',
        employeeId: employee.id,
        locationId,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    
    const dailyQR = await prisma.qRCode.create({
      data: {
        token: `DAILY-${employeeCode}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`,
        type: 'DAILY',
        employeeId: employee.id,
        locationId,
        validFrom: new Date(new Date().setHours(0, 0, 0, 0)),
        validTo: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    });
    
    await prisma.employee.update({
      where: { id: employee.id },
      data: { qrCodeId: empQR.id, dailyQRCodeId: dailyQR.id },
    });
    
    // Create user account if email provided
    if (email) {
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('password123', 12);
      
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role: role || 'EMPLOYEE',
          permissions: ['VIEW'],
          employeeId: employee.id,
          locationId,
        },
      });
    }

    // Publish notification for new employee creation
    await container.notificationService.publishEvent({
      eventId: 'EMP.CREATED',
      title: 'New Employee Created',
      message: `New employee ${fullName} (${employeeCode}) has been added to ${locationId}.`,
      type: 'INFO',
      severity: 'MEDIUM',
      entityType: 'employee',
      entityId: employee.id,
      locationId,
      actionUrl: `/employees/profile/${employee.id}`,
      correlationId: `emp_created_${employee.id}`,
      metadata: { employeeCode, fullName, locationId, departmentId, role: role || 'EMPLOYEE' },
    });

    res.status(201).json(employee);
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/:id', authorize('EDIT'), validate(employeeSchema), async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, gender, floorId, departmentId, sectionId, shiftId, designation, role, status, exitDate } = req.body;
    
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const isEditElevated = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role);
    if (!isEditElevated && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const fullName = `${firstName} ${lastName}`;
    
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        firstName,
        lastName,
        fullName,
        email,
        phone,
        gender,
        floorId,
        departmentId,
        sectionId,
        shiftId,
        designation,
        role,
        status,
        exitDate: exitDate ? new Date(exitDate) : null,
      },
    });

    // Publish notification for employee profile update
    const changes: string[] = [];
    if (existing.firstName !== firstName || existing.lastName !== lastName) changes.push('name');
    if (existing.email !== email) changes.push('email');
    if (existing.phone !== phone) changes.push('phone');
    if (existing.floorId !== floorId) changes.push('floor');
    if (existing.departmentId !== departmentId) changes.push('department');
    if (existing.sectionId !== sectionId) changes.push('section');
    if (existing.shiftId !== shiftId) changes.push('shift');
    if (existing.designation !== designation) changes.push('designation');
    if (existing.role !== role) changes.push('role');
    if (existing.status !== status) changes.push('status');

    if (changes.length > 0) {
      await container.notificationService.publishEvent({
        eventId: changes.includes('status') ? 'EMP.STATUS_CHANGED' : 
               changes.some(c => ['department', 'floor', 'section'].includes(c)) ? 'EMP.DEPT_CHANGED' : 'EMP.PROFILE_UPDATED',
        title: changes.includes('status') ? 'Employee Status Changed' : 
               changes.some(c => ['department', 'floor', 'section'].includes(c)) ? 'Employee Department/Location Changed' : 'Employee Profile Updated',
        message: `Employee ${fullName} (${existing.employeeCode}) profile updated. Changed fields: ${changes.join(', ')}.`,
        type: changes.includes('status') ? 'CRITICAL' : 'INFO',
        severity: changes.includes('status') ? 'CRITICAL' : 'MEDIUM',
        entityType: 'employee',
        entityId: employee.id,
        locationId: existing.locationId,
        actionUrl: `/employees/profile/${employee.id}`,
        correlationId: `emp_updated_${employee.id}_${Date.now()}`,
        metadata: { changes, previousValues: { floorId: existing.floorId, departmentId: existing.departmentId, status: existing.status } },
      });
    }

    res.json(employee);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.patch('/:id/status', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const isStatusElevated = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.role);
    if (!isStatusElevated && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { status, exitDate: status === 'TERMINATED' ? new Date() : null },
    });

    // Publish notification for status change
    const eventId = status === 'TERMINATED' ? 'EMP.RESIGNATION' : 'EMP.STATUS_CHANGED';
    await container.notificationService.publishEvent({
      eventId,
      title: status === 'TERMINATED' ? 'Employee Resignation/Termination' : 'Employee Status Changed',
      message: `Employee ${existing.fullName} (${existing.employeeCode}) status changed from ${existing.status} to ${status}.`,
      type: status === 'TERMINATED' ? 'CRITICAL' : 'WARNING',
      severity: status === 'TERMINATED' ? 'CRITICAL' : 'HIGH',
      entityType: 'employee',
      entityId: employee.id,
      locationId: existing.locationId,
      actionUrl: `/employees/profile/${employee.id}`,
      correlationId: `emp_status_${employee.id}_${Date.now()}`,
      metadata: { previousStatus: existing.status, newStatus: status },
    });

    res.json(employee);
  } catch (error) {
    console.error('Update employee status error:', error);
    res.status(500).json({ error: 'Failed to update employee status' });
  }
});

router.post('/:id/regenerate-qr', authorize('CONFIGURE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Regenerate permanent QR
    const empQR = await prisma.qRCode.create({
      data: {
        token: `EMP-${existing.employeeCode}-${Date.now()}`,
        type: 'EMPLOYEE',
        employeeId: existing.id,
        locationId: existing.locationId,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    
    // Regenerate daily QR
    const dailyQR = await prisma.qRCode.create({
      data: {
        token: `DAILY-${existing.employeeCode}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`,
        type: 'DAILY',
        employeeId: existing.id,
        locationId: existing.locationId,
        validFrom: new Date(new Date().setHours(0, 0, 0, 0)),
        validTo: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    });
    
    await prisma.employee.update({
      where: { id: existing.id },
      data: { qrCodeId: empQR.id, dailyQRCodeId: dailyQR.id },
    });
    
    res.json({ empQR, dailyQR });
  } catch (error) {
    console.error('Regenerate QR error:', error);
    res.status(500).json({ error: 'Failed to regenerate QR codes' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const [attCount, breakCount, fvCount] = await Promise.all([
      prisma.attendance.count({ where: { employeeId: req.params.id } }),
      prisma.employeeBreak.count({ where: { employeeId: req.params.id } }),
      prisma.faceVerification.count({ where: { employeeId: req.params.id } }),
    ]);
    
    if (attCount > 0 || breakCount > 0 || fvCount > 0) {
      return res.status(400).json({ error: 'Cannot delete employee with existing records. Set status to TERMINATED instead.' });
    }
    
    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

export default router;