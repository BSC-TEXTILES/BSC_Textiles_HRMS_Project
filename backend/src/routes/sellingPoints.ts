import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { pool } from '../db.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import crypto from 'crypto';

const router = Router();

router.use(authenticate);

function genId(prefix = 'c') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

const spSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(20).toUpperCase(),
    locationId: z.string().min(1),
    floorId: z.string().min(1),
    sectionId: z.string().min(1),
    category: z.string().optional(),
    managerId: z.string().optional(),
    targetAmount: z.number().optional(),
    incentiveRuleId: z.string().optional(),
  }),
});

/**
 * GET /api/selling-points/floor-hierarchy
 * Complete production-ready floor-wise hierarchy for retail operations
 */
router.get('/floor-hierarchy', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, search } = req.query;
    let targetLocId = getScopedLocationId(req.user, locationId as string);

    // If no location provided, pick the first location
    if (!targetLocId) {
      const [firstLoc]: any = await pool.query('SELECT id FROM location ORDER BY code ASC LIMIT 1');
      targetLocId = firstLoc[0]?.id;
    }

    if (!targetLocId) {
      return res.status(404).json({ error: 'No store locations configured' });
    }

    // 1. Location info
    const [locRows]: any = await pool.query(
      'SELECT id, name, code, address, phone FROM location WHERE id = ?',
      [targetLocId]
    );
    const location = locRows[0] || null;

    // 2. Fetch floors for this location
    let floorQuery = 'SELECT id, name, floorNumber, status, floorManagerId, assistantManagerId FROM floor WHERE locationId = ?';
    const floorParams: any[] = [targetLocId];
    if (floorId) {
      floorQuery += ' AND id = ?';
      floorParams.push(floorId);
    }
    floorQuery += ' ORDER BY floorNumber ASC';
    const [floors]: any = await pool.query(floorQuery, floorParams);

    // 3. Fetch sections for this location
    const [sections]: any = await pool.query(
      'SELECT id, name, code, floorId, departmentId FROM section WHERE locationId = ? ORDER BY name ASC',
      [targetLocId]
    );

    // 4. Fetch all selling points for this location
    let spQuery = `
      SELECT sp.id, sp.name, sp.code, sp.category, sp.targetAmount, sp.status,
             sp.floorId, sp.sectionId, sp.managerId, sp.createdAt, sp.updatedAt,
             f.name as floorName, sec.name as sectionName, sec.code as sectionCode
      FROM sellingpoint sp
      LEFT JOIN floor f ON sp.floorId = f.id
      LEFT JOIN section sec ON sp.sectionId = sec.id
      WHERE sp.locationId = ?
    `;
    const spParams: any[] = [targetLocId];
    if (floorId) {
      spQuery += ' AND sp.floorId = ?';
      spParams.push(floorId);
    }
    if (search) {
      spQuery += ' AND (sp.name LIKE ? OR sp.code LIKE ? OR sec.name LIKE ?)';
      const s = `%${search}%`;
      spParams.push(s, s, s);
    }
    spQuery += ' ORDER BY sp.code ASC';
    const [sellingPoints]: any = await pool.query(spQuery, spParams);

    // 5. Fetch all assigned salesmen with employee details & shift
    const [assignments]: any = await pool.query(`
      SELECT esp.id as assignmentId, esp.sellingPointId, esp.isPrimary, esp.assignedDate,
             e.id as employeeId, e.employeeCode, e.fullName, e.designation, e.phone, e.email, NULL as avatar,
             s.name as shiftName, s.startTime as shiftStart, s.endTime as shiftEnd
      FROM employeesellingpoint esp
      JOIN employee e ON esp.employeeId = e.id
      LEFT JOIN shift s ON e.shiftId = s.id
      WHERE esp.sellingPointId IN (
        SELECT id FROM sellingpoint WHERE locationId = ?
      )
      ORDER BY esp.isPrimary DESC, e.fullName ASC
    `, [targetLocId]);

    // 6. Fetch today's attendance for these employees
    const [attendanceRows]: any = await pool.query(`
      SELECT a.employeeId, a.status, a.actualLogin, a.actualLogout
      FROM attendance a
      WHERE a.locationId = ? AND DATE(a.attendanceDate) = CURDATE()
    `, [targetLocId]);
    const attendanceMap = new Map();
    for (const att of attendanceRows) {
      attendanceMap.set(att.employeeId, att);
    }

    // 7. Fetch retail sales metrics for today and month
    const [txMetrics]: any = await pool.query(`
      SELECT counterId, salespersonId,
             SUM(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN netAmount ELSE 0 END) as todaySales,
             SUM(CASE WHEN status = 'COMPLETED' THEN netAmount ELSE 0 END) as monthSales,
             COUNT(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN 1 ELSE NULL END) as todayBills,
             COUNT(CASE WHEN status = 'COMPLETED' THEN 1 ELSE NULL END) as totalBills
      FROM retail_sales_transaction
      WHERE locationId = ?
      GROUP BY counterId, salespersonId
    `, [targetLocId]);

    const counterSalesMap = new Map();
    const salespersonSalesMap = new Map();

    for (const tm of txMetrics) {
      // Counter aggregate
      const cCurrent = counterSalesMap.get(tm.counterId) || { todaySales: 0, monthSales: 0, todayBills: 0, totalBills: 0 };
      cCurrent.todaySales += Number(tm.todaySales || 0);
      cCurrent.monthSales += Number(tm.monthSales || 0);
      cCurrent.todayBills += Number(tm.todayBills || 0);
      cCurrent.totalBills += Number(tm.totalBills || 0);
      counterSalesMap.set(tm.counterId, cCurrent);

      // Salesperson aggregate
      if (tm.salespersonId) {
        const sCurrent = salespersonSalesMap.get(tm.salespersonId) || { todaySales: 0, monthSales: 0, todayBills: 0, totalBills: 0 };
        sCurrent.todaySales += Number(tm.todaySales || 0);
        sCurrent.monthSales += Number(tm.monthSales || 0);
        sCurrent.todayBills += Number(tm.todayBills || 0);
        sCurrent.totalBills += Number(tm.totalBills || 0);
        salespersonSalesMap.set(tm.salespersonId, sCurrent);
      }
    }

    // 8. Fetch active billing sessions for billing counters
    const [billingSessions]: any = await pool.query(`
      SELECT rbs.id, rbs.counterId, rbs.status, rbs.openedAt, rbs.openingFloat,
             e.fullName as cashierName, e.employeeCode as cashierCode
      FROM retail_billing_session rbs
      JOIN employee e ON rbs.cashierId = e.id
      WHERE rbs.locationId = ? AND rbs.status = 'ACTIVE'
    `, [targetLocId]);
    const sessionMap = new Map();
    for (const sess of billingSessions) {
      sessionMap.set(sess.counterId, sess);
    }

    // 9. Fetch floor managers details
    const [floorManagers]: any = await pool.query(`
      SELECT e.id, e.employeeCode, e.fullName, e.designation, e.phone, NULL as avatar
      FROM employee e
      WHERE e.id IN (
        SELECT floorManagerId FROM floor WHERE locationId = ? AND floorManagerId IS NOT NULL
      )
    `, [targetLocId]);
    const managerMap = new Map();
    for (const fm of floorManagers) {
      managerMap.set(fm.id, fm);
    }

    // 10. Map assignments to selling points
    const assignmentsBySp = new Map();
    for (const a of assignments) {
      const spId = a.sellingPointId;
      if (!assignmentsBySp.has(spId)) {
        assignmentsBySp.set(spId, []);
      }

      const att = attendanceMap.get(a.employeeId);
      const attStatus = att ? att.status : 'ABSENT';
      const spMetrics = salespersonSalesMap.get(a.employeeId) || { todaySales: 0, monthSales: 0, todayBills: 0, totalBills: 0 };
      const individualTarget = 350000;
      const targetPct = individualTarget > 0 ? Math.min(200, Math.round((spMetrics.monthSales / individualTarget) * 100)) : 0;
      const avgBill = spMetrics.todayBills > 0 ? Math.round(spMetrics.todaySales / spMetrics.todayBills) : 0;

      assignmentsBySp.get(spId).push({
        id: a.assignmentId,
        employeeId: a.employeeId,
        employeeCode: a.employeeCode,
        fullName: a.fullName,
        designation: a.designation || 'Sales Consultant',
        phone: a.phone,
        email: a.email,
        avatar: a.avatar,
        isPrimary: Boolean(a.isPrimary),
        assignedDate: a.assignedDate,
        shiftName: a.shiftName || 'Morning Showroom Shift',
        shiftTime: a.shiftStart && a.shiftEnd ? `${String(a.shiftStart).slice(0, 5)} - ${String(a.shiftEnd).slice(0, 5)}` : '09:30 - 19:30',
        attendanceStatus: attStatus,
        actualLogin: att?.actualLogin || null,
        todaySales: spMetrics.todaySales,
        monthSales: spMetrics.monthSales,
        targetAmount: individualTarget,
        achievementPct: targetPct,
        billsHandled: spMetrics.todayBills,
        successfulTransactions: spMetrics.totalBills,
        avgBillValue: avgBill,
        incentiveEligible: targetPct >= 80,
      });
    }

    // 11. Format counters with salesmen & performance
    const formattedSps = sellingPoints.map((sp: any) => {
      const salesmen = assignmentsBySp.get(sp.id) || [];
      const perf = counterSalesMap.get(sp.id) || { todaySales: 0, monthSales: 0, todayBills: 0, totalBills: 0 };
      const target = Number(sp.targetAmount || 1000000);
      const achPct = target > 0 ? Math.min(200, Math.round((perf.monthSales / target) * 100)) : 0;
      const avgBill = perf.todayBills > 0 ? Math.round(perf.todaySales / perf.todayBills) : 0;

      return {
        id: sp.id,
        name: sp.name,
        code: sp.code,
        category: sp.category || 'Sales',
        floorId: sp.floorId,
        floorName: sp.floorName,
        sectionId: sp.sectionId,
        sectionName: sp.sectionName || 'General Section',
        sectionCode: sp.sectionCode,
        targetAmount: target,
        todaySales: perf.todaySales,
        monthSales: perf.monthSales,
        achievementPct: achPct,
        billsCount: perf.todayBills,
        totalBills: perf.totalBills,
        avgBillValue: avgBill,
        status: Boolean(sp.status),
        assignedSalesmen: salesmen,
        salesmenCount: salesmen.length,
        billingSession: sessionMap.get(sp.id) || null,
      };
    });

    // 12. Structure floor hierarchy
    const formattedFloors = floors.map((f: any) => {
      const floorCounters = formattedSps.filter((sp: any) => sp.floorId === f.id);
      const floorSections = sections.filter((s: any) => s.floorId === f.id);

      // Floor level aggregations
      let floorTotalSalesmen = 0;
      let floorPresentSalesmen = 0;
      let floorAbsentSalesmen = 0;
      let floorTodaySales = 0;
      let floorMonthSales = 0;
      let floorTarget = 0;
      let floorTodayBills = 0;

      const seenEmpIds = new Set();
      for (const c of floorCounters) {
        floorTodaySales += c.todaySales;
        floorMonthSales += c.monthSales;
        floorTarget += c.targetAmount;
        floorTodayBills += c.billsCount;
        for (const sm of c.assignedSalesmen) {
          if (!seenEmpIds.has(sm.employeeId)) {
            seenEmpIds.add(sm.employeeId);
            floorTotalSalesmen++;
            if (sm.attendanceStatus === 'PRESENT' || sm.attendanceStatus === 'ON_LUNCH' || sm.attendanceStatus === 'ON_TEA_BREAK') {
              floorPresentSalesmen++;
            } else {
              floorAbsentSalesmen++;
            }
          }
        }
      }

      const floorAchPct = floorTarget > 0 ? Math.min(200, Math.round((floorMonthSales / floorTarget) * 100)) : 0;

      return {
        id: f.id,
        name: f.name,
        floorNumber: f.floorNumber,
        status: Boolean(f.status),
        floorManager: managerMap.get(f.floorManagerId) || null,
        sections: floorSections,
        counters: floorCounters,
        summary: {
          totalSections: floorSections.length,
          totalCounters: floorCounters.length,
          totalSalesmen: floorTotalSalesmen,
          presentSalesmen: floorPresentSalesmen,
          absentSalesmen: floorAbsentSalesmen,
          floorTarget,
          todaySales: floorTodaySales,
          monthSales: floorMonthSales,
          achievementPct: floorAchPct,
          todayBills: floorTodayBills,
        },
      };
    });

    // 13. Overall Store Billing Summary
    const [billingSummaryRows]: any = await pool.query(`
      SELECT
        COUNT(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN 1 ELSE NULL END) as completedBills,
        COUNT(CASE WHEN status = 'PENDING' AND DATE(createdAt) = CURDATE() THEN 1 ELSE NULL END) as pendingBills,
        COUNT(CASE WHEN status = 'CANCELLED' AND DATE(createdAt) = CURDATE() THEN 1 ELSE NULL END) as cancelledBills,
        COUNT(CASE WHEN status = 'RETURNED' AND DATE(createdAt) = CURDATE() THEN 1 ELSE NULL END) as returnedBills,
        SUM(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN grossAmount ELSE 0 END) as grossSales,
        SUM(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN discountAmount ELSE 0 END) as totalDiscount,
        SUM(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN taxAmount ELSE 0 END) as totalTax,
        SUM(CASE WHEN status = 'COMPLETED' AND DATE(createdAt) = CURDATE() THEN netAmount ELSE 0 END) as netSales,
        SUM(CASE WHEN status = 'COMPLETED' AND paymentMethod = 'CASH' AND DATE(createdAt) = CURDATE() THEN netAmount ELSE 0 END) as cashTotal,
        SUM(CASE WHEN status = 'COMPLETED' AND paymentMethod = 'CARD' AND DATE(createdAt) = CURDATE() THEN netAmount ELSE 0 END) as cardTotal,
        SUM(CASE WHEN status = 'COMPLETED' AND paymentMethod = 'UPI' AND DATE(createdAt) = CURDATE() THEN netAmount ELSE 0 END) as upiTotal
      FROM retail_sales_transaction
      WHERE locationId = ?
    `, [targetLocId]);

    let bs = billingSummaryRows[0] || {};
    let completedCount = Number(bs.completedBills || 0);
    let netSales = Number(bs.netSales || 0);

    // If no transactions have occurred yet today, fallback to the latest available store day/month transactions
    if (completedCount === 0) {
      const [fallbackRows]: any = await pool.query(`
        SELECT
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 ELSE NULL END) as completedBills,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 ELSE NULL END) as pendingBills,
          COUNT(CASE WHEN status = 'CANCELLED' THEN 1 ELSE NULL END) as cancelledBills,
          COUNT(CASE WHEN status = 'RETURNED' THEN 1 ELSE NULL END) as returnedBills,
          SUM(CASE WHEN status = 'COMPLETED' THEN grossAmount ELSE 0 END) as grossSales,
          SUM(CASE WHEN status = 'COMPLETED' THEN discountAmount ELSE 0 END) as totalDiscount,
          SUM(CASE WHEN status = 'COMPLETED' THEN taxAmount ELSE 0 END) as totalTax,
          SUM(CASE WHEN status = 'COMPLETED' THEN netAmount ELSE 0 END) as netSales,
          SUM(CASE WHEN status = 'COMPLETED' AND paymentMethod = 'CASH' THEN netAmount ELSE 0 END) as cashTotal,
          SUM(CASE WHEN status = 'COMPLETED' AND paymentMethod = 'CARD' THEN netAmount ELSE 0 END) as cardTotal,
          SUM(CASE WHEN status = 'COMPLETED' AND paymentMethod = 'UPI' THEN netAmount ELSE 0 END) as upiTotal
        FROM retail_sales_transaction
        WHERE locationId = ?
      `, [targetLocId]);
      if (fallbackRows && fallbackRows[0] && Number(fallbackRows[0].completedBills || 0) > 0) {
        bs = fallbackRows[0];
        completedCount = Number(bs.completedBills || 0);
        netSales = Number(bs.netSales || 0);
      }
    }

    // 14. Overall Store Overview Metrics
    let storeTotalCounters = 0;
    let storeTotalSalesmen = 0;
    let storePresentSalesmen = 0;
    let storeAbsentSalesmen = 0;
    let storeTarget = 0;
    let storeTodaySales = 0;

    for (const fl of formattedFloors) {
      storeTotalCounters += fl.summary.totalCounters;
      storeTotalSalesmen += fl.summary.totalSalesmen;
      storePresentSalesmen += fl.summary.presentSalesmen;
      storeAbsentSalesmen += fl.summary.absentSalesmen;
      storeTarget += fl.summary.floorTarget;
      storeTodaySales += fl.summary.todaySales;
    }

    const storeAchPct = storeTarget > 0 ? Math.min(200, Math.round((storeTodaySales / storeTarget) * 100)) : 0;

    // 15. Recent Billing Transactions
    const [recentTx]: any = await pool.query(`
      SELECT rst.id, rst.billNumber, rst.grossAmount, rst.discountAmount, rst.taxAmount, rst.netAmount,
             rst.paymentMethod, rst.status, rst.customerName, rst.customerPhone, rst.createdAt,
             sp.name as counterName, sp.code as counterCode,
             f.name as floorName,
             e.fullName as salespersonName, e.employeeCode as salespersonCode,
             c.fullName as cashierName, c.employeeCode as cashierCode
      FROM retail_sales_transaction rst
      LEFT JOIN sellingpoint sp ON rst.counterId = sp.id
      LEFT JOIN floor f ON rst.floorId = f.id
      LEFT JOIN employee e ON rst.salespersonId = e.id
      LEFT JOIN employee c ON rst.cashierId = c.id
      WHERE rst.locationId = ?
      ORDER BY rst.createdAt DESC
      LIMIT 12
    `, [targetLocId]);

    res.json({
      location,
      overview: {
        totalFloors: formattedFloors.length,
        totalCounters: storeTotalCounters,
        totalSalesmen: storeTotalSalesmen,
        presentSalesmen: storePresentSalesmen,
        absentSalesmen: storeAbsentSalesmen,
        activeBillingCounters: billingSessions.length,
        todayStoreSales: storeTodaySales,
        storeSalesTarget: storeTarget,
        storeAchievementPct: storeAchPct,
        completedBills: completedCount,
        pendingBills: Number(bs.pendingBills || 0),
        shortagesCount: storeAbsentSalesmen,
      },
      floors: formattedFloors,
      billingSummary: {
        completedBills: completedCount,
        pendingBills: Number(bs.pendingBills || 0),
        cancelledBills: Number(bs.cancelledBills || 0),
        returnedBills: Number(bs.returnedBills || 0),
        grossSales: Number(bs.grossSales || 0),
        discountAmount: Number(bs.totalDiscount || 0),
        taxAmount: Number(bs.totalTax || 0),
        netSales,
        cashCollections: Number(bs.cashTotal || 0),
        cardCollections: Number(bs.cardTotal || 0),
        upiCollections: Number(bs.upiTotal || 0),
        avgBillValue: completedCount > 0 ? Math.round(netSales / completedCount) : 0,
        activeSessions: billingSessions,
        recentTransactions: recentTx,
      },
    });
  } catch (error) {
    const details = (error as any)?.message || String(error);
    console.error('Get floor hierarchy error:', details);
    res.status(500).json({ error: 'Failed to generate floor-wise retail hierarchy', details });
  }
});

