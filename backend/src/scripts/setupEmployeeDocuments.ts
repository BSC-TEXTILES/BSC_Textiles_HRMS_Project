import { pool } from '../db.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function genId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

const STORAGE_DIR = path.resolve(process.cwd(), 'storage/secure');

async function run() {
  console.log('--- Initializing Employee Document Management Schema & Seed Data ---');

  await fs.mkdir(STORAGE_DIR, { recursive: true });

  // 1. Create document_type_config table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_type_config (
      id VARCHAR(64) PRIMARY KEY,
      category VARCHAR(64) NOT NULL,
      code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL,
      isRequired BOOLEAN DEFAULT 0,
      allowedExtensions VARCHAR(128) DEFAULT 'pdf,jpg,jpeg,png',
      maxSizeBytes BIGINT DEFAULT 10485760,
      requiresExpiry BOOLEAN DEFAULT 0,
      confidentialityLevel VARCHAR(32) DEFAULT 'INTERNAL',
      applicableRoles VARCHAR(255) DEFAULT 'ALL',
      isActive BOOLEAN DEFAULT 1,
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_dtc_category (category),
      INDEX idx_dtc_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Create employee_documents table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id VARCHAR(64) PRIMARY KEY,
      employeeId VARCHAR(64) NOT NULL,
      category VARCHAR(64) NOT NULL,
      documentType VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      documentNumberMasked VARCHAR(128),
      filePath VARCHAR(512) NOT NULL,
      fileName VARCHAR(255) NOT NULL,
      fileSize BIGINT NOT NULL,
      mimeType VARCHAR(128) NOT NULL,
      version INT DEFAULT 1,
      uploadedById VARCHAR(64) NOT NULL,
      uploadedByRole VARCHAR(64) NOT NULL,
      uploadedByName VARCHAR(128) NOT NULL,
      issueDate DATE,
      expiryDate DATE,
      verificationStatus VARCHAR(32) DEFAULT 'PENDING_VERIFICATION',
      verifiedById VARCHAR(64),
      verifiedByName VARCHAR(128),
      verifiedAt DATETIME(3),
      rejectionReason TEXT,
      description TEXT,
      confidentialityLevel VARCHAR(32) DEFAULT 'INTERNAL',
      remarks TEXT,
      versionsJson LONGTEXT,
      auditHistoryJson LONGTEXT,
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_ed_emp (employeeId),
      INDEX idx_ed_status (verificationStatus),
      INDEX idx_ed_category (category),
      INDEX idx_ed_docType (documentType)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('Tables created or verified.');

  // 3. Seed default Document Types
  const defaultDocTypes = [
    // Identity Documents
    { category: 'IDENTITY', code: 'AADHAAR_CARD', name: 'Aadhaar Card', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'STRICTLY_CONFIDENTIAL' },
    { category: 'IDENTITY', code: 'PAN_CARD', name: 'PAN Card', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'CONFIDENTIAL' },
    { category: 'IDENTITY', code: 'PASSPORT', name: 'Passport', isRequired: 0, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 1, conf: 'CONFIDENTIAL' },
    { category: 'IDENTITY', code: 'VOTER_ID', name: 'Voter ID', isRequired: 0, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'CONFIDENTIAL' },
    { category: 'IDENTITY', code: 'DRIVING_LICENSE', name: 'Driving Licence', isRequired: 0, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 1, conf: 'CONFIDENTIAL' },
    
    // Address Proof
    { category: 'ADDRESS', code: 'ADDRESS_PROOF', name: 'Address Proof', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'ADDRESS', code: 'UTILITY_BILL', name: 'Electricity / Water Bill', isRequired: 0, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'ADDRESS', code: 'RENTAL_AGREEMENT', name: 'Rental Agreement', isRequired: 0, allowed: 'pdf', requiresExpiry: 1, conf: 'INTERNAL' },

    // Educational Documents
    { category: 'EDUCATION', code: 'SSLC_10TH', name: 'SSLC / 10th Certificate', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'EDUCATION', code: 'PUC_12TH', name: 'PUC / 12th Certificate', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'EDUCATION', code: 'DEGREE_DIPLOMA', name: 'Degree / Diploma Certificate', isRequired: 0, allowed: 'pdf', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'EDUCATION', code: 'POSTGRAD_CERT', name: 'Postgraduate Certificate', isRequired: 0, allowed: 'pdf', requiresExpiry: 0, conf: 'INTERNAL' },

    // Employment Documents
    { category: 'EMPLOYMENT', code: 'OFFER_LETTER', name: 'Offer Letter', isRequired: 1, allowed: 'pdf', requiresExpiry: 0, conf: 'CONFIDENTIAL' },
    { category: 'EMPLOYMENT', code: 'APPOINTMENT_LETTER', name: 'Appointment Letter', isRequired: 1, allowed: 'pdf', requiresExpiry: 0, conf: 'CONFIDENTIAL' },
    { category: 'EMPLOYMENT', code: 'JOINING_REPORT', name: 'Joining Letter / Undertaking', isRequired: 1, allowed: 'pdf', requiresExpiry: 0, conf: 'CONFIDENTIAL' },
    { category: 'EMPLOYMENT', code: 'EXPERIENCE_LETTER', name: 'Previous Experience Letter', isRequired: 0, allowed: 'pdf', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'EMPLOYMENT', code: 'RELIEVING_LETTER', name: 'Previous Relieving Letter', isRequired: 0, allowed: 'pdf', requiresExpiry: 0, conf: 'INTERNAL' },

    // Bank & Payroll
    { category: 'BANK_PAYROLL', code: 'BANK_PASSBOOK', name: 'Bank Passbook / Statement', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'STRICTLY_CONFIDENTIAL' },
    { category: 'BANK_PAYROLL', code: 'CANCELLED_CHEQUE', name: 'Cancelled Cheque', isRequired: 1, allowed: 'pdf,jpg,jpeg,png', requiresExpiry: 0, conf: 'STRICTLY_CONFIDENTIAL' },

    // Employee & HR Dossier
    { category: 'HR_DOSSIER', code: 'EMPLOYEE_PHOTO', name: 'Employee Official Photograph', isRequired: 1, allowed: 'jpg,jpeg,png', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'HR_DOSSIER', code: 'RESUME_CV', name: 'Resume / CV', isRequired: 0, allowed: 'pdf', requiresExpiry: 0, conf: 'INTERNAL' },
    { category: 'HR_DOSSIER', code: 'EMERGENCY_FORM', name: 'Emergency Contact & Nominee Form', isRequired: 1, allowed: 'pdf', requiresExpiry: 0, conf: 'CONFIDENTIAL' },

    // Compliance
    { category: 'COMPLIANCE', code: 'MEDICAL_FITNESS', name: 'Medical Fitness Certificate', isRequired: 0, allowed: 'pdf', requiresExpiry: 1, conf: 'CONFIDENTIAL' }
  ];

  for (const dt of defaultDocTypes) {
    await pool.query(`
      INSERT INTO document_type_config (id, category, code, name, isRequired, allowedExtensions, requiresExpiry, confidentialityLevel, isActive)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        isRequired = VALUES(isRequired),
        allowedExtensions = VALUES(allowedExtensions),
        requiresExpiry = VALUES(requiresExpiry),
        confidentialityLevel = VALUES(confidentialityLevel)
    `, [genId('dtc'), dt.category, dt.code, dt.name, dt.isRequired, dt.allowed, dt.requiresExpiry, dt.conf]);
  }

  console.log(`Document types seeded (${defaultDocTypes.length} types).`);

  // 4. Create sample sample_doc.pdf in storage/secure
  const samplePdfPath = path.join(STORAGE_DIR, 'sample_document.pdf');
  const samplePdfContent = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000108 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF\n'
  );
  await fs.writeFile(samplePdfPath, samplePdfContent);

  // Sample JPEG for photos
  const sampleJpgPath = path.join(STORAGE_DIR, 'sample_photo.jpg');
  const sampleJpgContent = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
  await fs.writeFile(sampleJpgPath, sampleJpgContent);

  // 5. Query active employees
  const [employees]: any = await pool.query(`
    SELECT e.id, e.employeeCode, e.fullName, e.departmentId, e.locationId, d.name as deptName, l.name as locName
    FROM employee e
    LEFT JOIN department d ON e.departmentId = d.id
    LEFT JOIN location l ON e.locationId = l.id
    ORDER BY e.employeeCode ASC
  `);

  console.log(`Found ${employees.length} employees to populate with document dossiers.`);

  // Clear existing employee_documents to prevent stale artifacts
  await pool.query('DELETE FROM employee_documents');

  let insertedDocsCount = 0;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const isSpecialCase = i % 5;

    // A. Aadhaar Card (All employees)
    const aadhaarNumber = `XXXX-XXXX-${String(1000 + (i * 73) % 9000)}`;
    const aadhaarStatus = isSpecialCase === 0 ? 'PENDING_VERIFICATION' : (isSpecialCase === 1 ? 'REJECTED' : 'VERIFIED');
    const aadhaarRejection = aadhaarStatus === 'REJECTED' ? 'Aadhaar reverse address scan is blurry. Please upload clear color copy.' : null;

    const aadhaarAudit = [
      {
        action: 'UPLOADED',
        by: i % 2 === 0 ? 'Kavita Bhat (HR Manager)' : 'Floor Manager Belagavi',
        role: i % 2 === 0 ? 'HR_MANAGER' : 'FLOOR_MANAGER',
        timestamp: '2026-10-01T10:00:00.000Z',
        note: 'Uploaded during onboarding'
      }
    ];

    if (aadhaarStatus === 'VERIFIED') {
      aadhaarAudit.push({
        action: 'VERIFIED',
        by: 'Kavita Bhat (HR Manager)',
        role: 'HR_MANAGER',
        timestamp: '2026-10-02T14:30:00.000Z',
        note: 'UIDAI visual check matched official name'
      });
    } else if (aadhaarStatus === 'REJECTED') {
      aadhaarAudit.push({
        action: 'REJECTED',
        by: 'Kavita Bhat (HR Manager)',
        role: 'HR_MANAGER',
        timestamp: '2026-10-02T16:00:00.000Z',
        note: aadhaarRejection!
      });
    }

    await pool.query(`
      INSERT INTO employee_documents (
        id, employeeId, category, documentType, title, documentNumberMasked,
        filePath, fileName, fileSize, mimeType, version,
        uploadedById, uploadedByRole, uploadedByName,
        verificationStatus, verifiedById, verifiedByName, verifiedAt, rejectionReason,
        confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
      ) VALUES (
        ?, ?, 'IDENTITY', 'AADHAAR_CARD', 'Aadhaar Card Copy', ?,
        ?, 'aadhaar_card.pdf', 154200, 'application/pdf', 1,
        'usr_hr_01', 'HR_MANAGER', 'Kavita Bhat',
        ?, ?, ?, ?, ?,
        'STRICTLY_CONFIDENTIAL', 'Official identity proof', '[]', ?, NOW(3)
      )
    `, [
      genId('doc'), emp.id, aadhaarNumber, samplePdfPath,
      aadhaarStatus, aadhaarStatus === 'VERIFIED' ? 'usr_hr_01' : null,
      aadhaarStatus === 'VERIFIED' ? 'Kavita Bhat' : null,
      aadhaarStatus === 'VERIFIED' ? new Date('2026-10-02T14:30:00Z') : null,
      aadhaarRejection, JSON.stringify(aadhaarAudit)
    ]);
    insertedDocsCount++;

    // B. PAN Card
    const panNumber = `XXXXX${String(1000 + (i * 37) % 9000).substring(0, 4)}F`;
    await pool.query(`
      INSERT INTO employee_documents (
        id, employeeId, category, documentType, title, documentNumberMasked,
        filePath, fileName, fileSize, mimeType, version,
        uploadedById, uploadedByRole, uploadedByName,
        verificationStatus, verifiedById, verifiedByName, verifiedAt,
        confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
      ) VALUES (
        ?, ?, 'IDENTITY', 'PAN_CARD', 'Permanent Account Number Card', ?,
        ?, 'pan_card.pdf', 128400, 'application/pdf', 1,
        'usr_hr_01', 'HR_MANAGER', 'Kavita Bhat',
        'VERIFIED', 'usr_hr_01', 'Kavita Bhat', NOW(3),
        'CONFIDENTIAL', 'Income Tax identity verification', '[]', ?, NOW(3)
      )
    `, [
      genId('doc'), emp.id, panNumber, samplePdfPath,
      JSON.stringify([{ action: 'VERIFIED', by: 'Kavita Bhat', role: 'HR_MANAGER', timestamp: new Date().toISOString() }])
    ]);
    insertedDocsCount++;

    // C. Official Photograph
    await pool.query(`
      INSERT INTO employee_documents (
        id, employeeId, category, documentType, title,
        filePath, fileName, fileSize, mimeType, version,
        uploadedById, uploadedByRole, uploadedByName,
        verificationStatus, verifiedById, verifiedByName, verifiedAt,
        confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
      ) VALUES (
        ?, ?, 'HR_DOSSIER', 'EMPLOYEE_PHOTO', 'Official Passport Photo',
        ?, 'profile_photo.jpg', 45200, 'image/jpeg', 1,
        'usr_admin', 'SUPER_ADMIN', 'S. B. Angadi',
        'VERIFIED', 'usr_admin', 'S. B. Angadi', NOW(3),
        'INTERNAL', 'Staff ID card photo', '[]', ?, NOW(3)
      )
    `, [
      genId('doc'), emp.id, sampleJpgPath,
      JSON.stringify([{ action: 'VERIFIED', by: 'S. B. Angadi', role: 'SUPER_ADMIN', timestamp: new Date().toISOString() }])
    ]);
    insertedDocsCount++;

    // D. Offer Letter
    await pool.query(`
      INSERT INTO employee_documents (
        id, employeeId, category, documentType, title,
        filePath, fileName, fileSize, mimeType, version,
        uploadedById, uploadedByRole, uploadedByName,
        verificationStatus, verifiedById, verifiedByName, verifiedAt,
        confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
      ) VALUES (
        ?, ?, 'EMPLOYMENT', 'OFFER_LETTER', 'BSC Textiles Formal Offer Letter',
        ?, 'offer_letter_signed.pdf', 214500, 'application/pdf', 1,
        'usr_hr_01', 'HR_MANAGER', 'Kavita Bhat',
        'VERIFIED', 'usr_hr_01', 'Kavita Bhat', NOW(3),
        'CONFIDENTIAL', 'Countersigned employment offer', '[]', ?, NOW(3)
      )
    `, [
      genId('doc'), emp.id, samplePdfPath,
      JSON.stringify([{ action: 'VERIFIED', by: 'Kavita Bhat', role: 'HR_MANAGER', timestamp: new Date().toISOString() }])
    ]);
    insertedDocsCount++;

    // E. Bank Document (Passbook or Cheque)
    if (i % 3 !== 0) {
      await pool.query(`
        INSERT INTO employee_documents (
          id, employeeId, category, documentType, title, documentNumberMasked,
          filePath, fileName, fileSize, mimeType, version,
          uploadedById, uploadedByRole, uploadedByName,
          verificationStatus, verifiedById, verifiedByName, verifiedAt,
          confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
        ) VALUES (
          ?, ?, 'BANK_PAYROLL', 'BANK_PASSBOOK', 'State Bank of India Passbook', 'A/C XXXX-XXXX-4512',
          ?, 'sbi_passbook.pdf', 312000, 'application/pdf', 1,
          'usr_hr_01', 'HR_MANAGER', 'Kavita Bhat',
          'VERIFIED', 'usr_hr_01', 'Kavita Bhat', NOW(3),
          'STRICTLY_CONFIDENTIAL', 'Direct salary crediting bank account proof', '[]', ?, NOW(3)
        )
      `, [
        genId('doc'), emp.id, samplePdfPath,
        JSON.stringify([{ action: 'VERIFIED', by: 'Kavita Bhat', role: 'HR_MANAGER', timestamp: new Date().toISOString() }])
      ]);
      insertedDocsCount++;
    }

    // F. Educational Certificate (SSLC / 10th)
    if (i % 4 !== 0) {
      await pool.query(`
        INSERT INTO employee_documents (
          id, employeeId, category, documentType, title,
          filePath, fileName, fileSize, mimeType, version,
          uploadedById, uploadedByRole, uploadedByName,
          verificationStatus, verifiedById, verifiedByName, verifiedAt,
          confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
        ) VALUES (
          ?, ?, 'EDUCATION', 'SSLC_10TH', 'KSEEB SSLC 10th Marks Card',
          ?, 'sslc_marks_card.pdf', 188000, 'application/pdf', 1,
          'usr_hr_01', 'HR_MANAGER', 'Kavita Bhat',
          'VERIFIED', 'usr_hr_01', 'Kavita Bhat', NOW(3),
          'INTERNAL', 'Karnataka secondary education board certificate', '[]', ?, NOW(3)
        )
      `, [
        genId('doc'), emp.id, samplePdfPath,
        JSON.stringify([{ action: 'VERIFIED', by: 'Kavita Bhat', role: 'HR_MANAGER', timestamp: new Date().toISOString() }])
      ]);
      insertedDocsCount++;
    }

    // G. Floor Manager Upload sample for select employees
    if (i % 6 === 0) {
      await pool.query(`
        INSERT INTO employee_documents (
          id, employeeId, category, documentType, title,
          filePath, fileName, fileSize, mimeType, version,
          uploadedById, uploadedByRole, uploadedByName,
          verificationStatus, confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
        ) VALUES (
          ?, ?, 'COMPLIANCE', 'MEDICAL_FITNESS', 'Showroom Floor Medical Fitness Certificate',
          ?, 'medical_fitness.pdf', 95000, 'application/pdf', 1,
          'usr_fm_01', 'FLOOR_MANAGER', 'Ramesh Gowda (Floor Manager)',
          'PENDING_VERIFICATION', 'INTERNAL', 'Submitted by Floor Manager during retail floor deployment', '[]', ?, NOW(3)
        )
      `, [
        genId('doc'), emp.id, samplePdfPath,
        JSON.stringify([{ action: 'UPLOADED', by: 'Ramesh Gowda', role: 'FLOOR_MANAGER', timestamp: new Date().toISOString(), note: 'Submitted for HR verification' }])
      ]);
      insertedDocsCount++;
    }

    // H. Document with Version 2 (Replacement scenario)
    if (i === 1) {
      const prevVersionObj = [
        {
          version: 1,
          fileName: 'address_proof_old.pdf',
          fileSize: 110000,
          uploadedAt: '2026-09-15T08:00:00Z',
          uploadedBy: 'Priya Sharma',
          rejectionReason: 'Previous electricity bill was older than 3 months'
        }
      ];

      await pool.query(`
        INSERT INTO employee_documents (
          id, employeeId, category, documentType, title,
          filePath, fileName, fileSize, mimeType, version,
          uploadedById, uploadedByRole, uploadedByName,
          verificationStatus, verifiedById, verifiedByName, verifiedAt,
          confidentialityLevel, remarks, versionsJson, auditHistoryJson, createdAt
        ) VALUES (
          ?, ?, 'ADDRESS', 'ADDRESS_PROOF', 'Updated Belagavi Electricity Bill',
          ?, 'address_proof_v2.pdf', 142000, 'application/pdf', 2,
          'usr_hr_01', 'HR_MANAGER', 'Kavita Bhat',
          'VERIFIED', 'usr_hr_01', 'Kavita Bhat', NOW(3),
          'INTERNAL', 'Replacement document verified successfully', ?, ?, NOW(3)
        )
      `, [
        genId('doc'), emp.id, samplePdfPath, JSON.stringify(prevVersionObj),
        JSON.stringify([
          { action: 'REPLACED', by: 'Kavita Bhat', role: 'HR_MANAGER', timestamp: '2026-10-05T11:00:00Z', note: 'Replaced blurry v1 with clean v2' },
          { action: 'VERIFIED', by: 'Kavita Bhat', role: 'HR_MANAGER', timestamp: '2026-10-05T12:00:00Z', note: 'Verified updated electricity bill' }
        ])
      ]);
      insertedDocsCount++;
    }
  }

  console.log(`Successfully seeded ${insertedDocsCount} employee document records across all 35 employees!`);
  console.log('Setup finished successfully!');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
