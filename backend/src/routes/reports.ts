import { Router } from 'express';
import { prisma } from '../index.js';
import { dbDate } from '../utils/dates.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/dashboard-summary', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let locationId = getScopedLocationId(req.user, req.query.locationId);
    if (locationId === 'all') locationId = undefined;
    if (locationId) {
      const cleanCode = locationId.replace(/^loc_/, '').toUpperCase();
      const locMatch = await prisma.location.findFirst({
        where: { OR: [{ id: locationId }, { code: cleanCode }] },
      });
      if (locMatch) locationId = locMatch.id;
    }

    const departmentId = req.query.departmentId && req.query.departmentId !== 'all' ? String(req.query.departmentId) : undefined;
    const shiftId = req.query.shiftId && req.query.shiftId !== 'all' ? String(req.query.shiftId) : undefined;
    const dateParam = req.query.date ? String(req.query.date) : undefined;

    const today = dateParam ? new Date(dateParam) : new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const latestAttendance = await prisma.attendance.findFirst({
      orderBy: { attendanceDate: 'desc' },
      select: { attendanceDate: true },
    });
    const targetDate = dateParam ? new Date(dateParam) : latestAttendance?.attendanceDate;

    const employeeWhere: any = { status: 'ACTIVE' };
    const attendanceWhere: any = targetDate ? { attendanceDate: targetDate } : {};
    const faceWhere: any = { verifiedAt: { gte: today, lt: tomorrow } };
    const qrWhere: any = { scannedAt: { gte: today, lt: tomorrow } };
    const incentiveWhere: any = { transactionDate: { gte: today, lt: tomorrow } };
    const penaltyWhere: any = { transactionDate: { gte: today, lt: tomorrow } };
    const observationWhere: any = { status: { in: ['OPEN', 'IN_PROGRESS'] } };
    const streamWhere: any = { status: 'LIVE' };
    const sellingPointWhere: any = { status: true };

    if (locationId) {
      employeeWhere.locationId = locationId;
      attendanceWhere.locationId = locationId;
      faceWhere.locationId = locationId;
      qrWhere.locationId = locationId;
      incentiveWhere.employee = { ...incentiveWhere.employee, locationId };
      penaltyWhere.employee = { ...penaltyWhere.employee, locationId };
      observationWhere.locationId = locationId;
      streamWhere.locationId = locationId;
      sellingPointWhere.locationId = locationId;
    }

    if (departmentId) {
      employeeWhere.departmentId = departmentId;
      attendanceWhere.employee = { ...(attendanceWhere.employee || {}), departmentId };
      incentiveWhere.employee = { ...(incentiveWhere.employee || {}), departmentId };
      penaltyWhere.employee = { ...(penaltyWhere.employee || {}), departmentId };
    }

    if (shiftId) {
      attendanceWhere.shiftId = shiftId;
    }

    const [
      totalEmployees,
      attendance,
      faceVerified,
      faceFailed,
      faceAvg,
      qrSuccess,
      qrFailed,
      incentive,
      penalty,
      attendanceAgg,
      openObservations,
      criticalObservations,
      liveStreams,
      activeSellingPoints,
    ] = await Promise.all([
      prisma.employee.count({ where: employeeWhere }),
      prisma.attendance.findMany({ where: attendanceWhere, select: { status: true } }),
      prisma.faceVerification.count({ where: { ...faceWhere, result: 'VERIFIED' } }),
      prisma.faceVerification.count({ where: { ...faceWhere, result: 'FAILED' } }),
      prisma.faceVerification.aggregate({ where: faceWhere, _avg: { matchPercentage: true } }),
      prisma.qRScanRecord.count({ where: { ...qrWhere, result: 'SUCCESS' } }),
      prisma.qRScanRecord.count({ where: { ...qrWhere, result: { not: 'SUCCESS' } } }),
      prisma.incentiveTransaction.aggregate({ where: incentiveWhere, _sum: { calculatedAmount: true } }),
      prisma.penaltyTransaction.aggregate({ where: penaltyWhere, _sum: { calculatedAmount: true } }),
      prisma.attendance.aggregate({
        where: attendanceWhere,
        _sum: { earlyLoginIncentive: true, overtimeIncentive: true, lateLoginPenalty: true },
      }),
      prisma.observation.count({ where: observationWhere }),
      prisma.observation.count({ where: { ...observationWhere, level: 'CRITICAL' } }),
      prisma.liveStream.count({ where: streamWhere }),
      prisma.sellingPoint.count({ where: sellingPointWhere }),
    ]);

    // On Lunch / Tea cards count ACTIVE break sessions (source of truth),
    // not attendance.status, which the seed leaves at PRESENT during breaks.
    const activeBreaks = await prisma.employeeBreak.findMany({
      where: {
        status: 'ACTIVE',
        breakDate: dbDate(),
        ...(locationId ? { employee: { locationId } } : {}),
      },
      select: { breakType: true },
    });
    const onLunch = activeBreaks.filter((b) => b.breakType === 'LUNCH').length;
    const onTeaBreak = activeBreaks.filter((b) => b.breakType === 'TEA').length;

    const checkedInStatuses = [
      'PRESENT', 'EARLY', 'LATE', 'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED',
      'FACE_VERIFICATION_FAILED', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK',
    ];
    const countStatus = (status: string) => attendance.filter((a: any) => a.status === status).length;
    const present = attendance.filter((a: any) => checkedInStatuses.includes(a.status)).length;
    const weeklyOff = countStatus('WEEKLY_OFF');
    const absent = Math.max(totalEmployees - present - weeklyOff, 0);

    const attAgg: any = attendanceAgg || {};

    res.json({
      totalEmployees,
      present,
      absent,
      late: countStatus('LATE'),
      onLunch,
      onTeaBreak,
      weeklyOff,
      overtime: countStatus('OVERTIME'),
      faceVerified,
      faceFailed,
      avgFaceMatch: Number(faceAvg._avg.matchPercentage || 0),
      qrScans: qrSuccess + qrFailed,
      failedQrScans: qrFailed,
      incentiveToday: Number(attAgg._sum?.earlyLoginIncentive || 0) + Number(attAgg._sum?.overtimeIncentive || 0) + Number(incentive._sum.calculatedAmount || 0),
      penaltyToday: Number(attAgg._sum?.lateLoginPenalty || 0) + Number(penalty._sum.calculatedAmount || 0),
      openObservations,
      criticalObservations,
      liveStreams,
      activeSellingPoints,
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to get dashboard summary' });
  }
});