/**
 * GET /api/selling-points/available-employees
 * Fetch real employees available for assignment with search
 */
router.get('/available-employees', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, search } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId as string);

    let query = `
      SELECT e.id, e.employeeCode, e.fullName, e.designation, e.phone, e.email, NULL as avatar, e.status,
             d.name as departmentName, s.name as shiftName
      FROM employee e
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN shift s ON e.shiftId = s.id
      WHERE e.status = 'ACTIVE'
    `;
    const params: any[] = [];
    if (scopedLocId) {
      query += ' AND e.locationId = ?';
      params.push(scopedLocId);
    }
    if (search) {
      query += ' AND (e.fullName LIKE ? OR e.employeeCode LIKE ? OR e.designation LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    query += ' ORDER BY e.fullName ASC LIMIT 50';

    const [employees]: any = await pool.query(query, params);
    res.json(employees);
  } catch (error) {
    console.error('Get available employees error:', error);
    res.status(500).json({ error: 'Failed to fetch available employees' });
  }
});

/**
 * GET /api/selling-points/transactions
 * Fetch retail transactions with rich filtering
 */
router.get('/transactions', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, counterId, floorId, salespersonId, status, page = 1, limit = 20 } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId as string);

    let query = `
      SELECT rst.id, rst.billNumber, rst.grossAmount, rst.discountAmount, rst.taxAmount, rst.netAmount,
             rst.paymentMethod, rst.status, rst.customerName, rst.customerPhone, rst.itemsJson, rst.createdAt,
             sp.name as counterName, sp.code as counterCode,
             f.name as floorName,
             e.fullName as salespersonName, e.employeeCode as salespersonCode,
             c.fullName as cashierName, c.employeeCode as cashierCode
      FROM retail_sales_transaction rst
      LEFT JOIN sellingpoint sp ON rst.counterId = sp.id
      LEFT JOIN floor f ON rst.floorId = f.id
      LEFT JOIN employee e ON rst.salespersonId = e.id
      LEFT JOIN employee c ON rst.cashierId = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (scopedLocId) {
      query += ' AND rst.locationId = ?';
      params.push(scopedLocId);
    }
    if (counterId) {
      query += ' AND rst.counterId = ?';
      params.push(counterId);
    }
    if (floorId) {
      query += ' AND rst.floorId = ?';
      params.push(floorId);
    }
    if (salespersonId) {
      query += ' AND rst.salespersonId = ?';
      params.push(salespersonId);
    }
    if (status) {
      query += ' AND rst.status = ?';
      params.push(status);
    }

    query += ' ORDER BY rst.createdAt DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const [transactions]: any = await pool.query(query, params);
    res.json({ transactions, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch retail transactions' });
  }
});

/**
 * Standard GET /api/selling-points
 */
router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, floorId, sectionId, page = 1, limit = 50, search } = req.query;
    const scopedLocId = getScopedLocationId(req.user, locationId as string);

    let query = `
      SELECT sp.id, sp.name, sp.code, sp.category, sp.targetAmount, sp.status,
             sp.floorId, sp.sectionId, sp.locationId,
             f.name as floorName, sec.name as sectionName
      FROM sellingpoint sp
      LEFT JOIN floor f ON sp.floorId = f.id
      LEFT JOIN section sec ON sp.sectionId = sec.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (scopedLocId) {
      query += ' AND sp.locationId = ?';
      params.push(scopedLocId);
    }
    if (floorId) {
      query += ' AND sp.floorId = ?';
      params.push(floorId);
    }
    if (sectionId) {
      query += ' AND sp.sectionId = ?';
      params.push(sectionId);
    }
    if (search) {
      query += ' AND (sp.name LIKE ? OR sp.code LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }

    query += ' ORDER BY sp.code ASC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const [rows]: any = await pool.query(query, params);

    // Fetch assigned salesmen for each counter
    const spIds = rows.map((r: any) => r.id);
    let assignedMap = new Map();
    if (spIds.length > 0) {
      const [espRows]: any = await pool.query(`
        SELECT esp.sellingPointId, esp.isPrimary, esp.assignedDate,
               e.id as employeeId, e.employeeCode, e.fullName, e.designation, NULL as avatar
        FROM employeesellingpoint esp
        JOIN employee e ON esp.employeeId = e.id
        WHERE esp.sellingPointId IN (?)
        ORDER BY esp.isPrimary DESC, e.fullName ASC
      `, [spIds]);

      for (const esp of espRows) {
        if (!assignedMap.has(esp.sellingPointId)) {
          assignedMap.set(esp.sellingPointId, []);
        }
        assignedMap.get(esp.sellingPointId).push(esp);
      }
    }

    const sellingPoints = rows.map((r: any) => ({
      ...r,
      floor: { name: r.floorName, id: r.floorId },
      section: { name: r.sectionName, id: r.sectionId },
      assignedSalesmen: assignedMap.get(r.id) || [],
      _count: { employees: (assignedMap.get(r.id) || []).length },
    }));

    res.json({ sellingPoints, total: sellingPoints.length, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get selling points error:', error);
    res.status(500).json({ error: 'Failed to get selling points' });
  }
});

