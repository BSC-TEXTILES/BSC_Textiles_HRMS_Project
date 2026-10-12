# BSC Textiles HRMS — Complete Offline Mode Specification

## 1. Principles of 100% Offline Operation

BSC Textiles HRMS is engineered from the ground up to be a true **zero-internet, standalone desktop application**.

* **No Cloud Authentication:** JWT verification, bcrypt password hashing, and user permissions execute entirely inside the embedded local Node.js process.
* **No Remote Database:** All reads and writes target the local `%APPDATA%\BSCTextiles\data\bsc_textiles.db` SQLite engine.
* **No External CDN Dependencies:** All fonts, Tailwind styles, SVG icons (Lucide React), and scripts are bundled locally inside the desktop application binaries.
* **No Host Name / DNS Requirements:** All local communication strictly uses the loopback interface (`127.0.0.1`).

---

## 2. Business Modules Supported Offline

Every business module works without interruption when the computer is completely disconnected from the internet or local area network:

1. **HRMS Dashboard:** Live employee counts, on-time vs. late attendance ratios, floor distribution across Belagavi, Davanagere, and Shivamogga.
2. **Employee Management:** Add, edit, deactivate employees, manage designations, departments, Aadhaar, PAN, PF, UAN, and ESI numbers.
3. **Attendance & Late Penalty Engine:**
   * Calculates ₹1.0/second late penalty based on showroom shift start time.
   * Tracks exact seconds late, chargeable seconds, and approved penalty waivers.
4. **Payroll & Payslip Management:**
   * Generates complete monthly payroll runs.
   * Renders the authentic Davanagere Payslip design with Belagavi / Shivamogga showroom selector.
   * Full statutory breakdowns: Basic, HRA, Medical Allowance, Washing Allowance, Conveyance, PF, ESI, TDS, Professional Tax, Advance, and ₹1.0/sec late fine.
   * Native offline A4 printing and PDF export via Electron `webContents.print()`.
5. **Floor-Wise Salary Overview:**
   * Summarizes gross, deductions, employer PF/ESI contributions, and net payable salaries by showroom floor and department.
6. **Customer CRM & Wedding Registration:**
   * Manages bridal and groom registries, event dates, budgets, telecaller interactions, and notes offline.
7. **Customer Feedback & Alerts:**
   * Records customer ratings and highlights negative feedback.
8. **Showroom Footfall & Visual Merchandising:**
   * Floor walk-in metrics and display audit scoring.

---

## 3. Physical Devices & Online-Dependent Integrations Handling

### 3.1 eSSL Biometric Attendance Data Import
* **Offline Operation:** The application does not require a cloud-connected biometric device.
* **Local USB / File Import:** The administrative interface includes an offline log parser in **Settings → Local Database**. Admins can upload exported biometric `.dat`, `.log`, or `.csv` files directly from USB flash drives.
* **Automatic Validation:** The parser matches biometric device User IDs against `employee.biometricId` or `employee.employeeCode`, automatically recording `punchIn` and `punchOut` timestamps with zero internet connection.

### 3.2 WhatsApp Communication Handling
* Automated messaging cannot operate without an internet connection.
* **Local Message Queue:** Outgoing messages (wedding greetings, feedback follow-ups, payslip notifications) are staged in a persistent local queue.
* **Status Indication:** The interface displays an explicit `OFFLINE_QUEUED` status badge, preventing false delivery confirmation messages.
* When a valid WhatsApp Web or API gateway session is connected with internet access, the user can review and dispatch queued messages.

### 3.3 Email & External Exports
* Exports generate standalone Excel (`.xlsx`), CSV, and PDF documents directly on the local hard drive.
* No remote mail servers or cloud storage services are required.
