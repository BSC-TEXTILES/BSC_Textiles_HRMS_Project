import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth.js';
import { pool } from '../db.js';

export const searchRouter = Router();

// Module definitions for Sidebar Search
const SIDEBAR_MODULES = [
  {
    title: 'Executive Dashboard',
    description: 'Executive Workforce & Operations Dashboard, Hubs & Store Outlets',
    href: '/dashboard',
    category: 'Core Operations',
    keywords: ['executive', 'dashboard', 'operations', 'karnataka', 'hubs', 'outlets', 'overview'],
    minRole: 'ALL',
  },
  {
    title: 'My Desk Self-Service',
    description: 'Employee personal self-service portal, check-in, leaves and breaks',
    href: '/my-desk',
    category: 'Core Operations',
    keywords: ['desk', 'self', 'service', 'punch', 'my desk', 'clock in', 'custody', 'assets'],
    minRole: 'ALL',
  },
  {
    title: 'All Employees',
    description: 'Workforce Directory & Staff Records across Karnataka hubs',
    href: '/employees',
    category: 'Workforce Directory',
    keywords: ['employees', 'staff', 'directory', 'directory & staff', 'roster', 'workforce', 'add employee'],
    minRole: 'ALL',
  },
  {
    title: 'Profile 360 & Dossier',
    description: 'Comprehensive staff profile, employee dossier and employment history',
    href: '/employees/profile',
    category: 'Workforce Directory',
    keywords: ['profile', '360', 'dossier', 'staff profile', 'employee dossier', 'employee records'],
    minRole: 'ALL',
  },
  {
    title: 'Employee Documents',
    description: 'Secure digital document vault, confidential employee uploads and verification',
    href: '/employees/documents',
    category: 'Workforce Directory',
    keywords: ['documents', 'vault', 'files', 'upload', 'employee documents', 'dossier files'],
    minRole: 'HR',
  },
  {
    title: 'Departments & Units',
    description: 'Karnataka regional enterprise departments, floor units and organization hierarchy',
    href: '/organization/departments',
    category: 'Workforce Directory',
    keywords: ['departments', 'units', 'organization', 'hierarchy', 'store operations', 'sales', 'retail'],
    minRole: 'ALL',
  },
  {
    title: 'Former Staff & F&F Settlement',
    description: 'Separation ledger, exit clearance tasks and Full & Final settlements',
    href: '/employees/former',
    category: 'Workforce Directory',
    keywords: ['former', 'ex', 'resigned', 'f&f', 'full and final', 'settlement', 'clearance', 'exit'],
    minRole: 'HR',
  },
  {
    title: 'KYC Verification',
    description: 'DigiLocker PKCE identity verification, Aadhaar and PAN compliance queue',
    href: '/operations/kyc',
    category: 'KYC & DigiLocker',
    keywords: ['kyc', 'digilocker', 'aadhaar', 'pan', 'identity', 'verification', 'compliance'],
    minRole: 'HR',
  },
  {
    title: 'Digital Document Verification',
    description: 'Digital identity checks and verification decisions queue',
    href: '/employees/profile?tab=documents',
    category: 'KYC & DigiLocker',
    keywords: ['digital', 'verification', 'uidai', 'documents', 'kyc verification'],
    minRole: 'HR',
  },
  {
    title: 'Digital QR Passes',
    description: 'Daily dynamic employee QR pass generation and terminal validation',
    href: '/attendance/qr-codes',
    category: 'QR Code Attendance',
    keywords: ['qr', 'qr codes', 'pass', 'passes', 'digital qr', 'barcode', 'terminal'],
    minRole: 'ALL',
  },
  {
    title: 'Contactless QR Scanner',
    description: 'Kiosk and mobile scanner for touchless attendance recording',
    href: '/operations/qr-scanner',
    category: 'QR Code Attendance',
    keywords: ['scanner', 'scan', 'kiosk', 'touchless', 'contactless'],
    minRole: 'ALL',
  },
  {
    title: 'Biometric Punches',
    description: 'Real-time biometric punch ledger, fingerprint and face terminal sync',
    href: '/attendance/punches',
    category: 'Time & Attendance',
    keywords: ['biometric', 'punches', 'fingerprint', 'terminal sync', 'face', 'punch ledger'],
    minRole: 'HR',
  },
  {
    title: 'Floor Shifts & Rosters',
    description: 'Showroom shift scheduling, timings, shift windows and rosters',
    href: '/attendance/shifts',
    category: 'Time & Attendance',
    keywords: ['shifts', 'roster', 'scheduling', 'timings', 'shift windows', 'day shift', 'evening shift'],
    minRole: 'ALL',
  },
  {
    title: 'Late & Fine Management',
    description: 'Grace period tracking, late fine deductions, waivers and audit approvals',
    href: '/attendance/late-fines',
    category: 'Time & Attendance',
    keywords: ['late', 'fines', 'grace period', 'waiver', 'deductions', 'late attendance'],
    minRole: 'HR',
  },
  {
    title: 'Lunch & Break Tracker',
    description: 'Daily staff break cycle logs, duration overages and compliance',
    href: '/attendance/breaks',
    category: 'Time & Attendance',
    keywords: ['lunch', 'break', 'tea', 'tracker', 'break duration', 'overage'],
    minRole: 'ALL',
  },
  {
    title: 'Punch Corrections',
    description: 'Missing punch regularization requests, approvals and manager workflow',
    href: '/attendance/corrections',
    category: 'Time & Attendance',
    keywords: ['corrections', 'regularization', 'missing punch', 'punch correction', 'approval'],
    minRole: 'ALL',
  },
  {
    title: 'Attendance Register',
    description: 'Monthly muster roll, daily attendance matrix, present and absent ledger',
    href: '/attendance/register',
    category: 'Time & Attendance',
    keywords: ['register', 'muster roll', 'matrix', 'attendance register', 'attendance calculation'],
    minRole: 'ALL',
  },
  {
    title: 'Attendance Calculation',
    description: 'Automated shift-rule computation engine and monthly attendance summaries',
    href: '/attendance/calculation',
    category: 'Time & Attendance',
    keywords: ['calculation', 'engine', 'shift-rule', 'attendance calculation'],
    minRole: 'HR',
  },
  {
    title: 'Payroll Dashboard',
    description: 'Monthly salary disbursements, gross pay, deductions and bank export',
    href: '/payroll',
    category: 'Payroll Management',
    keywords: ['payroll', 'salary', 'disbursement', 'gross pay', 'payslip', 'wages'],
    minRole: 'HR',
  },
  {
    title: 'Employee Payslips',
    description: 'Itemized monthly payslip generation, PDF downloads and earnings summary',
    href: '/payroll/payslips',
    category: 'Payroll Management',
    keywords: ['payslips', 'salary slip', 'itemized', 'earnings'],
    minRole: 'ALL',
  },
  {
    title: 'Salary Structure',
    description: 'Basic pay, HRA, statutory allowances, PF, and ESI configuration',
    href: '/payroll/salary-structure',
    category: 'Payroll Management',
    keywords: ['structure', 'hra', 'allowances', 'pf', 'esi', 'statutory'],
    minRole: 'HR',
  },
  {
    title: 'Payroll Reports',
    description: 'Comprehensive wage registers, bank upload files and tax statements',
    href: '/payroll/reports',
    category: 'Payroll Management',
    keywords: ['payroll reports', 'wage register', 'tax statements'],
    minRole: 'HR',
  },
  {
    title: 'Leave Approvals',
    description: 'Leave requests queue, casual leave (CL), sick leave (SL), earned leave (EL)',
    href: '/leaves',
    category: 'Leave & Incentives',
    keywords: ['leaves', 'leave approvals', 'cl', 'sl', 'el', 'vacation', 'leave requests'],
    minRole: 'ALL',
  },
  {
    title: 'Incentive Calculation',
    description: 'Sales commissions, counter turnover bonus and performance incentives',
    href: '/incentives/calculation',
    category: 'Leave & Incentives',
    keywords: ['incentives', 'commissions', 'bonus', 'turnover', 'sales bonus'],
    minRole: 'HR',
  },
  {
    title: 'Face Verification',
    description: 'AI facial biometrics confidence matching and live anti-spoof checks',
    href: '/operations/face-verification',
    category: 'Operations & Audits',
    keywords: ['face', 'verification', 'facial biometrics', 'anti-spoof', 'face match'],
    minRole: 'HR',
  },
  {
    title: 'Selling Points & Audits',
    description: 'Store floors, billing points, cashier stations and salesman attribution',
    href: '/operations/selling-points',
    category: 'Operations & Audits',
    keywords: ['selling points', 'counters', 'pos', 'cashier', 'salesman attribution', 'floors'],
    minRole: 'ALL',
  },
  {
    title: 'Observation Module',
    description: 'Store floor supervision audits, visual inspection remarks and tags',
    href: '/operations/observations',
    category: 'Operations & Audits',
    keywords: ['observations', 'supervision', 'audit', 'remarks', 'inspection'],
    minRole: 'HR',
  },
  {
    title: 'Governance Reports',
    description: 'Statutory compliance reports, attendance analytics and labor law summaries',
    href: '/reports',
    category: 'Operations & Audits',
    keywords: ['reports', 'governance', 'compliance', 'analytics', 'labor law'],
    minRole: 'HR',
  },
  {
    title: 'Audit Logs & Security',
    description: 'Immutable system audit ledger, login attempts and privileged action records',
    href: '/admin/audit-logs',
    category: 'Operations & Audits',
    keywords: ['audit logs', 'security', 'immutable', 'login attempts', 'privileged actions'],
    minRole: 'SUPER_ADMIN',
  },
  {
    title: 'System Settings',
    description: 'Enterprise organization configuration, MFA policies and global preferences',
    href: '/admin/settings',
    category: 'Operations & Audits',
    keywords: ['settings', 'configuration', 'mfa', 'preferences', 'enterprise setup'],
    minRole: 'SUPER_ADMIN',
  },
];

