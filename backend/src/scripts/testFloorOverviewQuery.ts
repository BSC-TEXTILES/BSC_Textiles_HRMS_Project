import { pool } from '../nativeDb.js';

async function testFloorQuery() {
  const targetMonth = 'Aug';
  const targetYear = 2026;

  // 1. Fetch floors with location and manager
  const [floorRows]: any = await pool.query(`
    SELECT 
      f.id AS floorId,
      f.name AS floorName,
      f.floorNumber,
      l.id AS locationId,
      l.code AS locationCode,
      l.name AS locationName,
      l.city AS locationCity,
      u.id AS managerUserId,
      u.fullName AS managerName,
      u.email AS managerEmail,
      COALESCE(mgrEmp.employeeCode, u.employeeId, 'N/A') AS managerEmployeeCode
    FROM floor f
    JOIN location l ON f.locationId = l.id
    LEFT JOIN user u ON f.floorManagerId = u.id
    LEFT JOIN employee mgrEmp ON u.employeeId = mgrEmp.id
    ORDER BY l.code, f.floorNumber
  `);

  console.log(`Found ${floorRows.length} floors across locations.`);

  // 2. Fetch employee payroll items for target month
  const [itemRows]: any = await pool.query(`
    SELECT 
      e.id AS employeeId,
      e.employeeCode,
      e.fullName,
      e.designation,
      e.locationId,
      e.floorId,
      e.sectionId,
      l.code AS locationCode,
      sec.name AS sectionName,
      sh.name AS shiftName,
      pi.id AS payrollItemId,
      COALESCE(pi.grossSalary, pi.basicSalary + COALESCE(pi.earlyIncentive,0) + COALESCE(pi.attendanceIncentive,0), e.fixedGrossSalary, 0) AS grossSalary,
      COALESCE(pi.totalDeductions, pi.deductions, 0) AS totalDeductions,
      COALESCE(pi.totalPayable, pi.netPay, 0) AS netPayable,
      COALESCE(pi.employerPf, ROUND(COALESCE(pi.basicSalary, 12000) * 0.12), 0) AS employerPf,
      COALESCE(pi.employerEsi, 0) AS employerEsi,
      COALESCE(pi.ctc, 0) AS ctc,
      COALESCE(pi.daysPayable, 31) AS daysPayable,
      COALESCE(pi.status, 'APPROVED') AS status
    FROM employee e
    JOIN location l ON e.locationId = l.id
    LEFT JOIN section sec ON e.sectionId = sec.id
    LEFT JOIN shift sh ON e.shiftId = sh.id
    LEFT JOIN payrollitem pi ON pi.employeeId = e.id AND (
      (pi.salaryMonth = ? AND pi.salaryYear = ?) OR 
      pi.salaryMonth IS NULL
    )
    WHERE e.status = 'ACTIVE'
    ORDER BY e.fullName
  `, [targetMonth, targetYear]);

  console.log(`Found ${itemRows.length} active employee payroll records for ${targetMonth}-${targetYear}.`);

  // Aggregate by floor and section
  const floorStats: Record<string, any> = {};
  for (const item of itemRows) {
    const fId = item.floorId || 'unassigned';
    if (!floorStats[fId]) {
      floorStats[fId] = {
        count: 0,
        gross: 0,
        deductions: 0,
        netPay: 0,
        employerContrib: 0,
        ctc: 0,
        sections: {},
        employees: []
      };
    }
    floorStats[fId].count++;
    floorStats[fId].gross += Number(item.grossSalary);
    floorStats[fId].deductions += Number(item.totalDeductions);
    floorStats[fId].netPay += Number(item.netPayable);
    const empContrib = Number(item.employerPf) + Number(item.employerEsi);
    floorStats[fId].employerContrib += empContrib;
    floorStats[fId].ctc += Number(item.ctc || (Number(item.grossSalary) + empContrib));

    const sName = item.sectionName || 'General Floor';
    if (!floorStats[fId].sections[sName]) {
      floorStats[fId].sections[sName] = { count: 0, gross: 0, netPay: 0 };
    }
    floorStats[fId].sections[sName].count++;
    floorStats[fId].sections[sName].gross += Number(item.grossSalary);
    floorStats[fId].sections[sName].netPay += Number(item.netPayable);

    floorStats[fId].employees.push({
      employeeId: item.employeeId,
      employeeCode: item.employeeCode,
      fullName: item.fullName,
      designation: item.designation,
      sectionName: item.sectionName || 'General',
      grossSalary: Number(item.grossSalary),
      netPayable: Number(item.netPayable),
    });
  }

  console.log('\n--- Sample Floor Aggregations ---');
  for (const fl of floorRows) {
    const stat = floorStats[fl.floorId] || { count: 0, gross: 0, deductions: 0, netPay: 0, employerContrib: 0, ctc: 0 };
    console.log(`[${fl.locationCode}] ${fl.floorName} (Mgr: ${fl.managerName} - ${fl.managerEmployeeCode}): Staff=${stat.count}, Gross=₹${stat.gross.toFixed(2)}, Net=₹${stat.netPay.toFixed(2)}, Employer Contrib=₹${stat.employerContrib.toFixed(2)}`);
  }
}

testFloorQuery().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
