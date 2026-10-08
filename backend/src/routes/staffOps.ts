import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { dbDate } from '../utils/dates.js';

const router = Router();

router.use(authenticate);

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d?: Date | null) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '');

/** AttendanceStatus enum -> lowercase keys the frontend status maps understand */
const STATUS_MAP: Record<string, string> = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EARLY: 'present',
  ON_LUNCH: 'on_lunch',
  ON_TEA_BREAK: 'on_tea_break',
  ON_OTHER_BREAK: 'on_break',
  WEEKLY_OFF: 'weekly_off',
  OVERTIME: 'overtime',
  LEFT_STORE: 'present',
  FACE_VERIFIED: 'face_verified',
  FACE_VERIFICATION_FAILED: 'face_failed',
};

const statusLower = (s?: string | null) => (s ? STATUS_MAP[s] ?? s.toLowerCase() : 'absent');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const qstr = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * The UI sends friendly filter keys ('bel', 'gf', 'sales') as well as raw ids.
 * Resolve floor values to real floor ids: raw id, 'gf' -> floorNumber 0, 'f1' -> 1, ...
 */
async function resolveFloorIds(value: string): Promise<string[]> {
  const byId = await prisma.floor.findUnique({ where: { id: value }, select: { id: true } });
  if (byId) return [byId.id];

  let floorNumber: number | null = null;
  if (/^gf$/i.test(value)) floorNumber = 0;
  else {
    const m = /^f(\d+)$/i.exec(value);
    if (m) floorNumber = Number(m[1]);
  }
  if (floorNumber === null) return [];

  const floors = await prisma.floor.findMany({ where: { floorNumber }, select: { id: true } });
  return floors.map((f) => f.id);
}

function breakBudget(shift: any, gender: string | null) {
  const female = (gender ?? '').toLowerCase() === 'female';
  return {
    tea: shift ? (female ? shift.femaleTeaMinutes : shift.maleTeaMinutes) : 20,
    lunch: shift ? (female ? shift.femaleLunchMinutes : shift.maleLunchMinutes) : 100,
  };
}

function usedBreakMinutes(breaks: any[], type: 'TEA' | 'LUNCH'): number {
  return breaks
    .filter((b) => b.breakType === type)
    .reduce((sum, b) => {
      if (b.actualDuration != null) return sum + b.actualDuration;
      if (b.status === 'ACTIVE' && b.startTime) {
        return sum + Math.max(0, Math.floor((Date.now() - b.startTime.getTime()) / 60000));
      }
      return sum;
    }, 0);
}

/**
 * GET /api/staff-ops/live-status
 *
 * With ?employee_id=  -> single EmployeeInfo object (QR scanner side panel)
 * Without            -> { employees: EmployeeLiveStatus[] } (live staff tracking board)
 */