function canUserAccessModule(userRole: string, minRole: string): boolean {
  if (userRole === 'SUPER_ADMIN') return true;
  if (minRole === 'ALL') return true;
  if (minRole === 'HR') {
    return ['HR_MANAGER', 'HR_EXECUTIVE', 'LOCATION_MANAGER', 'DEPARTMENT_MANAGER'].includes(userRole);
  }
  if (minRole === 'SUPER_ADMIN') {
    return userRole === 'SUPER_ADMIN';
  }
  return false;
}

function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return 'Not available';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `+91 ******${digits.slice(-4)}`;
  }
  return '******';
}

/**
 * GET /api/search?q=&limit=
 * Unified Global Search across all HRMS modules and records
 */
searchRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rawQuery = (req.query.q as string) || (req.query.query as string) || '';
    const query = rawQuery.trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 5, 1), 50);

    if (query.length < 2) {
      return res.json({
        query,
        totalCount: 0,
        groups: [],
      });
    }

    const term = `%${query.toLowerCase()}%`;
    const userRole = req.user?.role || 'EMPLOYEE';
    const canViewHrData = canUserAccessModule(userRole, 'HR');

    // 1. Employees Search
    let employeeItems: any[] = [];
    let employeeTotal = 0;
    try {
      const [empRows]: any = await pool.query(
        `SELECT e.id, e.employeeCode, e.firstName, e.lastName, e.fullName, e.phone, e.email,
                e.designation, e.role, e.status, d.name AS departmentName, l.name AS locationName, l.code AS locationCode
         FROM employee e
         LEFT JOIN department d ON e.departmentId = d.id
         LEFT JOIN location l ON e.locationId = l.id
         WHERE (
           LOWER(e.employeeCode) LIKE ? OR
           LOWER(e.firstName) LIKE ? OR
           LOWER(e.lastName) LIKE ? OR
           LOWER(e.fullName) LIKE ? OR
           LOWER(e.email) LIKE ? OR
           e.phone LIKE ? OR
           LOWER(e.designation) LIKE ? OR
           LOWER(d.name) LIKE ? OR
           LOWER(l.name) LIKE ?
         )
         ORDER BY e.updatedAt DESC
         LIMIT ?`,
        [term, term, term, term, term, term, term, term, term, limit]
      );

      const [empCountRow]: any = await pool.query(
        `SELECT COUNT(*) AS total
         FROM employee e
         LEFT JOIN department d ON e.departmentId = d.id
         LEFT JOIN location l ON e.locationId = l.id
         WHERE (
           LOWER(e.employeeCode) LIKE ? OR
           LOWER(e.firstName) LIKE ? OR
           LOWER(e.lastName) LIKE ? OR
           LOWER(e.fullName) LIKE ? OR
           LOWER(e.email) LIKE ? OR
           e.phone LIKE ? OR
           LOWER(e.designation) LIKE ? OR
           LOWER(d.name) LIKE ? OR
           LOWER(l.name) LIKE ?
         )`,
        [term, term, term, term, term, term, term, term, term]
      );
      employeeTotal = empCountRow[0]?.total || 0;

      employeeItems = (empRows || []).map((e: any) => {
        let matchedField = 'Name';
        const ql = query.toLowerCase();
        if (e.employeeCode && e.employeeCode.toLowerCase().includes(ql)) matchedField = 'Employee ID';
        else if (e.email && e.email.toLowerCase().includes(ql)) matchedField = 'Email';
        else if (e.phone && e.phone.includes(query)) matchedField = 'Mobile';
        else if (e.designation && e.designation.toLowerCase().includes(ql)) matchedField = 'Designation';
        else if (e.departmentName && e.departmentName.toLowerCase().includes(ql)) matchedField = 'Department';
        else if (e.locationName && e.locationName.toLowerCase().includes(ql)) matchedField = 'Location';

        const name = e.fullName || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Employee';
        const code = e.employeeCode || 'EMP';
        const dept = e.departmentName || 'General Staff';
        const loc = e.locationName || 'Karnataka';

        return {
          id: e.id,
          type: 'employee',
          targetRoute: `/employees/profile/${e.id}`,
          displayLabel: name,
          secondaryLine: `${code} • ${dept} • ${loc}`,
          matchedField,
          badge: e.status || 'ACTIVE',
          moduleName: 'All Employees',
          maskedPhone: maskPhoneNumber(e.phone),
          email: e.email,
        };
      });
    } catch (err: any) {
      console.warn('[search/employees error]:', err.message);
    }

    // 2. Departments and Units
    let departmentItems: any[] = [];
    let departmentTotal = 0;
    try {
      const [deptRows]: any = await pool.query(
        `SELECT d.id, d.name, d.code, l.name AS locationName, l.code AS locationCode
         FROM department d
         LEFT JOIN location l ON d.locationId = l.id
         WHERE LOWER(d.name) LIKE ? OR LOWER(d.code) LIKE ?
         ORDER BY d.name ASC
         LIMIT ?`,
        [term, term, limit]
      );

      const [deptCountRow]: any = await pool.query(
        `SELECT COUNT(*) AS total
         FROM department d
         WHERE LOWER(d.name) LIKE ? OR LOWER(d.code) LIKE ?`,
        [term, term]
      );
      departmentTotal = deptCountRow[0]?.total || 0;

      departmentItems = (deptRows || []).map((d: any) => {
        const ql = query.toLowerCase();
        const matchedField = d.code && d.code.toLowerCase().includes(ql) ? 'Department Code' : 'Department Name';
        return {
          id: d.id,
          type: 'department',
          targetRoute: `/organization/departments?deptId=${encodeURIComponent(d.id)}&q=${encodeURIComponent(query)}`,
          displayLabel: d.name,
          secondaryLine: `Code: ${d.code || 'DEPT'} • ${d.locationName || 'All Outlets'}`,
          matchedField,
          moduleName: 'Departments & Units',
        };
      });
    } catch (err: any) {
      console.warn('[search/departments error]:', err.message);
    }

    // 3. Hubs and Stores
    let hubItems: any[] = [];
    let hubTotal = 0;
    try {
      const [hubRows]: any = await pool.query(
        `SELECT id, name, code, city, state
         FROM location
         WHERE LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(city) LIKE ?
         ORDER BY name ASC
         LIMIT ?`,
        [term, term, term, limit]
      );

      const [hubCountRow]: any = await pool.query(
        `SELECT COUNT(*) AS total
         FROM location
         WHERE LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(city) LIKE ?`,
        [term, term, term]
      );
      hubTotal = hubCountRow[0]?.total || 0;

      hubItems = (hubRows || []).map((h: any) => {
        const ql = query.toLowerCase();
        const matchedField = h.code && h.code.toLowerCase().includes(ql) ? 'Hub Code' : 'Hub / Store Name';
        return {
          id: h.id,
          type: 'hub',
          targetRoute: `/dashboard?hub=${encodeURIComponent(h.id)}`,
          displayLabel: h.name,
          secondaryLine: `${h.code || 'HUB'} • ${h.city || ''}, ${h.state || 'Karnataka'}`,
          matchedField,
          moduleName: 'Executive Dashboard',
        };
      });
    } catch (err: any) {
      console.warn('[search/hubs error]:', err.message);
    }

    // 4. Shifts and Batches
    let shiftItems: any[] = [];
    let shiftTotal = 0;
    try {
      const [shiftRows]: any = await pool.query(
        `SELECT s.id, s.name, s.code, s.startTime, s.endTime, l.name AS locationName
         FROM shift s
         LEFT JOIN location l ON s.locationId = l.id
         WHERE LOWER(s.name) LIKE ? OR LOWER(s.code) LIKE ?
         ORDER BY s.name ASC
         LIMIT ?`,
        [term, term, limit]
      );

      const [shiftCountRow]: any = await pool.query(
        `SELECT COUNT(*) AS total
         FROM shift s
         WHERE LOWER(s.name) LIKE ? OR LOWER(s.code) LIKE ?`,
        [term, term]
      );
      shiftTotal = shiftCountRow[0]?.total || 0;

      shiftItems = (shiftRows || []).map((s: any) => {
        const ql = query.toLowerCase();
        const matchedField = s.code && s.code.toLowerCase().includes(ql) ? 'Shift Code' : 'Shift Name';
        return {
          id: s.id,
          type: 'shift',
          targetRoute: `/dashboard?shiftId=${encodeURIComponent(s.id)}`,
          displayLabel: s.name,
          secondaryLine: `${s.code || 'SHIFT'} • ${s.startTime || '09:00'} - ${s.endTime || '18:00'} • ${s.locationName || 'All Hubs'}`,
          matchedField,
          moduleName: 'Floor Shifts & Rosters',
        };
      });
    } catch (err: any) {
      console.warn('[search/shifts error]:', err.message);
    }

    // 5. Former Staff
    let formerStaffItems: any[] = [];
    let formerStaffTotal = 0;
    if (canViewHrData) {
      try {
        const [formerRows]: any = await pool.query(
          `SELECT ex.id, ex.exit_type, ex.status, ex.last_working_day,
                  e.id AS employeeId, e.employeeCode, e.firstName, e.lastName, e.fullName,
                  d.name AS departmentName, l.name AS locationName
           FROM employee_exits ex
           JOIN employee e ON ex.employee_id = e.id
           LEFT JOIN department d ON e.departmentId = d.id
           LEFT JOIN location l ON e.locationId = l.id
           WHERE LOWER(e.employeeCode) LIKE ? OR LOWER(e.firstName) LIKE ? OR LOWER(e.lastName) LIKE ? OR LOWER(e.fullName) LIKE ? OR LOWER(ex.exit_type) LIKE ?
           ORDER BY ex.created_at DESC
           LIMIT ?`,
          [term, term, term, term, term, limit]
        );

        const [formerCountRow]: any = await pool.query(
          `SELECT COUNT(*) AS total
           FROM employee_exits ex
           JOIN employee e ON ex.employee_id = e.id
           WHERE LOWER(e.employeeCode) LIKE ? OR LOWER(e.firstName) LIKE ? OR LOWER(e.lastName) LIKE ? OR LOWER(e.fullName) LIKE ? OR LOWER(ex.exit_type) LIKE ?`,
          [term, term, term, term, term]
        );
        formerStaffTotal = formerCountRow[0]?.total || 0;

        formerStaffItems = (formerRows || []).map((f: any) => {
          const name = f.fullName || `${f.firstName || ''} ${f.lastName || ''}`.trim() || 'Former Employee';
          return {
            id: f.id,
            type: 'former_staff',
            targetRoute: `/employees/former?employeeId=${encodeURIComponent(f.employeeId)}&q=${encodeURIComponent(query)}`,
            displayLabel: name,
            secondaryLine: `${f.employeeCode || 'EX-EMP'} • Exit: ${f.exit_type || 'Separation'} • LWD: ${f.last_working_day ? String(f.last_working_day).slice(0, 10) : 'N/A'}`,
            matchedField: f.employeeCode && f.employeeCode.toLowerCase().includes(query.toLowerCase()) ? 'Employee ID' : 'Exit Record',
            badge: f.status || 'SETTLED',
            moduleName: 'Former Staff & F&F',
          };
        });
      } catch (err: any) {
        console.warn('[search/formerStaff error]:', err.message);
      }
    }

    // 6. KYC and Documents
    let kycDocumentItems: any[] = [];
    let kycDocumentTotal = 0;
    if (canViewHrData) {
      try {
        // Search employee_documents
        const [docRows]: any = await pool.query(
          `SELECT ed.id, ed.title, ed.documentType, ed.category, ed.verificationStatus,
                  e.id AS employeeId, e.employeeCode, e.firstName, e.lastName, e.fullName
           FROM employee_documents ed
           JOIN employee e ON ed.employeeId = e.id
           WHERE LOWER(ed.title) LIKE ? OR LOWER(ed.documentType) LIKE ? OR LOWER(e.employeeCode) LIKE ? OR LOWER(e.fullName) LIKE ?
           ORDER BY ed.createdAt DESC
           LIMIT ?`,
          [term, term, term, term, limit]
        );

        // Search kyc_documents
        const [kycRows]: any = await pool.query(
          `SELECT kd.id, kd.documentType, kd.status, kd.fileName,
                  e.id AS employeeId, e.employeeCode, e.firstName, e.lastName, e.fullName
           FROM kyc_documents kd
           JOIN employee e ON kd.employeeId = e.id
           WHERE LOWER(kd.documentType) LIKE ? OR LOWER(e.employeeCode) LIKE ? OR LOWER(e.fullName) LIKE ?
           ORDER BY kd.createdAt DESC
           LIMIT ?`,
          [term, term, term, limit]
        );

        const combined = [
          ...(docRows || []).map((d: any) => ({
            id: d.id,
            type: 'kyc_document',
            targetRoute: `/employees/documents?employeeId=${encodeURIComponent(d.employeeId)}&q=${encodeURIComponent(query)}`,
            displayLabel: `${d.title || d.documentType} — ${d.fullName || d.employeeCode}`,
            secondaryLine: `${d.employeeCode || 'EMP'} • Category: ${d.category || 'General'} • Status: ${d.verificationStatus || 'PENDING'}`,
            matchedField: d.documentType && d.documentType.toLowerCase().includes(query.toLowerCase()) ? 'Document Type' : 'Document Title',
            badge: d.verificationStatus || 'PENDING',
            moduleName: 'Employee Documents',
          })),
          ...(kycRows || []).map((k: any) => ({
            id: k.id,
            type: 'kyc_document',
            targetRoute: `/operations/kyc?employeeId=${encodeURIComponent(k.employeeId)}&q=${encodeURIComponent(query)}`,
            displayLabel: `KYC ${k.documentType} — ${k.fullName || k.employeeCode}`,
            secondaryLine: `${k.employeeCode || 'EMP'} • Type: ${k.documentType} • Status: ${k.status || 'PENDING'}`,
            matchedField: 'KYC Document',
            badge: k.status || 'PENDING',
            moduleName: 'KYC Verification',
          })),
        ];

        kycDocumentTotal = combined.length;
        kycDocumentItems = combined.slice(0, limit);
      } catch (err: any) {
        console.warn('[search/kycDocuments error]:', err.message);
      }
    }

    // 7. Biometric and QR Records
    let biometricItems: any[] = [];
    let biometricTotal = 0;
    try {
      const [qrRows]: any = await pool.query(
        `SELECT q.id, q.employeeId, q.code, q.type, q.status,
                e.employeeCode, e.firstName, e.lastName, e.fullName
         FROM qrcode q
         JOIN employee e ON q.employeeId = e.id
         WHERE LOWER(q.code) LIKE ? OR LOWER(e.employeeCode) LIKE ? OR LOWER(e.fullName) LIKE ?
         ORDER BY q.createdAt DESC
         LIMIT ?`,
        [term, term, term, limit]
      );

      const [deviceRows]: any = await pool.query(
        `SELECT d.id, d.name, d.deviceType, d.status, l.name AS locationName
         FROM device d
         LEFT JOIN location l ON d.locationId = l.id
         WHERE LOWER(d.name) LIKE ? OR LOWER(d.deviceType) LIKE ?
         LIMIT ?`,
        [term, term, limit]
      );

      const combinedBio = [
        ...(qrRows || []).map((q: any) => ({
          id: q.id,
          type: 'biometric_qr',
          targetRoute: `/attendance/qr-codes?employeeId=${encodeURIComponent(q.employeeId)}&q=${encodeURIComponent(query)}`,
          displayLabel: `QR Pass: ${q.fullName || q.employeeCode}`,
          secondaryLine: `${q.employeeCode} • Pass Type: ${q.type || 'DAILY'} • Status: ${q.status || 'ACTIVE'}`,
          matchedField: 'QR Pass Code',
          badge: q.status || 'ACTIVE',
          moduleName: 'Digital QR Passes',
        })),
        ...(deviceRows || []).map((d: any) => ({
          id: d.id,
          type: 'biometric_qr',
          targetRoute: `/attendance/punches?deviceId=${encodeURIComponent(d.id)}&q=${encodeURIComponent(query)}`,
          displayLabel: `Terminal: ${d.name}`,
          secondaryLine: `Type: ${d.deviceType || 'Biometric Scanner'} • ${d.locationName || 'Showroom'}`,
          matchedField: 'Biometric Terminal',
          badge: d.status || 'ONLINE',
          moduleName: 'Biometric Punches',
        })),
      ];

      biometricTotal = combinedBio.length;
      biometricItems = combinedBio.slice(0, limit);
    } catch (err: any) {
      console.warn('[search/biometric error]:', err.message);
    }

    // 8. Attendance and Corrections
    let attendanceItems: any[] = [];
    let attendanceTotal = 0;
    try {
      const [attRows]: any = await pool.query(
        `SELECT a.id, a.date, a.status,
                e.id AS employeeId, e.employeeCode, e.firstName, e.lastName, e.fullName
         FROM attendance a
         JOIN employee e ON a.employeeId = e.id
         WHERE LOWER(e.employeeCode) LIKE ? OR LOWER(e.fullName) LIKE ? OR LOWER(e.firstName) LIKE ? OR a.date LIKE ?
         ORDER BY a.date DESC
         LIMIT ?`,
        [term, term, term, term, limit]
      );

      attendanceTotal = (attRows || []).length;
      attendanceItems = (attRows || []).map((a: any) => {
        const name = a.fullName || `${a.firstName || ''} ${a.lastName || ''}`.trim() || 'Employee';
        const dateStr = a.date ? String(a.date).slice(0, 10) : '';
        return {
          id: a.id,
          type: 'attendance',
          targetRoute: `/attendance/register?employeeId=${encodeURIComponent(a.employeeId)}&date=${encodeURIComponent(dateStr)}&q=${encodeURIComponent(query)}`,
          displayLabel: `${name} — Attendance (${dateStr})`,
          secondaryLine: `${a.employeeCode} • Record Date: ${dateStr} • Status: ${a.status || 'RECORDED'}`,
          matchedField: a.date && a.date.includes(query) ? 'Attendance Date' : 'Employee ID',
          badge: a.status || 'PRESENT',
          moduleName: 'Attendance Register',
        };
      });
    } catch (err: any) {
      console.warn('[search/attendance error]:', err.message);
    }

    // 9. Modules (Sidebar items)
    const ql = query.toLowerCase();
    const matchedModules = SIDEBAR_MODULES.filter((m) => {
      if (!canUserAccessModule(userRole, m.minRole)) return false;
      const titleMatch = m.title.toLowerCase().includes(ql);
      const descMatch = m.description.toLowerCase().includes(ql);
      const catMatch = m.category.toLowerCase().includes(ql);
      const keywordMatch = m.keywords.some((k) => k.toLowerCase().includes(ql) || ql.includes(k.toLowerCase()));
      return titleMatch || descMatch || catMatch || keywordMatch;
    });

    const moduleItems = matchedModules.slice(0, limit).map((m, index) => ({
      id: `mod_${index}_${m.href}`,
      type: 'module',
      targetRoute: m.href,
      displayLabel: m.title,
      secondaryLine: `${m.category} • ${m.description}`,
      matchedField: m.title.toLowerCase().includes(ql) ? 'Module Name' : 'Feature Keyword',
      moduleName: m.title,
    }));
    const moduleTotal = matchedModules.length;

    // Groups in explicit required order:
    // 1. Employees
    // 2. Departments and Units
    // 3. Hubs and Stores
    // 4. Shifts
    // 5. Former Staff
    // 6. KYC and Documents
    // 7. Biometric and QR
    // 8. Attendance and Corrections
    // 9. Modules
    const groups: any[] = [];

    if (employeeItems.length > 0) {
      groups.push({
        id: 'employees',
        title: 'Employees',
        count: employeeTotal,
        items: employeeItems,
      });
    }

    if (departmentItems.length > 0) {
      groups.push({
        id: 'departments',
        title: 'Departments and Units',
        count: departmentTotal,
        items: departmentItems,
      });
    }

    if (hubItems.length > 0) {
      groups.push({
        id: 'hubs',
        title: 'Hubs and Stores',
        count: hubTotal,
        items: hubItems,
      });
    }

    if (shiftItems.length > 0) {
      groups.push({
        id: 'shifts',
        title: 'Shifts',
        count: shiftTotal,
        items: shiftItems,
      });
    }

    if (formerStaffItems.length > 0) {
      groups.push({
        id: 'former_staff',
        title: 'Former Staff',
        count: formerStaffTotal,
        items: formerStaffItems,
      });
    }

    if (kycDocumentItems.length > 0) {
      groups.push({
        id: 'kyc_documents',
        title: 'KYC and Documents',
        count: kycDocumentTotal,
        items: kycDocumentItems,
      });
    }

    if (biometricItems.length > 0) {
      groups.push({
        id: 'biometric_qr',
        title: 'Biometric and QR',
        count: biometricTotal,
        items: biometricItems,
      });
    }

    if (attendanceItems.length > 0) {
      groups.push({
        id: 'attendance',
        title: 'Attendance and Corrections',
        count: attendanceTotal,
        items: attendanceItems,
      });
    }

    if (moduleItems.length > 0) {
      groups.push({
        id: 'modules',
        title: 'Modules',
        count: moduleTotal,
        items: moduleItems,
      });
    }

    const grandTotal =
      employeeTotal +
      departmentTotal +
      hubTotal +
      shiftTotal +
      formerStaffTotal +
      kycDocumentTotal +
      biometricTotal +
      attendanceTotal +
      moduleTotal;

    return res.json({
      query,
      totalCount: grandTotal,
      groups,
    });
  } catch (err: any) {
    console.error('[GET /api/search error]:', err);
    return res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

export default searchRouter;
