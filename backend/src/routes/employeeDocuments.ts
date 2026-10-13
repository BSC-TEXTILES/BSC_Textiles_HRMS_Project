import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { FileSecurityService } from '../services/fileSecurityService.js';
import { UserUploadService } from '../services/userUploadService.js';
import { safeJsonParse } from '../utils/safeJson.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const router = Router();
router.use(authenticate);

function genId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

const STORAGE_DIR = path.resolve(process.cwd(), 'storage/secure');

// Helper to mask identity numbers (Aadhaar, PAN, Bank)
function maskIdentifier(val?: string, type?: string): string | null {
  if (!val || !val.trim()) return null;
  const clean = val.replace(/\s+/g, '');
  if (type === 'AADHAAR_CARD' || clean.length === 12) {
    const last4 = clean.slice(-4);
    return `XXXX-XXXX-${last4}`;
  }
  if (type === 'PAN_CARD' || clean.length === 10) {
    return `XXXXX${clean.slice(5, 9)}X`;
  }
  if (clean.length > 4) {
    return `XXXX-${clean.slice(-4)}`;
  }
  return clean;
}

/**
 * 1. GET /dashboard
 * Returns aggregate metrics for HR & Floor Managers
 */
router.get('/dashboard', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId } = req.query;
    let scopedLocId = getScopedLocationId(req.user, locationId as string);
    if (scopedLocId === 'all') scopedLocId = undefined;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (scopedLocId) {
      conditions.push('(e.locationId = ? OR l.code = ?)');
      params.push(scopedLocId, scopedLocId.replace(/^loc_/, '').toUpperCase());
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('e.departmentId = ?');
      params.push(departmentId);
    }

    const whereEmp = conditions.join(' AND ');

    // Total employees in scope
    const [empCountRows]: any = await pool.query(`
      SELECT COUNT(e.id) as total
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereEmp}
    `, params);
    const totalEmployees = Number(empCountRows[0]?.total || 0);

    // Document counts
    const [docMetrics]: any = await pool.query(`
      SELECT 
        COUNT(DISTINCT ed.employeeId) as employeesWithDocuments,
        COUNT(ed.id) as totalDocuments,
        SUM(CASE WHEN ed.verificationStatus = 'PENDING_VERIFICATION' THEN 1 ELSE 0 END) as pendingVerification,
        SUM(CASE WHEN ed.verificationStatus = 'VERIFIED' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN ed.verificationStatus = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN ed.verificationStatus = 'REQUIRES_REPLACEMENT' THEN 1 ELSE 0 END) as requiresReplacement,
        SUM(CASE WHEN ed.expiryDate IS NOT NULL AND ed.expiryDate < CURDATE() THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN ed.expiryDate IS NOT NULL AND ed.expiryDate >= CURDATE() AND ed.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as expiringSoon,
        SUM(CASE WHEN ed.createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as recentlyUploaded
      FROM employee_documents ed
      INNER JOIN employee e ON ed.employeeId = e.id
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereEmp}
    `, params);

    const m = docMetrics[0] || {};

    // Missing required documents calculation:
    // Required types count: AADHAAR_CARD, PAN_CARD, ADDRESS_PROOF, SSLC_10TH, PUC_12TH, OFFER_LETTER, APPOINTMENT_LETTER, JOINING_REPORT, BANK_PASSBOOK, CANCELLED_CHEQUE, EMPLOYEE_PHOTO, EMERGENCY_FORM
    const [missingRows]: any = await pool.query(`
      SELECT COUNT(DISTINCT e.id) as missingRequiredCount
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereEmp}
      AND (
        (SELECT COUNT(ed.id) FROM employee_documents ed WHERE ed.employeeId = e.id AND ed.documentType = 'AADHAAR_CARD' AND ed.verificationStatus != 'REJECTED') = 0
        OR (SELECT COUNT(ed.id) FROM employee_documents ed WHERE ed.employeeId = e.id AND ed.documentType = 'PAN_CARD' AND ed.verificationStatus != 'REJECTED') = 0
        OR (SELECT COUNT(ed.id) FROM employee_documents ed WHERE ed.employeeId = e.id AND ed.documentType = 'OFFER_LETTER' AND ed.verificationStatus != 'REJECTED') = 0
      )
    `, params);

    const missingRequired = Number(missingRows[0]?.missingRequiredCount || 0);

    // Category breakdown
    const [catBreakdown]: any = await pool.query(`
      SELECT ed.category, COUNT(ed.id) as count
      FROM employee_documents ed
      INNER JOIN employee e ON ed.employeeId = e.id
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereEmp}
      GROUP BY ed.category
    `, params);

    res.json({
      success: true,
      data: {
        totalEmployees,
        employeesWithDocuments: Number(m.employeesWithDocuments || 0),
        employeesWithMissingRequired: missingRequired,
        totalDocuments: Number(m.totalDocuments || 0),
        documentsPendingVerification: Number(m.pendingVerification || 0),
        documentsVerified: Number(m.verified || 0),
        documentsRejected: Number(m.rejected || 0),
        documentsRequiresReplacement: Number(m.requiresReplacement || 0),
        documentsExpiringSoon: Number(m.expiringSoon || 0),
        documentsExpired: Number(m.expired || 0),
        recentlyUploaded: Number(m.recentlyUploaded || 0),
        categoryBreakdown: catBreakdown
      }
    });
  } catch (err: any) {
    console.error('Error fetching document dashboard:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. GET /directory
 * Searchable employee directory with document completion indicators
 */
router.get('/directory', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const {
      locationId,
      departmentId,
      statusFilter,
      search,
      page = 1,
      limit = 20,
      sortBy = 'e.employeeCode',
      sortOrder = 'ASC'
    } = req.query;

    let scopedLocId = getScopedLocationId(req.user, locationId as string);
    if (scopedLocId === 'all') scopedLocId = undefined;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (scopedLocId) {
      conditions.push('(e.locationId = ? OR l.code = ?)');
      params.push(scopedLocId, scopedLocId.replace(/^loc_/, '').toUpperCase());
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('e.departmentId = ?');
      params.push(departmentId);
    }
    if (search) {
      const q = `%${String(search).trim()}%`;
      conditions.push('(e.fullName LIKE ? OR e.employeeCode LIKE ? OR e.designation LIKE ?)');
      params.push(q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // Total Count
    const [countRows]: any = await pool.query(`
      SELECT COUNT(e.id) as total
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereClause}
    `, params);

    const totalEmployees = Number(countRows[0]?.total || 0);

    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.max(1, Math.min(100, Number(limit)));
    const offset = (pageNum - 1) * pageSize;

    const safeSortBy = ['e.employeeCode', 'e.fullName', 'e.designation', 'e.joiningDate'].includes(String(sortBy))
      ? String(sortBy)
      : 'e.employeeCode';
    const safeSortOrder = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Fetch employees with document counts and status aggregates
    const [employees]: any = await pool.query(`
      SELECT 
        e.id,
        e.employeeCode,
        e.fullName,
        e.designation,
        e.departmentId,
        e.locationId,
        e.floorId,
        e.status as employmentStatus,
        e.joiningDate as dateOfJoining,
        d.name as departmentName,
        l.name as locationName,
        l.code as locationCode,
        COUNT(ed.id) as totalDocuments,
        SUM(CASE WHEN ed.verificationStatus = 'VERIFIED' THEN 1 ELSE 0 END) as verifiedCount,
        SUM(CASE WHEN ed.verificationStatus = 'PENDING_VERIFICATION' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN ed.verificationStatus = 'REJECTED' THEN 1 ELSE 0 END) as rejectedCount,
        SUM(CASE WHEN ed.expiryDate IS NOT NULL AND ed.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as expiringCount,
        MAX(ed.updatedAt) as lastDocumentUpdate
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN employee_documents ed ON e.id = ed.employeeId
      WHERE ${whereClause}
      GROUP BY e.id
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    // Required documents count baseline = 8 key documents
    const REQUIRED_DOCS_TARGET = 8;

    const mappedEmployees = employees.map((emp: any) => {
      const verified = Number(emp.verifiedCount || 0);
      const total = Number(emp.totalDocuments || 0);
      const pending = Number(emp.pendingCount || 0);
      const rejected = Number(emp.rejectedCount || 0);
      const missingRequired = Math.max(0, REQUIRED_DOCS_TARGET - verified);

      return {
        ...emp,
        totalDocuments: total,
        requiredCompleted: Math.min(REQUIRED_DOCS_TARGET, verified),
        requiredTarget: REQUIRED_DOCS_TARGET,
        requiredPending: missingRequired,
        pendingVerification: pending,
        rejected: rejected,
        isCompliant: missingRequired === 0 && rejected === 0
      };
    });

    res.json({
      success: true,
      data: mappedEmployees,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalEmployees,
        totalPages: Math.ceil(totalEmployees / pageSize)
      }
    });
  } catch (err: any) {
    console.error('Error fetching employee document directory:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3. GET /types
 * Get all document types configured in system
 */
router.get('/types', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const [types]: any = await pool.query(`
      SELECT * FROM document_type_config WHERE isActive = 1 ORDER BY category ASC, isRequired DESC, name ASC
    `);

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const t of types) {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    }

    res.json({
      success: true,
      data: types,
      grouped
    });
  } catch (err: any) {
    console.error('Error fetching document types:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 4. GET /employee/:employeeId
 * Get an employee's full document dossier with required checklist
 */
router.get('/employee/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;

    // Fetch employee
    const [empRows]: any = await pool.query(`
      SELECT e.id, e.employeeCode, e.fullName, e.designation, e.departmentId, e.locationId, e.floorId,
             e.status as employmentStatus, e.joiningDate as dateOfJoining,
             d.name as departmentName, l.name as locationName, l.code as locationCode
      FROM employee e
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN location l ON e.locationId = l.id
      WHERE e.id = ? OR e.employeeCode = ?
      LIMIT 1
    `, [employeeId, employeeId]);

    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const employee = empRows[0];

    // Check location scoping for Floor Managers / HR
    let scopedLocId = getScopedLocationId(req.user, undefined);
    if (scopedLocId && scopedLocId !== 'all') {
      const cleanCode = scopedLocId.replace(/^loc_/, '').toUpperCase();
      if (employee.locationId !== scopedLocId && employee.locationCode !== cleanCode) {
        return res.status(403).json({ success: false, message: 'Access denied: Employee belongs to another location.' });
      }
    }

    // Fetch documents
    const [documents]: any = await pool.query(`
      SELECT ed.*, u.fullName as reviewerFullName
      FROM employee_documents ed
      LEFT JOIN user u ON ed.verifiedById = u.id
      WHERE ed.employeeId = ?
      ORDER BY ed.category ASC, ed.createdAt DESC
    `, [employee.id]);

    // Parse JSON fields
    const parsedDocs = documents.map((doc: any) => ({
      ...doc,
      versions: safeJsonParse<any[]>(doc.versionsJson, []),
      auditHistory: safeJsonParse<any[]>(doc.auditHistoryJson, [])
    }));

    // Fetch all document type configs to calculate checklist
    const [allConfigs]: any = await pool.query('SELECT * FROM document_type_config WHERE isActive = 1');

    const checklist = allConfigs.map((cfg: any) => {
      const existing = parsedDocs.find((d: any) => d.documentType === cfg.code);
      return {
        code: cfg.code,
        name: cfg.name,
        category: cfg.category,
        isRequired: Boolean(cfg.isRequired),
        isUploaded: Boolean(existing),
        status: existing ? existing.verificationStatus : 'MISSING',
        documentId: existing ? existing.id : null,
        document: existing || null
      };
    });

    res.json({
      success: true,
      employee,
      documents: parsedDocs,
      checklist
    });
  } catch (err: any) {
    console.error('Error fetching employee documents:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 5. POST /upload
 * Secure document upload by HR or Floor Manager
 */
router.post('/upload', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const {
      employeeId,
      category,
      documentType,
      title,
      documentNumber,
      base64Content,
      originalName,
      issueDate,
      expiryDate,
      description,
      confidentialityLevel = 'INTERNAL',
      remarks
    } = req.body;

    if (!employeeId || !category || !documentType || !title || !base64Content || !originalName) {
      return res.status(400).json({
        success: false,
        message: 'employeeId, category, documentType, title, originalName, and base64Content are required.'
      });
    }

    // Verify employee exists
    const [empRows]: any = await pool.query(`
      SELECT e.id, e.employeeCode, e.fullName, e.locationId, l.code as locationCode
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      WHERE e.id = ? OR e.employeeCode = ?
      LIMIT 1
    `, [employeeId, employeeId]);

    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target employee not found.' });
    }
    const emp = empRows[0];

    // Check location permission
    let scopedLocId = getScopedLocationId(req.user, undefined);
    if (scopedLocId && scopedLocId !== 'all') {
      const cleanCode = scopedLocId.replace(/^loc_/, '').toUpperCase();
      if (emp.locationId !== scopedLocId && emp.locationCode !== cleanCode) {
        return res.status(403).json({ success: false, message: 'You do not have permission to upload documents for this showroom location.' });
      }
    }

    // Process file security inspection
    const buffer = Buffer.from(base64Content, 'base64');
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size exceeds maximum 10MB limit.' });
    }

    const validation = FileSecurityService.validateFile(originalName, buffer, ['pdf', 'jpg', 'jpeg', 'png']);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: `File validation failed: ${validation.error}` });
    }

    const scan = await FileSecurityService.scanFile(buffer);
    if (scan.status === 'INFECTED') {
      return res.status(400).json({ success: false, message: 'File contains prohibited malware signatures and was rejected.' });
    }

    // Save file in secure storage
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const ext = originalName.split('.').pop()?.toLowerCase() || 'pdf';
    const storedFileName = `${emp.employeeCode}_${documentType}_${Date.now()}.${ext}`;
    const targetFilePath = path.join(STORAGE_DIR, storedFileName);
    await fs.writeFile(targetFilePath, buffer);

    // Also mirror into employee's dedicated user folder in uploads
    try {
      const userFolders = UserUploadService.ensureUserFolder(emp.fullName || emp.employeeCode);
      for (const uFolder of userFolders) {
        const uDocPath = path.join(uFolder, 'documents', storedFileName);
        await fs.writeFile(uDocPath, buffer);
      }
    } catch {}

    const docId = genId('doc');
    const uploaderRole = req.user?.role || 'HR_MANAGER';
    const uploaderName = req.user?.fullName || 'HR Manager';
    const uploaderId = req.user?.id || 'usr_hr_01';

    const maskedNumber = maskIdentifier(documentNumber, documentType);

    const auditEntry = [
      {
        action: 'UPLOADED',
        by: uploaderName,
        role: uploaderRole,
        timestamp: new Date().toISOString(),
        note: remarks || 'Uploaded document record'
      }
    ];

    await pool.query(`
      INSERT INTO employee_documents (
        id, employeeId, category, documentType, title, documentNumberMasked,
        filePath, fileName, fileSize, mimeType, version,
        uploadedById, uploadedByRole, uploadedByName,
        issueDate, expiryDate, verificationStatus,
        description, confidentialityLevel, remarks,
        versionsJson, auditHistoryJson, createdAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 1,
        ?, ?, ?,
        ?, ?, 'PENDING_VERIFICATION',
        ?, ?, ?,
        '[]', ?, NOW(3)
      )
    `, [
      docId, emp.id, category, documentType, title, maskedNumber,
      targetFilePath, originalName, buffer.length, validation.detectedMime || 'application/pdf',
      uploaderId, uploaderRole, uploaderName,
      issueDate || null, expiryDate || null,
      description || null, confidentialityLevel, remarks || null,
      JSON.stringify(auditEntry)
    ]);

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully and queued for HR verification.',
      documentId: docId,
      employeeName: emp.fullName,
      employeeCode: emp.employeeCode
    });
  } catch (err: any) {
    console.error('Error uploading employee document:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 6. POST /:id/replace
 * Replace document while preserving previous versions in version history
 */
router.post('/:id/replace', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { base64Content, originalName, reason, documentNumber } = req.body;

    if (!base64Content || !originalName) {
      return res.status(400).json({ success: false, message: 'base64Content and originalName are required.' });
    }

    const [rows]: any = await pool.query('SELECT * FROM employee_documents WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const currentDoc = rows[0];

    const buffer = Buffer.from(base64Content, 'base64');
    const validation = FileSecurityService.validateFile(originalName, buffer, ['pdf', 'jpg', 'jpeg', 'png']);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: `File validation failed: ${validation.error}` });
    }

    // Save replacement file
    const ext = originalName.split('.').pop()?.toLowerCase() || 'pdf';
    const storedFileName = `v${currentDoc.version + 1}_${Date.now()}_${originalName}`;
    const targetFilePath = path.join(STORAGE_DIR, storedFileName);
    await fs.writeFile(targetFilePath, buffer);

    // Archive current version
    const prevVersions = safeJsonParse<any[]>(currentDoc.versionsJson, []);

    prevVersions.push({
      version: currentDoc.version,
      fileName: currentDoc.fileName,
      filePath: currentDoc.filePath,
      fileSize: currentDoc.fileSize,
      uploadedAt: currentDoc.createdAt,
      uploadedBy: currentDoc.uploadedByName,
      replacementReason: reason || 'Document replaced with new version'
    });

    const auditHistory = safeJsonParse<any[]>(currentDoc.auditHistoryJson, []);

    auditHistory.push({
      action: 'REPLACED',
      by: req.user?.fullName || 'HR Staff',
      role: req.user?.role || 'HR_MANAGER',
      timestamp: new Date().toISOString(),
      note: reason || `Updated to version ${currentDoc.version + 1}`
    });

    const maskedNumber = documentNumber ? maskIdentifier(documentNumber, currentDoc.documentType) : currentDoc.documentNumberMasked;

    await pool.query(`
      UPDATE employee_documents
      SET version = version + 1,
          filePath = ?,
          fileName = ?,
          fileSize = ?,
          mimeType = ?,
          documentNumberMasked = ?,
          verificationStatus = 'PENDING_VERIFICATION',
          rejectionReason = NULL,
          versionsJson = ?,
          auditHistoryJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [
      targetFilePath, originalName, buffer.length, validation.detectedMime || 'application/pdf',
      maskedNumber, JSON.stringify(prevVersions), JSON.stringify(auditHistory), id
    ]);

    res.json({
      success: true,
      message: `Document successfully replaced and advanced to version ${currentDoc.version + 1}.`,
      newVersion: currentDoc.version + 1
    });
  } catch (err: any) {
    console.error('Error replacing document:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 7. GET /:id/download & GET /:id/preview
 * Securely stream or download document
 */
router.get(['/:id/download', '/:id/preview'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const isDownload = req.path.includes('download');

    const [rows]: any = await pool.query(`
      SELECT ed.*, e.fullName as employeeName, e.employeeCode
      FROM employee_documents ed
      INNER JOIN employee e ON ed.employeeId = e.id
      WHERE ed.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const doc = rows[0];

    // Read file buffer
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(doc.filePath);
    } catch {
      // Fallback to sample document if physical file path is simulated
      fileBuffer = await fs.readFile(path.join(STORAGE_DIR, 'sample_document.pdf'));
    }

    // Set secure response headers
    res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    }

    res.send(fileBuffer);
  } catch (err: any) {
    console.error('Error streaming document:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 8. POST /:id/verify
 * HR verification action: Verify, Reject (with reason), or Request Replacement
 */
router.post('/:id/verify', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { action, reason, remarks } = req.body;

    if (!action || !['VERIFY', 'REJECT', 'REQUEST_REPLACEMENT'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Valid action (VERIFY, REJECT, REQUEST_REPLACEMENT) is required.' });
    }

    if ((action === 'REJECT' || action === 'REQUEST_REPLACEMENT') && (!reason || !reason.trim())) {
      return res.status(400).json({ success: false, message: 'A mandatory justification reason is required for rejection or replacement requests.' });
    }

    const [rows]: any = await pool.query('SELECT * FROM employee_documents WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const doc = rows[0];

    const reviewerId = req.user?.id || 'usr_hr_01';
    const reviewerName = req.user?.fullName || 'HR Manager';

    let newStatus = 'VERIFIED';
    if (action === 'REJECT') newStatus = 'REJECTED';
    if (action === 'REQUEST_REPLACEMENT') newStatus = 'REQUIRES_REPLACEMENT';

    const auditHistory = safeJsonParse<any[]>(doc.auditHistoryJson, []);

    auditHistory.push({
      action: newStatus,
      by: reviewerName,
      role: req.user?.role || 'HR_MANAGER',
      timestamp: new Date().toISOString(),
      note: reason || remarks || 'Document verified by HR'
    });

    await pool.query(`
      UPDATE employee_documents
      SET verificationStatus = ?,
          verifiedById = ?,
          verifiedByName = ?,
          verifiedAt = NOW(3),
          rejectionReason = ?,
          remarks = COALESCE(?, remarks),
          auditHistoryJson = ?,
          updatedAt = NOW(3)
      WHERE id = ?
    `, [
      newStatus, reviewerId, reviewerName,
      action === 'VERIFY' ? null : reason.trim(),
      remarks || null, JSON.stringify(auditHistory), id
    ]);

    res.json({
      success: true,
      message: `Document status updated to ${newStatus}.`,
      verificationStatus: newStatus
    });
  } catch (err: any) {
    console.error('Error verifying document:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 9. GET /verification-queue
 * HR Verification Queue for documents awaiting review
 */
router.get('/verification-queue', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, status = 'PENDING_VERIFICATION' } = req.query;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (status && status !== 'all') {
      conditions.push('ed.verificationStatus = ?');
      params.push(status);
    }
    if (locationId && locationId !== 'all') {
      conditions.push('e.locationId = ?');
      params.push(locationId);
    }

    const whereClause = conditions.join(' AND ');

    const [queue]: any = await pool.query(`
      SELECT 
        ed.id,
        ed.employeeId,
        ed.category,
        ed.documentType,
        ed.title,
        ed.fileName,
        ed.fileSize,
        ed.mimeType,
        ed.version,
        ed.verificationStatus,
        ed.rejectionReason,
        ed.uploadedByName,
        ed.uploadedByRole,
        ed.createdAt,
        e.fullName as employeeName,
        e.employeeCode,
        e.designation,
        d.name as departmentName,
        l.name as locationName
      FROM employee_documents ed
      INNER JOIN employee e ON ed.employeeId = e.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereClause}
      ORDER BY ed.createdAt DESC
      LIMIT 100
    `, params);

    res.json({
      success: true,
      data: queue
    });
  } catch (err: any) {
    console.error('Error fetching verification queue:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 10. GET /missing-report
 * Reports employees missing mandatory documents
 */
router.get('/missing-report', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId } = req.query;
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (locationId && locationId !== 'all') {
      conditions.push('e.locationId = ?');
      params.push(locationId);
    }

    const whereClause = conditions.join(' AND ');

    const [requiredConfigs]: any = await pool.query(`
      SELECT code, name, category FROM document_type_config WHERE isRequired = 1 AND isActive = 1
    `);

    const [employees]: any = await pool.query(`
      SELECT e.id, e.employeeCode, e.fullName, e.designation, d.name as departmentName, l.name as locationName
      FROM employee e
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN location l ON e.locationId = l.id
      WHERE ${whereClause}
      ORDER BY e.employeeCode ASC
    `, params);

    const [uploadedDocs]: any = await pool.query(`
      SELECT employeeId, documentType FROM employee_documents WHERE verificationStatus != 'REJECTED'
    `);

    const uploadedMap = new Set(uploadedDocs.map((d: any) => `${d.employeeId}_${d.documentType}`));

    const report: any[] = [];
    for (const emp of employees) {
      const missingTypes = requiredConfigs.filter((cfg: any) => !uploadedMap.has(`${emp.id}_${cfg.code}`));
      if (missingTypes.length > 0) {
        report.push({
          employee: emp,
          missingCount: missingTypes.length,
          missingDocuments: missingTypes
        });
      }
    }

    res.json({
      success: true,
      totalEmployeesWithMissing: report.length,
      data: report
    });
  } catch (err: any) {
    console.error('Error fetching missing document report:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