/**
 * GET /api/selling-points/:id
 */
router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT sp.*, f.name as floorName, sec.name as sectionName, l.name as locationName, l.code as locationCode
      FROM sellingpoint sp
      LEFT JOIN floor f ON sp.floorId = f.id
      LEFT JOIN section sec ON sp.sectionId = sec.id
      LEFT JOIN location l ON sp.locationId = l.id
      WHERE sp.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Selling point not found' });
    }

    const sellingPoint = rows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && sellingPoint.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [employees]: any = await pool.query(`
      SELECT esp.id as assignmentId, esp.isPrimary, esp.assignedDate,
             e.id as employeeId, e.employeeCode, e.fullName, e.designation, e.phone, e.email, NULL as avatar
      FROM employeesellingpoint esp
      JOIN employee e ON esp.employeeId = e.id
      WHERE esp.sellingPointId = ?
      ORDER BY esp.isPrimary DESC, e.fullName ASC
    `, [req.params.id]);

    res.json({
      ...sellingPoint,
      floor: { id: sellingPoint.floorId, name: sellingPoint.floorName },
      section: { id: sellingPoint.sectionId, name: sellingPoint.sectionName },
      location: { id: sellingPoint.locationId, name: sellingPoint.locationName, code: sellingPoint.locationCode },
      employees,
    });
  } catch (error) {
    console.error('Get selling point error:', error);
    res.status(500).json({ error: 'Failed to get selling point' });
  }
});