router.get('/attendance-summary', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, shiftId, departmentId } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) where.attendanceDate.gte = new Date(String(startDate));
      if (endDate) where.attendanceDate.lte = new Date(String(endDate));
    }
    if (shiftId) where.shiftId = shiftId;
    if (departmentId) where.employee = { departmentId };
    
    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { name: true } }, shift: { select: { name: true } } } },
      },
      orderBy: { attendanceDate: 'asc' },
    });
    
    // Group by employee
    const summary = attendances.reduce((acc: any, a: any) => {
      const key = a.employeeId;
      if (!acc[key]) {
        acc[key] = {
          employeeCode: a.employee?.employeeCode || '',
          employeeName: a.employee?.fullName || '',
          department: a.employee?.department?.name || 'Retail Store',
          totalDays: 0,
          present: 0,
          absent: 0,
          late: 0,
          early: 0,
          overtime: 0,
          totalWorkingHours: 0,
          totalEarlyIncentive: 0,
          totalLatePenalty: 0,
        };
      }
      acc[key].totalDays++;
      switch (a.status) {
        case 'PRESENT': acc[key].present++; break;
        case 'ABSENT': acc[key].absent++; break;
        case 'LATE': acc[key].late++; break;
        case 'EARLY': acc[key].early++; break;
        case 'OVERTIME': acc[key].overtime++; break;
      }
      acc[key].totalWorkingHours = Math.round(((acc[key].totalWorkingHours || 0) + (a.totalWorkingSeconds / 3600)) * 10) / 10;
      acc[key].totalEarlyIncentive += Number(a.earlyLoginIncentive || 0);
      acc[key].totalLatePenalty += Number(a.lateLoginPenalty || 0);
      return acc;
    }, {} as Record<string, any>);
    
    res.json({ summary: Object.values(summary), data: Object.values(summary) });
  } catch (error) {
    console.error('Attendance summary report error:', error);
    res.status(500).json({ error: 'Failed to generate attendance summary' });
  }
});

