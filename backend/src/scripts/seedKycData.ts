import { pool } from '../nativeDb.js';

async function seedKycData() {
  console.log('--- Seeding KYC & DigiLocker Records ---');

  // Fetch some employees
  const [employees]: any = await pool.query(`SELECT id, employeeCode, fullName, locationId FROM employee LIMIT 10`);
  if (!employees || employees.length === 0) {
    console.log('No employees found to seed KYC');
    process.exit(0);
  }

  // Clear existing seed records if any
  await pool.query(`DELETE FROM kyc_documents`);
  await pool.query(`DELETE FROM kyc_consents`);

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const consentId = `consent-${emp.id}`;

    // 1. Consent record
    await pool.query(`
      INSERT INTO kyc_consents (id, employeeId, consentType, purpose, scopes, ipAddress, userAgent, status, consentedAt, expiresAt)
      VALUES (?, ?, 'DIGILOCKER_FETCH', ?, 'doc_fetch:ADHAR,doc_fetch:PANCR,doc_fetch:DRVLC', '192.168.1.102', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'ACTIVE', DATE_SUB(NOW(), INTERVAL ? DAY), DATE_ADD(NOW(), INTERVAL 365 DAY))
    `, [
      consentId,
      emp.id,
      'Identity verification, regulatory compliance under Karnataka Factories Act 1948, and employee digital dossier management.',
      i * 2 + 1
    ]);

    // 2. Aadhaar Document (DigiLocker verified with masked number)
    const last4 = (1000 + i * 37).toString().slice(-4);
    await pool.query(`
      INSERT INTO kyc_documents (
        id, employeeId, documentType, documentNumberMasked, issuer, source, status,
        digilockerDocUri, digilockerDocType, fileName, mimeType, fileSize,
        verifiedAt, verifiedBy, metadata, createdAt
      ) VALUES (?, ?, 'AADHAAR', ?, 'UIDAI', 'DIGILOCKER', 'VERIFIED', ?, 'ADHAR', 'Aadhaar_Verified_DigiLocker.pdf', 'application/pdf', 142080, DATE_SUB(NOW(), INTERVAL ? DAY), 'SYSTEM_DIGILOCKER_PKCE', ?, DATE_SUB(NOW(), INTERVAL ? DAY))
    `, [
      `kyc-doc-adh-${emp.id}`,
      emp.id,
      `XXXX-XXXX-${last4}`,
      `in.gov.uidai:ADHAR:${last4}`,
      i * 2 + 1,
      JSON.stringify({
        xmlDigestVerified: true,
        signatureValid: true,
        issuedDate: '2023-04-12',
        maskedUid: `XXXX-XXXX-${last4}`,
        authType: 'DIGILOCKER_OAUTH_PKCE'
      }),
      i * 2 + 1
    ]);

    // 3. PAN Card Document
    const panChar = String.fromCharCode(65 + (i % 26));
    const panMasked = `XXXXX${last4.slice(0, 3)}${panChar}`;
    const panStatus = i % 3 === 0 ? 'SUBMITTED' : 'VERIFIED';
    await pool.query(`
      INSERT INTO kyc_documents (
        id, employeeId, documentType, documentNumberMasked, issuer, source, status,
        digilockerDocUri, digilockerDocType, fileName, mimeType, fileSize,
        verifiedAt, verifiedBy, metadata, createdAt
      ) VALUES (?, ?, 'PAN', ?, 'Income Tax Department', 'DIGILOCKER', ?, ?, 'PANCR', 'PAN_Card_eSigned.pdf', 'application/pdf', 98400, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))
    `, [
      `kyc-doc-pan-${emp.id}`,
      emp.id,
      panMasked,
      panStatus,
      `in.gov.pan:PANCR:${panMasked}`,
      panStatus === 'VERIFIED' ? new Date() : null,
      panStatus === 'VERIFIED' ? 'HR_ADMIN_AUTO' : null,
      JSON.stringify({ panDigest: 'SHA256_VERIFIED', category: 'Individual' }),
      i * 2 + 1
    ]);

    // 4. Manual Fallback Document (e.g. Degree or Driving License)
    if (i % 2 === 0) {
      const docType = i % 4 === 0 ? 'DRIVING_LICENSE' : 'DEGREE_CERTIFICATE';
      const manualStatus = i === 0 ? 'PENDING' : i === 2 ? 'VERIFIED' : 'REJECTED';
      await pool.query(`
        INSERT INTO kyc_documents (
          id, employeeId, documentType, documentNumberMasked, issuer, source, status,
          fileUrl, fileName, mimeType, fileSize, rejectionReason, verifiedAt, verifiedBy, createdAt
        ) VALUES (?, ?, ?, ?, ?, 'MANUAL_UPLOAD', ?, ?, ?, 'application/pdf', 245000, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))
      `, [
        `kyc-doc-man-${emp.id}`,
        emp.id,
        docType,
        docType === 'DRIVING_LICENSE' ? `KA-${(20 + i).toString().padStart(2, '0')}-XXXX-${last4}` : `REG-XXXX-${last4}`,
        docType === 'DRIVING_LICENSE' ? 'Karnataka Transport Dept (RTO)' : 'Visvesvaraya Technological University (VTU)',
        manualStatus,
        `/uploads/kyc/${docType.toLowerCase()}_${emp.employeeCode}.pdf`,
        `${docType.toLowerCase()}_${emp.employeeCode}.pdf`,
        manualStatus === 'REJECTED' ? 'Document scan blurry, university seal not clearly legible' : null,
        manualStatus === 'VERIFIED' ? new Date() : null,
        manualStatus === 'VERIFIED' ? 'Kavita Bhat (HR Executive)' : null,
        i * 2
      ]);
    }
  }

  console.log(`✅ Seeded KYC records for ${employees.length} employees successfully!`);
  process.exit(0);
}

seedKycData().catch((err) => {
  console.error('Failed to seed KYC data:', err);
  process.exit(1);
});