/**
 * POST /api/selling-points
 * Create counter
 */
router.post('/', authorize('ADD'), validate(spSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code, locationId, floorId, sectionId, category, managerId, targetAmount, incentiveRuleId } = req.body;

    if (req.user!.role !== 'SUPER_ADMIN' && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [existing]: any = await pool.query(
      'SELECT id FROM sellingpoint WHERE locationId = ? AND code = ?',
      [locationId, code]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Selling point code already exists for this location' });
    }

    const newId = genId('sp');
    await pool.query(`
      INSERT INTO sellingpoint (
        id, name, code, locationId, floorId, sectionId, category,
        managerId, targetAmount, incentiveRuleId, status, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 1, NOW(3), NOW(3)
      )
    `, [
      newId, name, code, locationId, floorId, sectionId, category || 'Sales',
      managerId || null, targetAmount || 1000000, incentiveRuleId || null
    ]);

    // Audit log
    await pool.query(`
      INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, newValue, createdAt)
      VALUES (?, ?, ?, 'CREATE_SELLING_POINT', 'sellingpoint', ?, ?, NOW(3))
    `, [genId('aud'), req.user!.id, locationId, newId, JSON.stringify({ name, code, category, floorId })]);

    res.status(201).json({ id: newId, name, code, locationId, floorId, sectionId, category });
  } catch (error) {
    console.error('Create selling point error:', error);
    res.status(500).json({ error: 'Failed to create selling point' });
  }
});

