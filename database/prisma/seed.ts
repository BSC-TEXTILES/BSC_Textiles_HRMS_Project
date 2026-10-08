import { 
  PrismaClient, UserRole, LocationStatus, FloorStatus, EmployeeStatus, 
  ShiftStatus, AttendanceStatus, BreakType, BreakStatus, IncentiveType, 
  CalculationType, IncentiveStatus, WeeklyOffDay, FaceVerificationResult, 
  QRCodeType, QRScanPurpose, QRScanResult, ObservationType, ObservationLevel, 
  ObservationStatus, ReactionType, LiveStreamStatus, AuditAction 
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '../.env' });

const Permission = {
  VIEW: 'VIEW',
  ADD: 'ADD',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  ASSIGN: 'ASSIGN',
  EXPORT: 'EXPORT',
  IMPORT: 'IMPORT',
  CONFIGURE: 'CONFIGURE',
  MANAGE: 'MANAGE',
  RECORD: 'RECORD',
  UPLOAD: 'UPLOAD',
  PUBLISH: 'PUBLISH',
  SCAN: 'SCAN',
  VIEW_SENSITIVE_DATA: 'VIEW_SENSITIVE_DATA',
} as const;

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting BSC Textiles HRMS Comprehensive Synthetic Seed...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Super Admin user
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@bsctextiles.com' },
    update: {
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
    },
    create: {
      email: 'admin@bsctextiles.com',
      passwordHash,
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
      isActive: true,
    },
  });
  console.log('✅ Upserted Super Admin');

  // 2. 4 Test Locations (BEL, DAV, SHI, HUB-TEST)
  const locationDefs = [
    { code: 'BEL', name: 'Belagavi Head Store', city: 'Belagavi', state: 'Karnataka', pin: '590001', phone: '0831-2400100', email: 'belagavi@bsctextiles.com', address: 'Khade Bazar, Belagavi' },
    { code: 'DAV', name: 'Davanagere Mega Store', city: 'Davanagere', state: 'Karnataka', pin: '577001', phone: '08192-250100', email: 'davanagere@bsctextiles.com', address: 'P.B. Road, Davanagere' },
    { code: 'SHI', name: 'Shivamogga Flagship', city: 'Shivamogga', state: 'Karnataka', pin: '577201', phone: '08182-270100', email: 'shivamogga@bsctextiles.com', address: 'B.H. Road, Shivamogga' },
    { code: 'HUB-TEST', name: 'Hubballi Test Hub', city: 'Hubballi', state: 'Karnataka', pin: '580020', phone: '0836-2200100', email: 'hubballi.test@bsctextiles.com', address: 'Station Road, Hubballi' },
  ];

  const locations: any[] = [];
  for (const loc of locationDefs) {
    const l = await prisma.location.upsert({
      where: { code: loc.code },
      update: { name: loc.name, city: loc.city, status: LocationStatus.ACTIVE },
      create: {
        ...loc,
        openingTime: new Date('2024-01-01T09:30:00'),
        closingTime: new Date('2024-01-01T20:30:00'),
        status: LocationStatus.ACTIVE,
      },
    });
    locations.push(l);
  }
  console.log(`✅ Upserted ${locations.length} Locations`);

  // 3. Attendance Rules for each location
  for (const loc of locations) {
    await prisma.attendanceRules.upsert({
      where: { locationId: loc.id },
      update: {},
      create: {
        locationId: loc.id,
        loginTime: new Date('2024-01-01T09:30:00'),
        logoutTime: new Date('2024-01-01T18:30:00'),
        gracePeriodMinutes: 5,
        lateThresholdMinutes: 5,
        earlyLoginIncentiveEnabled: true,
        earlyLoginRatePerSecond: 1,
        latePenaltyEnabled: true,
        latePenaltyRatePerSecond: 1,
        overtimeIncentiveEnabled: true,
        overtimeRatePerSecond: 1.5,
        earlyLogoutPenaltyEnabled: false,
        earlyLogoutRatePerSecond: 1,
        lunchDurationMinutes: 100,
        teaDurationMinutes: 20,
        maleLunchMinutes: 100,
        femaleLunchMinutes: 40,
        maleTeaMinutes: 20,
        femaleTeaMinutes: 15,
        faceVerificationThreshold: 85,
        qrDailyTokenEnabled: true,
        qrOneTimeScan: true,
        scannerRoles: ['T_SHOP_OWNER', 'TEA_BREAK_MANAGER', 'HR_MANAGER', 'FLOOR_MANAGER', 'ADMIN'],
      },
    });
  }

  // 4. Floors
  const floorDefs = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];
  const floors: any[] = [];
  for (const loc of locations) {
    for (let i = 0; i < floorDefs.length; i++) {
      let f = await prisma.floor.findFirst({
        where: { locationId: loc.id, floorNumber: i },
      });
      if (!f) {
        f = await prisma.floor.create({
          data: {
            name: floorDefs[i],
            floorNumber: i,
            locationId: loc.id,
            status: FloorStatus.ACTIVE,
          },
        });
      }
      floors.push(f);
    }
  }

  // 5. Departments
  const deptDefs = [
    { name: 'Sales & Retail', code: 'SALES' },
    { name: 'Store Operations', code: 'OPS' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Finance & Accounts', code: 'FIN' },
    { name: 'Inventory & Logistics', code: 'INV' },
    { name: 'Customer Service & Billing', code: 'CS' },
  ];
  const departments: any[] = [];
  for (const loc of locations) {
    for (const d of deptDefs) {
      let dept = await prisma.department.findFirst({
        where: { locationId: loc.id, code: d.code },
      });
      if (!dept) {
        dept = await prisma.department.create({
          data: { ...d, locationId: loc.id },
        });
      }
      departments.push(dept);
    }
  }

  // 6. Sections
  const sectionDefs = ['Silk Sarees', 'Cotton & Fancy Sarees', 'Mens Wear', 'Kids Wear', 'Suits & Ethnic', 'Bridal & Wedding Collection', 'Billing & Reception'];
  const sections: any[] = [];
  for (const loc of locations) {
    const locFloors = floors.filter(f => f.locationId === loc.id);
    const salesDept = departments.find(d => d.locationId === loc.id && d.code === 'SALES');
    for (let i = 0; i < sectionDefs.length; i++) {
      const fl = locFloors[i % locFloors.length];
      const code = `${loc.code}-SEC-${i + 1}`;
      let sec = await prisma.section.findFirst({ where: { locationId: loc.id, code } });
      if (!sec) {
        sec = await prisma.section.create({
          data: {
            name: sectionDefs[i],
            code,
            locationId: loc.id,
            floorId: fl.id,
            departmentId: salesDept?.id,
          },
        });
      }
      sections.push(sec);
    }
  }

  // 7. Selling Points
  const spDefs = [
    'Pure Kanchipuram Silk Counter',
    'Banarasi & Fancy Saree Counter',
    'Cotton & Linen Saree Counter',
    'Mens Ethnic & Sherwani Lounge',
    'Kids Festive Wear Counter',
    'Royal Wedding Bridal Suite',
    'Central Cash & Billing Desk 1',
    'Express Billing Counter 2',
    'Customer Care & Helpdesk',
  ];
  const sellingPoints: any[] = [];
  for (const loc of locations) {
    const locFloors = floors.filter(f => f.locationId === loc.id);
    const locSections = sections.filter(s => s.locationId === loc.id);
    for (let i = 0; i < spDefs.length; i++) {
      const code = `${loc.code}-SP-${i + 1}`;
      let sp = await prisma.sellingPoint.findFirst({ where: { locationId: loc.id, code } });
      if (!sp) {
        sp = await prisma.sellingPoint.create({
          data: {
            name: spDefs[i],
            code,
            locationId: loc.id,
            floorId: locFloors[i % locFloors.length].id,
            sectionId: locSections[i % locSections.length].id,
            category: spDefs[i].includes('Billing') ? 'Billing' : 'Sales',
            targetAmount: 1500000,
          },
        });
      }
      sellingPoints.push(sp);
    }
  }

  // 8. Shifts
  const shiftDefs = [
    { name: 'General Shift', code: 'GENERAL', startTime: '09:30', endTime: '18:30' },
    { name: 'Morning Shift', code: 'MORNING', startTime: '09:00', endTime: '18:00' },
    { name: 'Evening Shift', code: 'EVENING', startTime: '12:00', endTime: '21:00' },
  ];
  const shifts: any[] = [];
  for (const loc of locations) {
    for (const s of shiftDefs) {
      let shift = await prisma.shift.findFirst({ where: { locationId: loc.id, code: s.code } });
      if (!shift) {
        shift = await prisma.shift.create({
          data: {
            ...s,
            locationId: loc.id,
            startTime: new Date(`2024-01-01T${s.startTime}:00`),
            endTime: new Date(`2024-01-01T${s.endTime}:00`),
            status: ShiftStatus.ACTIVE,
          },
        });
      }
      shifts.push(shift);
    }
  }

  // 9. Break Rules
  const breakRuleDefs = [
    { breakType: BreakType.LUNCH, durationMinutes: 100, employeeGroup: 'male' },
    { breakType: BreakType.LUNCH, durationMinutes: 40, employeeGroup: 'female' },
    { breakType: BreakType.TEA, durationMinutes: 20, employeeGroup: 'male' },
    { breakType: BreakType.TEA, durationMinutes: 15, employeeGroup: 'female' },
    { breakType: BreakType.OTHER, durationMinutes: 15, maxOccurrences: 2 },
  ];
  for (const loc of locations) {
    for (const br of breakRuleDefs) {
      const existing = await prisma.breakRule.findFirst({
        where: { locationId: loc.id, breakType: br.breakType, employeeGroup: br.employeeGroup },
      });
      if (!existing) {
        await prisma.breakRule.create({
          data: { ...br, locationId: loc.id },
        });
      }
    }
  }

  // 10. Incentive & Penalty Rules
  for (const loc of locations) {
    const incRules = [
      { name: 'Early Login Incentive', incentiveType: IncentiveType.EARLY_LOGIN, calculationType: CalculationType.PER_SECOND, amount: 1 },
      { name: 'Sales Target Bonus', incentiveType: IncentiveType.SALES, calculationType: CalculationType.PERCENTAGE, percentage: 2.5, targetAmount: 1000000 },
      { name: 'Full Attendance Bonus', incentiveType: IncentiveType.ATTENDANCE, calculationType: CalculationType.FIXED_AMOUNT, amount: 1000 },
      { name: 'Store Performance Incentive', incentiveType: IncentiveType.PERFORMANCE, calculationType: CalculationType.PERFORMANCE_BASED },
    ];
    for (const ir of incRules) {
      const existing = await prisma.incentiveRule.findFirst({
        where: { locationId: loc.id, name: ir.name },
      });
      if (!existing) {
        await prisma.incentiveRule.create({
          data: {
            ...ir,
            locationId: loc.id,
            effectiveFrom: new Date('2024-01-01'),
            status: IncentiveStatus.ACTIVE,
            createdById: superAdmin.id,
          },
        });
      }
    }

    const penRules = [
      { name: 'Late Arrival Deduction', penaltyType: 'LATE_ARRIVAL', calculationType: CalculationType.PER_SECOND, amount: 1 },
      { name: 'Break Overrun Deduction', penaltyType: 'BREAK_OVERRUN', calculationType: CalculationType.PER_MINUTE, amount: 5 },
      { name: 'Unexcused Early Logout', penaltyType: 'EARLY_LOGOUT', calculationType: CalculationType.FIXED_AMOUNT, amount: 200 },
    ];
    for (const pr of penRules) {
      const existing = await prisma.penaltyRule.findFirst({
        where: { locationId: loc.id, name: pr.name },
      });
      if (!existing) {
        await prisma.penaltyRule.create({
          data: {
            ...pr,
            locationId: loc.id,
            effectiveFrom: new Date('2024-01-01'),
            isActive: true,
          },
        });
      }
    }
  }

  // 11. 35 Test Employees with "TEST-EMP-" format across all 4 locations
  const rawEmployees = [
    { code: 'TEST-EMP-001', firstName: 'Rajesh', lastName: 'Kumar', email: 'rajesh.kumar@bsctextiles.com', gender: 'male', role: UserRole.SALES_EMPLOYEE, locCode: 'BEL' },
    { code: 'TEST-EMP-002', firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'BEL' },
    { code: 'TEST-EMP-003', firstName: 'Amit', lastName: 'Patel', email: 'amit.patel@bsctextiles.com', gender: 'male', role: UserRole.FLOOR_MANAGER, locCode: 'BEL' },
    { code: 'TEST-EMP-004', firstName: 'Kavita', lastName: 'Bhat', email: 'kavita.bhat@bsctextiles.com', gender: 'female', role: UserRole.HR_EXECUTIVE, locCode: 'BEL' },
    { code: 'TEST-EMP-005', firstName: 'Ramesh', lastName: 'Gowda', email: 'ramesh.gowda@bsctextiles.com', gender: 'male', role: UserRole.TEA_BREAK_MANAGER, locCode: 'BEL' },
    { code: 'TEST-EMP-006', firstName: 'Geeta', lastName: 'Kulkarni', email: 'geeta.kulkarni@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'BEL' },
    { code: 'TEST-EMP-007', firstName: 'Suresh', lastName: 'Reddy', email: 'suresh.reddy@bsctextiles.com', gender: 'male', role: UserRole.SALES_EMPLOYEE, locCode: 'DAV' },
    { code: 'TEST-EMP-008', firstName: 'Lakshmi', lastName: 'Devi', email: 'lakshmi.devi@bsctextiles.com', gender: 'female', role: UserRole.TEA_BREAK_MANAGER, locCode: 'DAV' },
    { code: 'TEST-EMP-009', firstName: 'Manjunath', lastName: 'Hebbar', email: 'manjunath.hebbar@bsctextiles.com', gender: 'male', role: UserRole.FLOOR_MANAGER, locCode: 'DAV' },
    { code: 'TEST-EMP-010', firstName: 'Ananya', lastName: 'Hegde', email: 'ananya.hegde@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'DAV' },
    { code: 'TEST-EMP-011', firstName: 'Chethan', lastName: 'Kumar', email: 'chethan.kumar@bsctextiles.com', gender: 'male', role: UserRole.T_SHOP_OWNER, locCode: 'DAV' },
    { code: 'TEST-EMP-012', firstName: 'Divya', lastName: 'Shree', email: 'divya.shree@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'DAV' },
    { code: 'TEST-EMP-013', firstName: 'Vikram', lastName: 'Singh', email: 'vikram.singh@bsctextiles.com', gender: 'male', role: UserRole.HR_MANAGER, locCode: 'SHI' },
    { code: 'TEST-EMP-014', firstName: 'Sneha', lastName: 'Rao', email: 'sneha.rao@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'SHI' },
    { code: 'TEST-EMP-015', firstName: 'Raghav', lastName: 'Prasad', email: 'raghav.prasad@bsctextiles.com', gender: 'male', role: UserRole.FLOOR_MANAGER, locCode: 'SHI' },
    { code: 'TEST-EMP-016', firstName: 'Poornima', lastName: 'Nayak', email: 'poornima.nayak@bsctextiles.com', gender: 'female', role: UserRole.TEA_BREAK_MANAGER, locCode: 'SHI' },
    { code: 'TEST-EMP-017', firstName: 'Mohan', lastName: 'Das', email: 'mohan.das@bsctextiles.com', gender: 'male', role: UserRole.SALES_EMPLOYEE, locCode: 'SHI' },
    { code: 'TEST-EMP-018', firstName: 'Rekha', lastName: 'Shetty', email: 'rekha.shetty@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'SHI' },
    { code: 'TEST-EMP-019', firstName: 'Karthik', lastName: 'Nair', email: 'karthik.nair@bsctextiles.com', gender: 'male', role: UserRole.LOCATION_MANAGER, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-020', firstName: 'Deepa', lastName: 'Shetty', email: 'deepa.shetty@bsctextiles.com', gender: 'female', role: UserRole.HR_EXECUTIVE, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-021', firstName: 'Girish', lastName: 'Kamat', email: 'girish.kamat@bsctextiles.com', gender: 'male', role: UserRole.FLOOR_MANAGER, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-022', firstName: 'Swathi', lastName: 'Pai', email: 'swathi.pai@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-023', firstName: 'Santosh', lastName: 'Pujari', email: 'santosh.pujari@bsctextiles.com', gender: 'male', role: UserRole.T_SHOP_OWNER, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-024', firstName: 'Rashmi', lastName: 'Verma', email: 'rashmi.verma@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-025', firstName: 'Naveen', lastName: 'Deshpande', email: 'naveen.deshpande@bsctextiles.com', gender: 'male', role: UserRole.SALES_EMPLOYEE, locCode: 'BEL' },
    { code: 'TEST-EMP-026', firstName: 'Bhavya', lastName: 'M', email: 'bhavya.m@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'BEL' },
    { code: 'TEST-EMP-027', firstName: 'Pradeep', lastName: 'Chavan', email: 'pradeep.chavan@bsctextiles.com', gender: 'male', role: UserRole.PAYROLL_MANAGER, locCode: 'BEL' },
    { code: 'TEST-EMP-028', firstName: 'Vinutha', lastName: 'K', email: 'vinutha.k@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'DAV' },
    { code: 'TEST-EMP-029', firstName: 'Prakash', lastName: 'G', email: 'prakash.g@bsctextiles.com', gender: 'male', role: UserRole.TEAM_LEAD, locCode: 'DAV' },
    { code: 'TEST-EMP-030', firstName: 'Archana', lastName: 'S', email: 'archana.s@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'SHI' },
    { code: 'TEST-EMP-031', firstName: 'Harish', lastName: 'V', email: 'harish.v@bsctextiles.com', gender: 'male', role: UserRole.TEAM_LEAD, locCode: 'SHI' },
    { code: 'TEST-EMP-032', firstName: 'Roopa', lastName: 'N', email: 'roopa.n@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-033', firstName: 'Sunil', lastName: 'B', email: 'sunil.b@bsctextiles.com', gender: 'male', role: UserRole.HR_AUDITOR, locCode: 'HUB-TEST' },
    { code: 'TEST-EMP-034', firstName: 'Megha', lastName: 'J', email: 'megha.j@bsctextiles.com', gender: 'female', role: UserRole.SALES_EMPLOYEE, locCode: 'BEL' },
    { code: 'TEST-EMP-035', firstName: 'Vijay', lastName: 'K', email: 'vijay.k@bsctextiles.com', gender: 'male', role: UserRole.SALES_EMPLOYEE, locCode: 'SHI' },
  ];

  const employees: any[] = [];
  for (const empData of rawEmployees) {
    const loc = locations.find(l => l.code === empData.locCode) || locations[0];
    const locFloors = floors.filter(f => f.locationId === loc.id);
    const locDepts = departments.filter(d => d.locationId === loc.id);
    const locShifts = shifts.filter(s => s.locationId === loc.id);
    const locSellingPoints = sellingPoints.filter(sp => sp.locationId === loc.id);

    let emp = await prisma.employee.findFirst({
      where: {
        OR: [
          { employeeCode: empData.code },
          { email: empData.email },
        ],
      },
    });

    if (emp) {
      emp = await prisma.employee.update({
        where: { id: emp.id },
        data: {
          employeeCode: empData.code,
          firstName: empData.firstName,
          lastName: empData.lastName,
          fullName: `${empData.firstName} ${empData.lastName}`,
          locationId: loc.id,
          role: empData.role,
        },
      });
    } else {
      emp = await prisma.employee.create({
        data: {
          employeeCode: empData.code,
          firstName: empData.firstName,
          lastName: empData.lastName,
          fullName: `${empData.firstName} ${empData.lastName}`,
          email: empData.email,
          gender: empData.gender,
          phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
          locationId: loc.id,
          floorId: locFloors[0]?.id,
          departmentId: locDepts[0]?.id,
          shiftId: locShifts[0]?.id,
          role: empData.role,
          status: EmployeeStatus.ACTIVE,
          designation: empData.role.replace(/_/g, ' '),
          joiningDate: new Date('2023-01-15'),
        },
      });
    }

    // Attach user account
    await prisma.user.upsert({
      where: { email: empData.email },
      update: {
        role: empData.role,
        locationId: loc.id,
        employeeId: emp.id,
      },
      create: {
        email: empData.email,
        passwordHash,
        fullName: `${empData.firstName} ${empData.lastName}`,
        role: empData.role,
        permissions: [Permission.VIEW, Permission.RECORD, Permission.SCAN],
        employeeId: emp.id,
        locationId: loc.id,
        isActive: true,
      },
    });

    // Face Profile
    const existingFace = await prisma.faceProfile.findFirst({ where: { employeeId: emp.id } });
    if (!existingFace) {
      await prisma.faceProfile.create({
        data: {
          employeeId: emp.id,
          faceData: Buffer.from(`mock-face-profile-${emp.employeeCode}`),
          isActive: true,
        },
      });
    }

    // QR Code (Permanent & Daily)
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const dailyToken = `DAILY-${emp.employeeCode}-${todayStr}`;
    const permToken = `EMP-${emp.employeeCode}`;

    let empQR = await prisma.qRCode.findFirst({ where: { token: permToken } });
    if (!empQR) {
      empQR = await prisma.qRCode.create({
        data: {
          token: permToken,
          type: QRCodeType.EMPLOYEE,
          employeeId: emp.id,
          locationId: loc.id,
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2026-12-31'),
        },
      });
    }

    let dailyQR = await prisma.qRCode.findFirst({ where: { token: dailyToken } });
    if (!dailyQR) {
      dailyQR = await prisma.qRCode.create({
        data: {
          token: dailyToken,
          type: QRCodeType.DAILY,
          employeeId: emp.id,
          locationId: loc.id,
          validFrom: new Date(new Date().setHours(0, 0, 0, 0)),
          validTo: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      });
    }

    await prisma.employee.update({
      where: { id: emp.id },
      data: { qrCodeId: empQR.id, dailyQRCodeId: dailyQR.id },
    });

    employees.push({ ...emp, dailyQRCodeId: dailyQR.id });
  }
  console.log(`✅ Upserted ${employees.length} Test Employees with Accounts & Credentials`);

  // 12. 30 Days Attendance for Employees
  console.log('⏳ Cleaning transient records and generating 30 Days Attendance History...');
  await prisma.liveStreamMessage.deleteMany({});
  await prisma.liveStream.deleteMany({});
  await prisma.observationReaction.deleteMany({});
  await prisma.observationComment.deleteMany({});
  await prisma.observation.deleteMany({});
  await prisma.employeeBreak.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.faceVerification.deleteMany({});
  await prisma.qRScanRecord.deleteMany({});
  await prisma.payrollItem.deleteMany({});
  await prisma.payrollRun.deleteMany({});

  const now = new Date();
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const recordDate = new Date(now);
    recordDate.setDate(recordDate.getDate() - dayOffset);
    recordDate.setHours(0, 0, 0, 0);

    const isSunday = recordDate.getDay() === 0;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const existing = await prisma.attendance.findFirst({
        where: { employeeId: emp.id, attendanceDate: recordDate },
      });
      if (existing) continue;

      if (isSunday) {
        await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            locationId: emp.locationId,
            attendanceDate: recordDate,
            status: AttendanceStatus.WEEKLY_OFF,
          },
        });
        continue;
      }

      // Pattern:
      // Employee 0: Early login by 10 mins (600s) -> Early login incentive ₹600 @ ₹1/s
      // Employee 1: Late login by 8 mins (480s) -> Late penalty ₹480 @ ₹1/s
      // Employee 2: Overtime by 30 mins
      // Others: On-time or random variance
      const scheduledLogin = new Date(recordDate);
      scheduledLogin.setHours(9, 30, 0, 0);
      const scheduledLogout = new Date(recordDate);
      scheduledLogout.setHours(18, 30, 0, 0);

      let actualLogin = new Date(scheduledLogin);
      let actualLogout = new Date(scheduledLogout);
      let earlySeconds = 0;
      let lateSeconds = 0;
      let overtimeSeconds = 0;
      let status = AttendanceStatus.PRESENT;

      if (i % 7 === 0) {
        // Early login: 10 mins early (600s)
        earlySeconds = 600;
        actualLogin = new Date(scheduledLogin.getTime() - earlySeconds * 1000);
      } else if (i % 7 === 1) {
        // Late login: 12 mins late (720s)
        lateSeconds = 720;
        actualLogin = new Date(scheduledLogin.getTime() + lateSeconds * 1000);
        status = AttendanceStatus.LATE;
      } else if (i % 7 === 2) {
        // Overtime: 40 mins overtime
        overtimeSeconds = 40 * 60;
        actualLogout = new Date(scheduledLogout.getTime() + overtimeSeconds * 1000);
      } else if (i % 7 === 5 && dayOffset > 20) {
        // Absent day in history
        await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            locationId: emp.locationId,
            attendanceDate: recordDate,
            status: AttendanceStatus.ABSENT,
          },
        });
        continue;
      }

      const earlyIncentive = earlySeconds * 1;
      const latePenalty = lateSeconds * 1;
      const overtimeIncentive = overtimeSeconds * 1.5;

      const att = await prisma.attendance.create({
        data: {
          employeeId: emp.id,
          locationId: emp.locationId,
          shiftId: emp.shiftId,
          attendanceDate: recordDate,
          scheduledLogin,
          actualLogin,
          scheduledLogout,
          actualLogout,
          earlyLoginSeconds: earlySeconds,
          lateLoginSeconds: lateSeconds,
          earlyLogoutSeconds: 0,
          overtimeSeconds,
          totalWorkingSeconds: 9 * 3600 + overtimeSeconds - lateSeconds + earlySeconds,
          breakSeconds: 120 * 60,
          effectiveWorkingSeconds: 7 * 3600 + overtimeSeconds,
          earlyLoginIncentive: earlyIncentive,
          lateLoginPenalty: latePenalty,
          overtimeIncentive,
          earlyLogoutPenalty: 0,
          status,
          faceVerified: true,
          faceMatchPercentage: 92.5 + (i % 7),
        },
      });

      // Also create break for today
      if (dayOffset === 0 && (i % 5 === 0 || i % 5 === 1)) {
        await prisma.employeeBreak.create({
          data: {
            employeeId: emp.id,
            breakType: i % 2 === 0 ? BreakType.LUNCH : BreakType.TEA,
            breakDate: recordDate,
            startTime: new Date(Date.now() - 15 * 60 * 1000),
            allowedDuration: i % 2 === 0 ? 40 : 20,
            status: BreakStatus.ACTIVE,
          },
        });
      }
    }
  }
  console.log('✅ Generated 30 Days Attendance Records');

  // 13. Face Verification Logs with realistic test confidence scores
  console.log('⏳ Generating Face Verification Records...');
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    // Verified record
    await prisma.faceVerification.create({
      data: {
        employeeId: emp.id,
        locationId: emp.locationId,
        matchPercentage: 96.4 + (i % 3) * 1.2,
        threshold: 85.0,
        result: FaceVerificationResult.VERIFIED,
      },
    });

    // Occasional failed attempt
    if (i % 4 === 0) {
      await prisma.faceVerification.create({
        data: {
          employeeId: emp.id,
          locationId: emp.locationId,
          matchPercentage: 71.2,
          threshold: 85.0,
          result: FaceVerificationResult.FAILED,
          purpose: 'Match score below security threshold 85%',
        },
      });
    }
  }
  console.log('✅ Created Face Verification Records');

  // 14. QR Scan Records (Successful, Duplicate, Expired, Location mismatch)
  console.log('⏳ Generating QR Scan Records...');
  const teaOwner = await prisma.user.findFirst({ where: { role: UserRole.TEA_BREAK_MANAGER } });
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const sp = sellingPoints.find(sp => sp.locationId === emp.locationId);

    if (teaOwner && sp && emp.dailyQRCodeId) {
      // 1. Success scan
      await prisma.qRScanRecord.create({
        data: {
          qrCodeId: emp.dailyQRCodeId,
          employeeId: emp.id,
          scannerId: teaOwner.id,
          locationId: emp.locationId,
          sellingPointId: sp.id,
          purpose: QRScanPurpose.TEA_BREAK_START,
          result: QRScanResult.SUCCESS,
        },
      });

      // 2. Duplicate attempt
      if (i % 5 === 0) {
        await prisma.qRScanRecord.create({
          data: {
            qrCodeId: emp.dailyQRCodeId,
            employeeId: emp.id,
            scannerId: teaOwner.id,
            locationId: emp.locationId,
            sellingPointId: sp.id,
            purpose: QRScanPurpose.TEA_BREAK_START,
            result: QRScanResult.ALREADY_SCANNED,
            failureReason: 'This QR code has already been scanned for today.',
          },
        });
      }
    }
  }
  console.log('✅ Created QR Scan Records');

  // 15. Observations & Comments & Reactions
  console.log('⏳ Generating Observations & Threads...');
  const observationDefs = [
    { title: 'Exceptional Bridal Sales Presentation', level: ObservationLevel.EXCELLENT, type: ObservationType.CUSTOMER_SERVICE, desc: 'Flawlessly assisted high-value wedding party, closed INR 3.8L order with high customer satisfaction.' },
    { title: 'Standard Uniform & Grooming Notice', level: ObservationLevel.NEEDS_IMPROVEMENT, type: ObservationType.GROOMING, desc: 'ID badge was missing and footwear not compliant with retail store guidelines.' },
    { title: 'Silk Saree Counter Organization', level: ObservationLevel.GOOD, type: ObservationType.STORE_STANDARD, desc: 'Maintained neat folding standards during peak rush hours.' },
    { title: 'Critical Billing System Delay', level: ObservationLevel.CRITICAL, type: ObservationType.STORE_STANDARD, desc: 'Failure to alert floor manager when terminal 2 barcode scanner disconnected.' },
  ];

  for (let i = 0; i < observationDefs.length; i++) {
    const obDef = observationDefs[i];
    const emp = employees[i];
    const obs = await prisma.observation.create({
      data: {
        description: `[${obDef.title}] ${obDef.desc}`,
        level: obDef.level,
        observationType: obDef.type,
        score: obDef.level === ObservationLevel.EXCELLENT ? 95 : obDef.level === ObservationLevel.GOOD ? 80 : 50,
        status: ObservationStatus.OPEN,
        employeeId: emp.id,
        locationId: emp.locationId,
        createdById: superAdmin.id,
      },
    });

    // Add comment
    await prisma.observationComment.create({
      data: {
        observationId: obs.id,
        userId: superAdmin.id,
        content: 'Follow-up discussion scheduled with floor manager.',
      },
    });

    // Add reaction
    await prisma.observationReaction.create({
      data: {
        observationId: obs.id,
        userId: superAdmin.id,
        reactionType: ReactionType.ACKNOWLEDGED,
      },
    });
  }
  console.log('✅ Created Observations');

  // 16. Live Streams with Messages and Viewers
  console.log('⏳ Generating Live Streams...');
  const stream = await prisma.liveStream.create({
    data: {
      title: 'Grand Silk Department Live Floor Inspection',
      description: 'Real-time monitoring of silk saree presentation and sales floor counters.',
      status: LiveStreamStatus.LIVE,
      hostId: superAdmin.id,
      locationId: locations[0].id,
      streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      streamKey: `stream-key-${Date.now()}`,
      viewerCount: 14,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  await prisma.liveStreamMessage.create({
    data: {
      streamId: stream.id,
      userId: superAdmin.id,
      content: 'Attention Floor Managers: Ensure Silk Counter A is adequately staffed for the festival surge.',
    },
  });
  console.log('✅ Created Live Stream');

  // 17. Payroll Run for current month
  console.log('⏳ Generating Payroll Run...');
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const payrollRun = await prisma.payrollRun.create({
    data: {
      periodStart: startMonth,
      periodEnd: endMonth,
      status: 'APPROVED',
      processedBy: 'Super Admin',
      processedAt: new Date(),
    },
  });

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const basic = 28000 + (i % 5) * 3000;
    const early = i % 7 === 0 ? 1200 : 0;
    const attendance = 1000;
    const deductions = Math.round(basic * 0.12);
    const penalties = i % 7 === 1 ? 480 : 0;
    const net = basic + early + attendance - deductions - penalties;

    await prisma.payrollItem.create({
      data: {
        payrollRunId: payrollRun.id,
        employeeId: emp.id,
        basicSalary: basic,
        earlyIncentive: early,
        attendanceIncentive: attendance,
        performanceIncentive: 0,
        salesIncentive: 0,
        overtime: 0,
        deductions,
        penalties,
        netPay: net,
        calculationDetails: {
          basic,
          earlyIncentive: early,
          attendanceIncentive: attendance,
          pfDeduction: deductions,
          penalties,
        },
        status: 'APPROVED',
      },
    });
  }
  console.log('✅ Created Payroll Run and Items');

  // 18. Audit Logs
  await prisma.auditLog.create({
    data: {
      userId: superAdmin.id,
      action: AuditAction.CREATE,
      entityType: 'SystemBootstrap',
      entityId: 'SEED-INITIAL',
      newValue: { timestamp: new Date().toISOString(), status: 'Complete synthetic seed loaded' },
    },
  });

  console.log('🎉 BSC Textiles HRMS Seed Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });