-- ==============================================================================
-- BSC TEXTILES HRMS — STANDALONE LOCAL SQLITE SCHEMA
-- Designed for 100% Offline Single-Computer Operation (Windows 10/11)
-- ==============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 1. SHOWROOM LOCATIONS (Belagavi, Davanagere, Shivamogga)
CREATE TABLE IF NOT EXISTS location (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pin TEXT,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  managerId TEXT,
  hrManagerId TEXT,
  openingTime TEXT,
  closingTime TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_location_code ON location(code);
CREATE INDEX IF NOT EXISTS idx_location_status ON location(status);

-- 2. FLOORS
CREATE TABLE IF NOT EXISTS floor (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  floorNumber INTEGER NOT NULL,
  locationId TEXT NOT NULL,
  floorManagerId TEXT,
  assistantManagerId TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_floor_loc ON floor(locationId);

-- 3. DEPARTMENTS
CREATE TABLE IF NOT EXISTS department (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  locationId TEXT NOT NULL,
  floorId TEXT,
  managerId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE CASCADE,
  FOREIGN KEY (floorId) REFERENCES floor(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_department_loc ON department(locationId);

-- 4. SECTIONS
CREATE TABLE IF NOT EXISTS section (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  locationId TEXT NOT NULL,
  floorId TEXT,
  departmentId TEXT,
  supervisorId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE CASCADE,
  FOREIGN KEY (floorId) REFERENCES floor(id) ON DELETE SET NULL,
  FOREIGN KEY (departmentId) REFERENCES department(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_section_loc ON section(locationId);

-- 5. SHIFTS
CREATE TABLE IF NOT EXISTS shift (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locationId TEXT,
  startTime TEXT NOT NULL DEFAULT '10:30:00',
  endTime TEXT NOT NULL DEFAULT '20:30:00',
  gracePeriod INTEGER NOT NULL DEFAULT 5,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL
);

-- 6. EMPLOYEES
CREATE TABLE IF NOT EXISTS employee (
  id TEXT PRIMARY KEY,
  employeeCode TEXT UNIQUE NOT NULL,
  fullName TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gender TEXT,
  dateOfBirth TEXT,
  joiningDate TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  designation TEXT,
  locationId TEXT,
  floorId TEXT,
  departmentId TEXT,
  sectionId TEXT,
  shiftId TEXT,
  basicSalary REAL DEFAULT 12000.00,
  fixedGrossSalary REAL DEFAULT 16000.00,
  perDaySalary REAL DEFAULT 516.13,
  daysPayable REAL DEFAULT 31.00,
  pfPay REAL DEFAULT 12000.00,
  hra REAL DEFAULT 4000.00,
  pfNo TEXT,
  esiNo TEXT,
  uanNo TEXT,
  bankName TEXT,
  bankAccount TEXT,
  salesmanNo TEXT,
  batch TEXT DEFAULT 'SHIFT II',
  photoUrl TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL,
  FOREIGN KEY (floorId) REFERENCES floor(id) ON DELETE SET NULL,
  FOREIGN KEY (departmentId) REFERENCES department(id) ON DELETE SET NULL,
  FOREIGN KEY (sectionId) REFERENCES section(id) ON DELETE SET NULL,
  FOREIGN KEY (shiftId) REFERENCES shift(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_code ON employee(employeeCode);
CREATE INDEX IF NOT EXISTS idx_employee_name ON employee(fullName);
CREATE INDEX IF NOT EXISTS idx_employee_loc ON employee(locationId);
CREATE INDEX IF NOT EXISTS idx_employee_status ON employee(status);

-- 7. USERS & LOCAL AUTHENTICATION
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  fullName TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EMPLOYEE',
  permissions TEXT,
  locationId TEXT,
  employeeId TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  lastLoginAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL,
  FOREIGN KEY (employeeId) REFERENCES employee(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
CREATE INDEX IF NOT EXISTS idx_user_role ON user(role);

-- 8. ATTENDANCE RULES (Statutory Rule: Permanent ₹1.0/min late fine)
CREATE TABLE IF NOT EXISTS attendancerules (
  id TEXT PRIMARY KEY,
  locationId TEXT UNIQUE,
  loginTime TEXT DEFAULT '10:30:00',
  logoutTime TEXT DEFAULT '20:30:00',
  gracePeriodMinutes INTEGER DEFAULT 5,
  lateThresholdMinutes INTEGER DEFAULT 5,
  earlyLoginIncentiveEnabled INTEGER DEFAULT 1,
  earlyLoginRatePerMinute REAL DEFAULT 1.0000,
  earlyLoginRatePerSecond REAL DEFAULT 0.0167,
  latePenaltyEnabled INTEGER DEFAULT 1,
  latePenaltyRatePerMinute REAL DEFAULT 1.0000,
  latePenaltyRatePerSecond REAL DEFAULT 0.0167,
  overtimeIncentiveEnabled INTEGER DEFAULT 1,
  overtimeRatePerSecond REAL DEFAULT 1.5000,
  earlyLogoutPenaltyEnabled INTEGER DEFAULT 1,
  earlyLogoutRatePerSecond REAL DEFAULT 1.0000,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE CASCADE
);

-- 9. ATTENDANCE & BIOMETRIC PUNCHES
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employeeId TEXT NOT NULL,
  locationId TEXT,
  shiftId TEXT,
  attendanceDate TEXT NOT NULL,
  punchIn TEXT,
  punchOut TEXT,
  lateLoginSeconds INTEGER DEFAULT 0,
  earlyLogoutSeconds INTEGER DEFAULT 0,
  lateLoginPenalty REAL DEFAULT 0.00,
  -- Fine rate: ₹1.0 per minute (₹1.0/min) of chargeable late time
  earlyLoginSeconds INTEGER DEFAULT 0,
  earlyLoginIncentive REAL DEFAULT 0.00,
  status TEXT DEFAULT 'PRESENT',
  source TEXT DEFAULT 'BIOMETRIC_OFFLINE',
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (employeeId) REFERENCES employee(id) ON DELETE CASCADE,
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL,
  FOREIGN KEY (shiftId) REFERENCES shift(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance(employeeId, attendanceDate);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(attendanceDate);

-- 10. LATE ATTENDANCE RECORD (Dedicated Fine Ledger at ₹1.0/min)
CREATE TABLE IF NOT EXISTS late_attendance_record (
  id TEXT PRIMARY KEY,
  employeeId TEXT NOT NULL,
  locationId TEXT,
  departmentId TEXT,
  shiftId TEXT,
  recordDate TEXT NOT NULL,
  scheduledLogin TEXT,
  actualPunchIn TEXT,
  gracePeriodMinutes INTEGER DEFAULT 5,
  lateSeconds INTEGER DEFAULT 0,
  chargeableLateSeconds INTEGER DEFAULT 0,
  fineCalculationType TEXT DEFAULT 'PER_MINUTE',
  fineRate REAL DEFAULT 1.0000,
  calculatedFine REAL DEFAULT 0.00,
  approvedFine REAL DEFAULT 0.00,
  waivedFine REAL DEFAULT 0.00,
  finalFine REAL DEFAULT 0.00,
  fineStatus TEXT DEFAULT 'NO_FINE',
  approvalStatus TEXT DEFAULT 'PENDING',
  payrollStatus TEXT DEFAULT 'NOT_APPLIED',
  earlySeconds INTEGER DEFAULT 0,
  earlyIncentive REAL DEFAULT 0.00,
  managerRemarks TEXT,
  reviewedById TEXT,
  reviewedAt TEXT,
  payrollRunId TEXT,
  historyJson TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (employeeId) REFERENCES employee(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lar_emp_date ON late_attendance_record(employeeId, recordDate);
CREATE INDEX IF NOT EXISTS idx_lar_status ON late_attendance_record(approvalStatus);

-- 11. PAYROLL RUNS
CREATE TABLE IF NOT EXISTS payrollrun (
  id TEXT PRIMARY KEY,
  locationId TEXT,
  periodStart TEXT NOT NULL,
  periodEnd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  processedBy TEXT,
  processedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL
);

-- 12. PAYROLL ITEMS (Individual Payslips with Full Statutory Details)
CREATE TABLE IF NOT EXISTS payrollitem (
  id TEXT PRIMARY KEY,
  payrollRunId TEXT NOT NULL,
  employeeId TEXT NOT NULL,
  employeeCode TEXT NOT NULL,
  fullName TEXT NOT NULL,
  designation TEXT,
  salaryMonth TEXT NOT NULL,
  salaryYear INTEGER NOT NULL,
  daysPayable REAL DEFAULT 31.00,
  perDaySalary REAL DEFAULT 516.13,
  pfPay REAL DEFAULT 12000.00,
  fixedGrossSalary REAL DEFAULT 16000.00,
  basicSalary REAL DEFAULT 12000.00,
  hra REAL DEFAULT 4000.00,
  grossSalary REAL DEFAULT 16000.00,
  totalEarnings REAL DEFAULT 16000.00,
  totalDeductions REAL DEFAULT 1593.00,
  totalPayable REAL DEFAULT 14407.00,
  netPay REAL DEFAULT 14407.00,
  employeePf REAL DEFAULT 1440.00,
  employeeEsi REAL DEFAULT 153.00,
  profTax REAL DEFAULT 0.00,
  salaryAdvance REAL DEFAULT 0.00,
  loanAdvance REAL DEFAULT 0.00,
  penalties REAL DEFAULT 0.00,
  employerPf REAL DEFAULT 1440.00,
  employerEsi REAL DEFAULT 520.00,
  ctc REAL DEFAULT 17960.00,
  earningsConfig TEXT,
  deductionsConfig TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  section TEXT,
  batch TEXT DEFAULT 'SHIFT II',
  shiftName TEXT DEFAULT 'SHIFT II',
  locationCode TEXT DEFAULT 'BSCTEX',
  pfNo TEXT,
  esiNo TEXT,
  uanNo TEXT,
  bankName TEXT,
  bankAccount TEXT,
  salesmanNo TEXT,
  customSections TEXT,
  calculationDetails TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (payrollRunId) REFERENCES payrollrun(id) ON DELETE CASCADE,
  FOREIGN KEY (employeeId) REFERENCES employee(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pi_emp_period ON payrollitem(employeeId, salaryMonth, salaryYear);
CREATE INDEX IF NOT EXISTS idx_pi_run ON payrollitem(payrollRunId);

-- 13. CUSTOMER MANAGEMENT
CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  fullName TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  anniversaryDate TEXT,
  birthdayDate TEXT,
  locationId TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_phone ON customer(phone);

-- 14. WEDDING REGISTRATION & CRM
CREATE TABLE IF NOT EXISTS wedding_registration (
  id TEXT PRIMARY KEY,
  brideName TEXT NOT NULL,
  groomName TEXT NOT NULL,
  weddingDate TEXT NOT NULL,
  phone TEXT NOT NULL,
  alternatePhone TEXT,
  locationId TEXT,
  budget REAL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'NEW',
  assignedTelecallerId TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE SET NULL,
  FOREIGN KEY (assignedTelecallerId) REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS wedding_interaction (
  id TEXT PRIMARY KEY,
  weddingId TEXT NOT NULL,
  telecallerId TEXT,
  callDate TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  callOutcome TEXT NOT NULL,
  feedback TEXT,
  nextFollowUpDate TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (weddingId) REFERENCES wedding_registration(id) ON DELETE CASCADE,
  FOREIGN KEY (telecallerId) REFERENCES user(id) ON DELETE SET NULL
);

-- 15. CUSTOMER FEEDBACK & ALERTS
CREATE TABLE IF NOT EXISTS customer_feedback (
  id TEXT PRIMARY KEY,
  customerName TEXT NOT NULL,
  phone TEXT,
  rating INTEGER NOT NULL,
  comments TEXT,
  isNegative INTEGER NOT NULL DEFAULT 0,
  alertSent INTEGER NOT NULL DEFAULT 0,
  showroomLocation TEXT NOT NULL,
  feedbackDate TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_negative ON customer_feedback(isNegative);

-- 16. SHOWROOM FOOTFALL
CREATE TABLE IF NOT EXISTS showroom_footfall (
  id TEXT PRIMARY KEY,
  locationId TEXT NOT NULL,
  countDate TEXT NOT NULL,
  hourSlot TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE CASCADE
);

-- 17. VISUAL MERCHANDISING
CREATE TABLE IF NOT EXISTS visual_merchandising (
  id TEXT PRIMARY KEY,
  locationId TEXT NOT NULL,
  floorId TEXT,
  auditDate TEXT NOT NULL,
  auditorName TEXT NOT NULL,
  score REAL DEFAULT 0.00,
  observations TEXT,
  photoUrls TEXT,
  status TEXT DEFAULT 'APPROVED',
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (locationId) REFERENCES location(id) ON DELETE CASCADE,
  FOREIGN KEY (floorId) REFERENCES floor(id) ON DELETE SET NULL
);

-- 18. AUDIT LOGS
CREATE TABLE IF NOT EXISTS auditlog (
  id TEXT PRIMARY KEY,
  userId TEXT,
  locationId TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entityId TEXT,
  details TEXT,
  ipAddress TEXT DEFAULT '127.0.0.1',
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 19. SESSIONS (Offline Local JWT/Session Cache)
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  locationId TEXT,
  token TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

-- 20. LOCAL WHATSAPP OUTBOX QUEUE (Offline-resilient Message Queue)
CREATE TABLE IF NOT EXISTS whatsapp_message_queue (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  templateName TEXT,
  messageText TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED_OFFLINE',
  sentAt TEXT,
  errorMessage TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