/**
 * PUT /api/selling-points/:id
 * Update counter
 */
router.put('/:id', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { name, code, floorId, sectionId, category, managerId, targetAmount, status } = req.body;

    const [existingRows]: any = await pool.query('SELECT * FROM sellingpoint WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Selling point not found' });
    }

    const existing = existingRows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(`
      UPDATE sellingpoint
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          floorId = COALESCE(?, floorId),
          sectionId = COALESCE(?, sectionId),
          category = COALESCE(?, category),
          managerId = ?,
          targetAmount = COALESCE(?, targetAmount),
          status = COALESCE(?, status),
          updatedAt = NOW(3)
      WHERE id = ?
    `, [name, code, floorId, sectionId, category, managerId || null, targetAmount, status !== undefined ? status : null, req.params.id]);

    // Audit log
    await pool.query(`
      INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, newValue, createdAt)
      VALUES (?, ?, ?, 'UPDATE_SELLING_POINT', 'sellingpoint', ?, ?, ?, NOW(3))
    `, [genId('aud'), req.user!.id, existing.locationId, req.params.id, JSON.stringify(existing), JSON.stringify(req.body)]);

    res.json({ message: 'Selling point updated successfully' });
  } catch (error) {
    console.error('Update selling point error:', error);
    res.status(500).json({ error: 'Failed to update selling point' });
  }
});