router.get('/live-status', async (req: AuthRequest, res) => {
  try {
    // `today` = local midnight, for DATETIME comparisons (face verifiedAt).
    // `dbDay`  = UTC midnight of the local calendar date, for @db.Date columns
    // (attendanceDate / breakDate) — see utils/dates.ts.
    const today = startOfToday();
    const dbDay = dbDate();
    const employeeId = qstr(req.query.employee_id);
    const isSuper = req.user!.role === 'SUPER_ADMIN';
    const scope = !isSuper && req.user!.locationId ? { locationId: req.user!.locationId } : {};

    // ---------- Single employee ----------
    if (employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, ...scope },
        include: { location: true, floor: true, shift: true },
      });
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const [attendance, todayBreaks] = await Promise.all([
        prisma.attendance.findUnique({
          where: { employeeId_attendanceDate: { employeeId: employee.id, attendanceDate: dbDay } },
        }),
        prisma.employeeBreak.findMany({
          where: { employeeId: employee.id, breakDate: dbDay },
          orderBy: { startTime: 'asc' },
        }),
      ]);

      const activeBreak = todayBreaks.find((b) => b.status === 'ACTIVE') ?? null;
      const currentBreak = activeBreak ?? todayBreaks[todayBreaks.length - 1] ?? null;
      const isWeekOff = attendance?.status === 'WEEKLY_OFF';
      const status = employee.status === 'ON_LEAVE' ? 'leave' : statusLower(attendance?.status);

      const budget = breakBudget(employee.shift, employee.gender);

      return res.json({
        employee: {
          id: employee.id,
          code: employee.employeeCode,
          name: employee.fullName,
          gender: employee.gender,
        },
        location: { id: employee.location.id, name: employee.location.name },
        floor: employee.floor ? { id: employee.floor.id, name: employee.floor.name } : null,
        shift: employee.shift
          ? {
              code: employee.shift.code,
              start: hhmm(employee.shift.startTime),
              end: hhmm(employee.shift.endTime),
            }
          : null,
        attendance: {
          status,
          checkIn: attendance?.actualLogin?.toISOString() ?? '',
          checkOut: attendance?.actualLogout?.toISOString() ?? '',
          lateMinutes: attendance ? Math.round(attendance.lateLoginSeconds / 60) : 0,
          otMinutes: attendance ? Math.round(attendance.overtimeSeconds / 60) : 0,
          isWeekOff,
        },
        break: currentBreak
          ? {
              status: currentBreak.status.toLowerCase(),
              category: currentBreak.breakType.toLowerCase(),
              startTime: currentBreak.startTime?.toISOString() ?? '',
              endTime: currentBreak.endTime?.toISOString() ?? '',
            }
          : null,
        remainingTeaBreak: Math.max(0, budget.tea - usedBreakMinutes(todayBreaks, 'TEA')),
        remainingLunchBreak: Math.max(0, budget.lunch - usedBreakMinutes(todayBreaks, 'LUNCH')),
      });
    }

    // ---------- Live board ----------
    const locationId = qstr(req.query.location_id);
    const floorId = qstr(req.query.floor_id);
    const departmentId = qstr(req.query.department_id);
    const gender = qstr(req.query.gender);
    const statusFilter = qstr(req.query.status);

    const where: any = { status: { in: ['ACTIVE', 'ON_LEAVE'] } };

    if (!isSuper && req.user!.locationId) {
      where.locationId = req.user!.locationId;
    } else if (locationId && locationId !== 'all') {
      const loc = await prisma.location.findFirst({
        where: { OR: [{ id: locationId }, { code: { equals: locationId } }] },
        select: { id: true },
      });
      where.locationId = { in: loc ? [loc.id] : [] };
    }

    if (floorId) where.floorId = { in: await resolveFloorIds(floorId) };

    if (departmentId) {
      const depts = await prisma.department.findMany({
        where: { OR: [{ id: departmentId }, { code: { equals: departmentId } }] },
        select: { id: true },
      });
      where.departmentId = { in: depts.map((d) => d.id) };
    }

    if (gender) where.gender = gender;

    const employees = await prisma.employee.findMany({
      where,
      include: {
        location: { select: { id: true, name: true } },
        department: { select: { name: true } },
        shift: true,
      },
      orderBy: { employeeCode: 'asc' },
    });

    const ids = employees.map((e) => e.id);
    const [attRows, breakRows, faceRows] = await Promise.all([
      prisma.attendance.findMany({ where: { employeeId: { in: ids }, attendanceDate: dbDay } }),
      prisma.employeeBreak.findMany({
        where: { employeeId: { in: ids }, breakDate: dbDay },
        orderBy: { startTime: 'asc' },
      }),
      // newest first so the first row seen per employee is today's latest check
      prisma.faceVerification.findMany({
        where: { employeeId: { in: ids }, verifiedAt: { gte: today } },
        orderBy: { verifiedAt: 'desc' },
      }),
    ]);

    const attBy = new Map(attRows.map((a) => [a.employeeId, a]));
    const breaksBy = new Map<string, any[]>();
    for (const b of breakRows) {
      const list = breaksBy.get(b.employeeId);
      if (list) list.push(b);
      else breaksBy.set(b.employeeId, [b]);
    }
    const faceBy = new Map<string, any>();
    for (const f of faceRows) {
      if (!faceBy.has(f.employeeId)) faceBy.set(f.employeeId, f);
    }

    const rows = employees.map((e) => {
      const attendance = attBy.get(e.id);
      const empBreaks = breaksBy.get(e.id) ?? [];
      const activeBreak = empBreaks.find((b) => b.status === 'ACTIVE') ?? null;
      const currentBreak = activeBreak ?? empBreaks[empBreaks.length - 1] ?? null;
      const isWeekOff = attendance?.status === 'WEEKLY_OFF';
      const status = e.status === 'ON_LEAVE' ? 'leave' : statusLower(attendance?.status);
      const face = faceBy.get(e.id);

      return {
        active: !!activeBreak,
        item: {
          id: e.id,
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          gender: e.gender ?? '',
          location: e.location,
          department: e.department?.name ?? '—',
          shift: e.shift
            ? {
                code: e.shift.code,
                startTime: hhmm(e.shift.startTime),
                endTime: hhmm(e.shift.endTime),
              }
            : null,
          attendance: {
            status,
            checkIn: attendance?.actualLogin?.toISOString(),
            checkOut: attendance?.actualLogout?.toISOString(),
            lateMinutes: attendance ? Math.round(attendance.lateLoginSeconds / 60) : 0,
            earlyOutMinutes: attendance ? Math.round(attendance.earlyLogoutSeconds / 60) : 0,
            otMinutes: attendance ? Math.round(attendance.overtimeSeconds / 60) : 0,
            isWeekOff,
          },
          break: currentBreak
            ? {
                status: currentBreak.status.toLowerCase(),
                category: currentBreak.breakType.toLowerCase(),
                startTime: currentBreak.startTime?.toISOString(),
                endTime: currentBreak.endTime?.toISOString(),
                exceededMinutes:
                  currentBreak.excessDuration ??
                  (currentBreak.status === 'ACTIVE' && currentBreak.startTime
                    ? Math.max(
                        0,
                        Math.floor((Date.now() - currentBreak.startTime.getTime()) / 60000) -
                          currentBreak.allowedDuration
                      )
                    : 0),
              }
            : null,
          faceVerification: face
            ? {
                score: Number(face.matchPercentage),
                result: face.result === 'VERIFIED' ? 'passed' : 'failed',
                threshold: Number(face.threshold),
                time: face.verifiedAt.toISOString(),
              }
            : null,
        },
      };
    });

    let output = rows;
    if (statusFilter && statusFilter !== 'all') {
      output = rows.filter((r) => {
        switch (statusFilter) {
          case 'present':
            // "Present" on the dashboard includes late arrivals (they are checked in).
            return r.item.attendance.status === 'present' || r.item.attendance.status === 'late';
          case 'late':
            return r.item.attendance.lateMinutes > 0;
          case 'absent':
            return r.item.attendance.status === 'absent';
          case 'leave':
            return r.item.attendance.status === 'leave';
          case 'weekly_off':
            return r.item.attendance.isWeekOff;
          case 'on_break':
            return r.active;
          case 'overtime':
            return r.item.attendance.status === 'overtime';
          default:
            return true;
        }
      });
    }

    res.json({ employees: output.map((r) => r.item) });
  } catch (error) {
    console.error('Live status error:', error);
    res.status(500).json({ error: 'Failed to fetch live status' });
  }
});

export default router;