router.get('/employee-performance', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, employeeId, startDate, endDate } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (employeeId) where.employeeId = employeeId;
    if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) where.attendanceDate.gte = new Date(String(startDate));
      if (endDate) where.attendanceDate.lte = new Date(String(endDate));
    }
    
    const attendances = await prisma.attendance.findMany({
      where,
      include: { employee: { select: { id: true, employeeCode: true, fullName: true } } },
    });
    
    const performance = attendances.reduce((acc: any, a: any) => {
      const key = a.employeeId;
      if (!acc[key]) {
        acc[key] = { employee: a.employee, punctuality: 0, attendance: 0, overtime: 0, incentives: 0 };
      }
      const total = acc[key].punctuality + (a.status === 'PRESENT' || a.status === 'EARLY' ? 1 : 0);
      const count = acc[key].attendance + 1;
      acc[key].punctuality = total / count * 100;
      acc[key].attendance = count;
      if (a.status === 'OVERTIME') acc[key].overtime++;
      acc[key].incentives += Number(a.earlyLoginIncentive) + Number(a.overtimeIncentive);
      return acc;
    }, {} as Record<string, any>);
    
    res.json({ performance: Object.values(performance) });
  } catch (error) {
    console.error('Employee performance report error:', error);
    res.status(500).json({ error: 'Failed to generate employee performance' });
  }
});

router.get(['/incentive-summary', '/incentives-summary'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, incentiveRuleId } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { employee: { locationId: targetLocationId } } : {};
    if (incentiveRuleId) where.incentiveRuleId = incentiveRuleId;
    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate.gte = new Date(String(startDate));
      if (endDate) where.transactionDate.lte = new Date(String(endDate));
    }
    
    const transactions = await prisma.incentiveTransaction.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, fullName: true } },
        incentiveRule: { select: { id: true, name: true, incentiveType: true } },
      },
      orderBy: { transactionDate: 'desc' },
    });
    
    const records = transactions.map((t: any) => ({
      employeeCode: t.employee?.employeeCode || '',
      employeeName: t.employee?.fullName || '',
      rule: t.incentiveRule?.name || 'Daily Performance',
      type: t.incentiveRule?.incentiveType || 'EARLY_LOGIN',
      amount: `₹${Number(t.calculatedAmount || 0)}`,
      date: t.transactionDate ? new Date(t.transactionDate).toLocaleDateString() : '',
    }));

    res.json({ summary: records, records, data: records });
  } catch (error) {
    console.error('Incentive summary report error:', error);
    res.status(500).json({ error: 'Failed to generate incentive summary' });
  }
});

router.get('/break-analysis', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, breakType } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { employee: { locationId: targetLocationId } } : {};
    if (breakType) where.breakType = breakType;
    if (startDate || endDate) {
      where.breakDate = {};
      if (startDate) where.breakDate.gte = new Date(String(startDate));
      if (endDate) where.breakDate.lte = new Date(String(endDate));
    }
    
    const breaks = await prisma.employeeBreak.findMany({
      where,
      include: { employee: { select: { id: true, employeeCode: true, fullName: true } } },
    });
    
    const analysis = breaks.reduce((acc: any, b: any) => {
      const key = b.breakType;
      if (!acc[key]) {
        acc[key] = { total: 0, completed: 0, exceeded: 0, avgDuration: 0, totalExcess: 0 };
      }
      acc[key].total++;
      if (b.status === 'COMPLETED') acc[key].completed++;
      if (b.status === 'EXCEEDED') acc[key].exceeded++;
      if (b.actualDuration) acc[key].avgDuration = (acc[key].avgDuration * (acc[key].total - 1) + b.actualDuration) / acc[key].total;
      if (b.exceededDuration) acc[key].totalExcess += b.exceededDuration;
      return acc;
    }, {} as Record<string, any>);
    
    res.json({ analysis });
  } catch (error) {
    console.error('Break analysis report error:', error);
    res.status(500).json({ error: 'Failed to generate break analysis' });
  }
});