/**
 * POST /api/selling-points/:id/assign-employee
 * Assign salesperson to counter
 */
router.post('/:id/assign-employee', authorize('ASSIGN'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, isPrimary } = req.body;

    const [spRows]: any = await pool.query('SELECT * FROM sellingpoint WHERE id = ?', [req.params.id]);
    if (spRows.length === 0) {
      return res.status(404).json({ error: 'Selling point not found' });
    }

    const sp = spRows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && sp.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [empRows]: any = await pool.query('SELECT id, fullName, employeeCode FROM employee WHERE id = ?', [employeeId]);
    if (empRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (isPrimary) {
      await pool.query('UPDATE employeesellingpoint SET isPrimary = 0 WHERE employeeId = ?', [employeeId]);
    }

    const assignmentId = genId('esp');
    await pool.query(`
      INSERT INTO employeesellingpoint (id, employeeId, sellingPointId, isPrimary, assignedDate, createdAt)
      VALUES (?, ?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary)
    `, [assignmentId, employeeId, req.params.id, isPrimary ? 1 : 0]);

    // Audit log
    await pool.query(`
      INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, newValue, createdAt)
      VALUES (?, ?, ?, 'ASSIGN_SALESPERSON', 'employeesellingpoint', ?, ?, NOW(3))
    `, [genId('aud'), req.user!.id, sp.locationId, assignmentId, JSON.stringify({ employeeId, sellingPointId: req.params.id, isPrimary })]);

    res.json({ message: 'Employee assigned successfully', assignmentId });
  } catch (error) {
    console.error('Assign employee error:', error);
    res.status(500).json({ error: 'Failed to assign employee' });
  }
});

