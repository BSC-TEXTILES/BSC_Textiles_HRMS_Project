import { pool } from '../nativeDb.js';

async function setupKycSchema() {
  console.log('--- Setting up KYC & DigiLocker Database Schema ---');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_documents (
      id VARCHAR(191) PRIMARY KEY,
      employeeId VARCHAR(191) NOT NULL,
      documentType VARCHAR(50) NOT NULL,
      documentNumberMasked VARCHAR(100) NULL,
      issuer VARCHAR(150) NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'MANUAL_UPLOAD',
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      fileUrl VARCHAR(500) NULL,
      fileName VARCHAR(255) NULL,
      fileSize INT NULL,
      mimeType VARCHAR(100) NULL,
      digilockerDocUri VARCHAR(255) NULL,
      digilockerDocType VARCHAR(50) NULL,
      metadata JSON NULL,
      verifiedAt DATETIME(3) NULL,
      verifiedBy VARCHAR(191) NULL,
      rejectionReason TEXT NULL,
      expiryDate DATE NULL,
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_kyc_doc_emp (employeeId),
      INDEX idx_kyc_doc_status (status),
      INDEX idx_kyc_doc_type (documentType)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_consents (
      id VARCHAR(191) PRIMARY KEY,
      employeeId VARCHAR(191) NOT NULL,
      consentType VARCHAR(50) NOT NULL DEFAULT 'DIGILOCKER_FETCH',
      purpose TEXT NOT NULL,
      scopes VARCHAR(255) NOT NULL,
      ipAddress VARCHAR(45) NULL,
      userAgent VARCHAR(255) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      consentedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      expiresAt DATETIME(3) NULL,
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_kyc_consent_emp (employeeId),
      INDEX idx_kyc_consent_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_settings (
      id VARCHAR(191) PRIMARY KEY,
      digilockerClientId VARCHAR(191) NULL,
      digilockerRequesterOrgId VARCHAR(191) NULL,
      digilockerApiUrl VARCHAR(255) DEFAULT 'https://api.digitallocker.gov.in/public/oauth2/1',
      isSandbox BOOLEAN DEFAULT TRUE,
      consentExpiryDays INT DEFAULT 365,
      allowedDocTypes JSON NULL,
      requireAadhaarMasking BOOLEAN DEFAULT TRUE,
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Insert default setting row if not exists
  await pool.query(`
    INSERT IGNORE INTO kyc_settings (id, digilockerClientId, digilockerRequesterOrgId, isSandbox, consentExpiryDays, allowedDocTypes, requireAadhaarMasking)
    VALUES (
      'global-kyc-settings',
      'BSC_TEXTILES_REQ_8819',
      'ORG-KA-TEXTILES-001',
      TRUE,
      365,
      '["AADHAAR", "PAN", "DRIVING_LICENSE", "VOTER_ID", "DEGREE_CERTIFICATE", "EXPERIENCE_LETTER"]',
      TRUE
    );
  `);

  console.log('✅ KYC & DigiLocker Database Tables created successfully!');
  process.exit(0);
}

setupKycSchema().catch((err) => {
  console.error('Failed to setup KYC schema:', err);
  process.exit(1);
});