router.get(['/face-verification-stats', '/face-verification-accuracy'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (startDate || endDate) {
      where.verifiedAt = {};
      if (startDate) where.verifiedAt.gte = new Date(String(startDate));
      if (endDate) where.verifiedAt.lte = new Date(String(endDate));
    }
    
    const [verified, failed, avgMatch, logs] = await Promise.all([
      prisma.faceVerification.count({ where: { ...where, result: 'VERIFIED' } }),
      prisma.faceVerification.count({ where: { ...where, result: 'FAILED' } }),
      prisma.faceVerification.aggregate({ where: { ...where, result: 'VERIFIED' }, _avg: { matchPercentage: true } }),
      prisma.faceVerification.findMany({
        where,
        take: 50,
        orderBy: { verifiedAt: 'desc' },
        include: {
          employee: { select: { employeeCode: true, fullName: true } },
          location: { select: { name: true, code: true } },
        },
      }),
    ]);

    const records = logs.map((v: any) => ({
      employeeCode: v.employee?.employeeCode || '',
      employeeName: v.employee?.fullName || '',
      location: v.location?.name || 'Retail Flagship',
      matchPercentage: `${Number(v.matchPercentage)}%`,
      status: v.result,
      verifiedAt: v.verifiedAt ? new Date(v.verifiedAt).toLocaleTimeString() : '',
    }));
    
    res.json({
      verified,
      failed,
      total: verified + failed,
      successRate: verified + failed > 0 ? (verified / (verified + failed)) * 100 : 0,
      averageMatchPercentage: avgMatch._avg?.matchPercentage || 0,
      records,
      rows: records,
      data: records,
    });
  } catch (error) {
    console.error('Face verification stats error:', error);
    res.status(500).json({ error: 'Failed to get face verification stats' });
  }
});

router.get(['/qr-scan-analytics', '/qr-scans-summary'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, purpose } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const where: any = targetLocationId ? { locationId: targetLocationId } : {};
    if (purpose) where.purpose = purpose;
    if (startDate || endDate) {
      where.scannedAt = {};
      if (startDate) where.scannedAt.gte = new Date(String(startDate));
      if (endDate) where.scannedAt.lte = new Date(String(endDate));
    }
    
    const [success, failed, byPurpose, scanLogs] = await Promise.all([
      prisma.qRScanRecord.count({ where: { ...where, result: 'SUCCESS' } }),
      prisma.qRScanRecord.count({ where: { ...where, result: { not: 'SUCCESS' } } }),
      prisma.qRScanRecord.groupBy({ by: ['purpose'], where, _count: true }),
      prisma.qRScanRecord.findMany({
        where,
        take: 50,
        orderBy: { scannedAt: 'desc' },
        include: {
          employee: { select: { employeeCode: true, fullName: true } },
        },
      }),
    ]);

    const records = scanLogs.map((s: any) => ({
      employeeCode: s.employee?.employeeCode || '',
      employeeName: s.employee?.fullName || '',
      purpose: s.purpose,
      result: s.result,
      scannedAt: s.scannedAt ? new Date(s.scannedAt).toLocaleTimeString() : '',
    }));
    
    res.json({
      success,
      failed,
      total: success + failed,
      successRate: success + failed > 0 ? (success / (success + failed)) * 100 : 0,
      byPurpose,
      records,
      scans: records,
      rows: records,
      data: records,
    });
  } catch (error) {
    console.error('QR scan analytics error:', error);
    res.status(500).json({ error: 'Failed to get QR scan analytics' });
  }
});

router.get('/selling-point-performance', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate } = req.query;
    
    const targetLocationId = getScopedLocationId(req.user, locationId);
    
    const sellingPoints = await prisma.sellingPoint.findMany({
      where: targetLocationId ? { locationId: targetLocationId, status: true } : { status: true },
      include: {
        _count: { select: { employees: true, qrScanRecords: true } },
        incentiveRule: true,
      },
    });
    
    const performance = sellingPoints.map((sp: any) => ({
      ...sp,
      employeeCount: sp._count.employees,
      scanCount: sp._count.qrScanRecords,
      performanceScore: sp.performanceScore || 0,
    }));
    
    res.json({ performance });
  } catch (error) {
    console.error('Selling point performance error:', error);
    res.status(500).json({ error: 'Failed to get selling point performance' });
  }
});

export default router;