/**
 * POST /api/selling-points/:id/transfer-employee
 * Transfer salesperson from one counter to another
 */
router.post('/:id/transfer-employee', authorize('ASSIGN'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, fromSellingPointId, isPrimary } = req.body;

    const [targetSpRows]: any = await pool.query('SELECT * FROM sellingpoint WHERE id = ?', [req.params.id]);
    if (targetSpRows.length === 0) {
      return res.status(404).json({ error: 'Target selling point not found' });
    }

    const targetSp = targetSpRows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && targetSp.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (fromSellingPointId) {
      await pool.query('DELETE FROM employeesellingpoint WHERE employeeId = ? AND sellingPointId = ?', [employeeId, fromSellingPointId]);
    }

    const assignmentId = genId('esp');
    await pool.query(`
      INSERT INTO employeesellingpoint (id, employeeId, sellingPointId, isPrimary, assignedDate, createdAt)
      VALUES (?, ?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary)
    `, [assignmentId, employeeId, req.params.id, isPrimary ? 1 : 0]);

    // Audit log
    await pool.query(`
      INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, newValue, createdAt)
      VALUES (?, ?, ?, 'TRANSFER_SALESPERSON', 'employeesellingpoint', ?, ?, ?, NOW(3))
    `, [genId('aud'), req.user!.id, targetSp.locationId, assignmentId, JSON.stringify({ fromSellingPointId }), JSON.stringify({ toSellingPointId: req.params.id, employeeId })]);

    res.json({ message: 'Employee transferred successfully' });
  } catch (error) {
    console.error('Transfer employee error:', error);
    res.status(500).json({ error: 'Failed to transfer employee' });
  }
});

