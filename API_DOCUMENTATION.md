# BSC Textiles HRMS — API Documentation & Interface Contracts

**Base URL:** `http://localhost:4000/api`  
**Authentication Scheme:** HTTP Bearer JWT (`Authorization: Bearer <token>`) & Secure HTTP-only Session Cookie  
**CSRF Protection:** Header `x-csrf-token` mandatory on mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`)

---

## 1. Standard API Error Response Structure

All API responses follow a standardized error specification containing diagnostic request correlation IDs:

```json
{
  "error": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "message": "Invalid request input parameters",
  "details": [
    {
      "field": "employeeCode",
      "message": "Employee code is mandatory and must follow format EMP-LOC-XXX"
    }
  ],
  "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

---

## 2. Authentication & Identity APIs (`/api/auth`)

### 2.1 User Login
- **Endpoint:** `POST /api/auth/login`
- **Access:** Public (Rate limited: 5 requests / minute)
- **Request Body:**
  ```json
  {
    "email": "kavita.bhat@bsctextiles.com",
    "password": "Password@123",
    "deviceId": "dev_win11_store_01"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "usr_kavita_01",
      "fullName": "Kavita Bhat",
      "email": "kavita.bhat@bsctextiles.com",
      "role": "HR_MANAGER",
      "locationId": "loc_belagavi_01",
      "locationCode": "BEL"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "csrfToken": "a1b2c3d4e5f6...",
    "mfaRequired": false
  }
  ```

### 2.2 Verify MFA Challenge
- **Endpoint:** `POST /api/auth/mfa/verify`
- **Request Body:**
  ```json
  {
    "tempToken": "eyJhbGciOi...",
    "code": "482910"
  }
  ```

### 2.3 User Logout
- **Endpoint:** `POST /api/auth/logout`
- **Access:** Authenticated
- **Response (200 OK):** `{ "message": "Logged out successfully" }`

---

## 3. Employee & Workforce APIs (`/api/employees`)

### 3.1 List Active Store Employees
- **Endpoint:** `GET /api/employees`
- **Access:** Authenticated (Server-scoped by store location)
- **Query Parameters:**
  - `page`: Page number (default: 1)
  - `limit`: Records per page (default: 20, max: 100)
  - `departmentId`: Filter by department
  - `search`: Search by name or employee code
- **Response (200 OK):**
  ```json
  {
    "employees": [
      {
        "id": "emp_amit",
        "employeeCode": "EMP-BEL-002",
        "fullName": "Amit Patel",
        "email": "amit.patel@bsctextiles.com",
        "phone": "+91 9876543210",
        "locationId": "loc_belagavi_01",
        "locationName": "Belagavi Flagship Store",
        "departmentName": "Men's Ethnic Wear",
        "status": "ACTIVE"
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 20
  }
  ```

### 3.2 Former Employees (Ex-Workforce Dashboard)
- **Endpoint:** `GET /api/exits/former-employees`
- **Access:** `HR_MANAGER`, `ADMIN`, `SUPER_ADMIN`
- **Response (200 OK):** Returns terminated, resigned, and retired personnel with settlement tracking and KPIs.

---

## 4. Attendance & Real-Time Punch APIs (`/api/attendance`)

### 4.1 Daily Attendance Punch In / Out
- **Endpoint:** `POST /api/attendance/punch`
- **Access:** Authenticated / Store Terminal
- **Request Body:**
  ```json
  {
    "employeeId": "emp_amit",
    "locationId": "loc_belagavi_01",
    "punchType": "CHECK_IN",
    "verificationMethod": "QR_PLUS_FACE",
    "qrToken": "qr_sec_tok_8471928374",
    "faceMatchPercentage": 96.4
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "attendanceId": "att_20261011_emp_amit",
    "status": "PRESENT",
    "punchTime": "2026-10-11T10:28:14.382Z",
    "earlyLoginIncentive": 600.00,
    "lateLoginPenalty": 0.00
  }
  ```

### 4.2 Breaks Governance APIs (`/api/breaks`)
- `POST /api/breaks/start`: Start Lunch / Tea Break (applies gender-differentiated policy: Male lunch 100m, Female lunch 40m).
- `POST /api/breaks/end`: Conclude break; calculates overrun penalties if duration threshold exceeded.

---

## 5. Payroll & Payslip APIs (`/api/payroll`)

### 5.1 List Payroll Runs
- **Endpoint:** `GET /api/payroll/runs`
- **Access:** `HR_MANAGER`, `PAYROLL_MANAGER`, `SUPER_ADMIN`
- **Response (200 OK):** Master payroll cycles across stores with gross outlay, deductions, and payout status.

### 5.2 Stream Form T Payslip PDF
- **Endpoint:** `GET /api/payroll/payslips/:id/pdf`
- **Access:** HR / Self-Employee owner
- **Response (200 OK):** Binary stream `application/pdf` containing Form T statutory payslip.

### 5.3 HR Edit Payslip with Documented Reason
- **Endpoint:** `PUT /api/payroll/payslips/:id/edit`
- **Access:** HR Staff only
- **Request Body:**
  ```json
  {
    "basicSalary": 28000.00,
    "allowances": 4500.00,
    "statutoryDeductions": 1800.00,
    "editReason": "Corrected HRA allowance discrepancy per revised appraisal letter"
  }
  ```
- **Behavior:** Supersedes previous payslip version in `payslip_versions` and creates tamper-proof audit trail in `audit_logs`.

---

## 6. Audit & Compliance APIs (`/api/audit`)

### 6.1 View Audit Trail
- **Endpoint:** `GET /api/audit/logs`
- **Access:** `SUPER_ADMIN`, `ADMIN`, `HR_AUDITOR`
- **Response (200 OK):** Chronological, hash-verified audit log with user, entity, old value, and new value snapshots.
