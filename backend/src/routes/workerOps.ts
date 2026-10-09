import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

// Worker-facing operations endpoints consumed by live tracking, the QR
// scanner live widget, and the observation module. Kept in a dedicated
// module so the sub-mounts (/staff-ops, /observation-levels) stay separate
// from the /api/attendance router they were previously nested under.

export const staffOpsRouter = Router();
staffOpsRouter.use(authenticate);
staffOpsRouter.get('/live-status', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { location_id, employee_id, floor_id, department_id, gender, status, page = 1, limit = 40 } = req.query;
    const where: any = {
      attendanceDate: { gte: new Date(new Date().toDateString()) },
    };
    if (location_id) where.locationId = location_id;
    if (status) where.status = String(status).toUpperCase();
    if (employee_id) where.employeeId = employee_id;

    const employeeWhere: any = {};
    if (floor_id) employeeWhere.floorId = floor_id;
    if (department_id) employeeWhere.departmentId = department_id;
    if (gender) employeeWhere.gender = gender;
    if (Object.keys(employeeWhere).length > 0) {
      where.employee = employeeWhere;
    }

    const [results, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { attendanceDate: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              fullName: true,
              gender: true,
              departmentId: true,
              role: true,
              dateOfBirth: true,
              status: true,
              floorId: true,
              floor: { select: { id: true, name: true } },
              locationId: true,
              shiftId: true,
            },
          },
          location: { select: { id: true, name: true, code: true } },
          shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    if (employee_id) {
      const a: any = results[0];
      if (!a) return res.status(404).json({ error: 'No live record found for employee' });
      return res.json({
        employee: {
          id: a.employee.id,
          code: a.employee.employeeCode,
          name: a.employee.fullName,
          gender: a.employee.gender,
        },
        location: a.location,
        floor: a.employee?.floor || null,
        shift: a.shift
          ? { code: a.shift.name, start: a.shift.startTime, end: a.shift.endTime }
          : null,
        attendance: {
          status: a.status,
          checkIn: a.actualLogin,
          checkOut: a.actualLogout,
          lateMinutes: a.lateLoginSeconds ? Math.round(a.lateLoginSeconds / 60000) : 0,
          otMinutes: a.overtimeSeconds ? Math.round(a.overtimeSeconds / 60000) : 0,
          isWeekOff: a.status === 'WEEKLY_OFF',
        },
        break: null,
        remainingTeaBreak: null,
        remainingLunchBreak: null,
      });
    }

    const employees = (results as any[]).map((a) => ({
      id: a.employee.id,
      employeeCode: a.employee.employeeCode,
      fullName: a.employee.fullName,
      gender: a.employee.gender,
      department: a.employee.departmentId,
      location: a.location,
      shift: a.shift,
      attendance: {
        status: a.status,
        lateMinutes: a.lateLoginSeconds ? Math.round(a.lateLoginSeconds / 60000) : 0,
        isWeekOff: a.status === 'WEEKLY_OFF',
        break: null,
      },
      faceVerification: a.faceVerified ? { result: 'passed', matchPercentage: a.faceMatchPercentage } : null,
      photo: null,
    }));

    res.json({ employees, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get live status error:', error);
    res.status(500).json({ error: 'Failed to get live status' });
  }
});

export const observationLevelsRouter = Router();
observationLevelsRouter.use(authenticate);
observationLevelsRouter.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  const levels = [
    { id: 'EXCELLENT', code: 'EXCELLENT', name: 'Excellent', score: 5, color: '#059669', requiresAction: false },
    { id: 'VERY_GOOD', code: 'VERY_GOOD', name: 'Very Good', score: 4, color: '#2563eb', requiresAction: false },
    { id: 'GOOD', code: 'GOOD', name: 'Good', score: 3, color: '#7c3aed', requiresAction: false },
    { id: 'NEEDS_IMPROVEMENT', code: 'NEEDS_IMPROVEMENT', name: 'Needs Improvement', score: 2, color: '#d97706', requiresAction: true },
    { id: 'CRITICAL', code: 'CRITICAL', name: 'Critical', score: 1, color: '#dc2626', requiresAction: true },
  ];
  res.json({ levels, total: levels.length });
});