/**
 * DELETE /api/selling-points/:id/assign-employee/:employeeId
 * Unassign salesperson from counter without deleting employee record
 */
router.delete('/:id/assign-employee/:employeeId', authorize('ASSIGN'), async (req: AuthRequest, res) => {
  try {
    const [spRows]: any = await pool.query('SELECT * FROM sellingpoint WHERE id = ?', [req.params.id]);
    if (spRows.length === 0) {
      return res.status(404).json({ error: 'Selling point not found' });
    }

    const sp = spRows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && sp.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'DELETE FROM employeesellingpoint WHERE employeeId = ? AND sellingPointId = ?',
      [req.params.employeeId, req.params.id]
    );

    // Audit log
    await pool.query(`
      INSERT INTO auditlog (id, userId, locationId, action, entityType, entityId, oldValue, createdAt)
      VALUES (?, ?, ?, 'UNASSIGN_SALESPERSON', 'employeesellingpoint', ?, ?, NOW(3))
    `, [genId('aud'), req.user!.id, sp.locationId, req.params.id, JSON.stringify({ employeeId: req.params.employeeId })]);

    res.json({ message: 'Employee unassigned from selling point successfully' });
  } catch (error) {
    console.error('Unassign employee error:', error);
    res.status(500).json({ error: 'Failed to unassign employee' });
  }
});

/**
 * DELETE /api/selling-points/:id
 */
router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const [spRows]: any = await pool.query('SELECT * FROM sellingpoint WHERE id = ?', [req.params.id]);
    if (spRows.length === 0) {
      return res.status(404).json({ error: 'Selling point not found' });
    }

    const sp = spRows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && sp.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [empCount]: any = await pool.query('SELECT count(*) as cnt FROM employeesellingpoint WHERE sellingPointId = ?', [req.params.id]);
    if (empCount[0].cnt > 0) {
      return res.status(400).json({ error: 'Cannot delete counter with active assigned salesmen. Reassign staff first.' });
    }

    await pool.query('DELETE FROM sellingpoint WHERE id = ?', [req.params.id]);
    res.json({ message: 'Selling point deleted successfully' });
  } catch (error) {
    console.error('Delete selling point error:', error);
    res.status(500).json({ error: 'Failed to delete selling point' });
  }
});

export default router;