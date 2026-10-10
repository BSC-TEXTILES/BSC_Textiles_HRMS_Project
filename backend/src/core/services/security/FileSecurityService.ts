/**
 * FileSecurityService — Secure file upload validation, malware scanning,
 * and quarantine management.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

// ─── Constants ─────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_DIMENSIONS = 8192;       // px
const MAX_ZIP_ENTRIES = 100;
const MAX_ZIP_RATIO = 10;               // decompression bomb threshold

/** Allowlisted MIME → extensions map per upload context */
const ALLOWED_TYPES: Record<string, { mimes: string[]; exts: string[] }> = {
  image: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  },
  document: {
    mimes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    exts: ['.pdf', '.xlsx', '.xls', '.csv', '.doc', '.docx'],
  },
  archive: {
    mimes: ['application/zip', 'application/x-zip-compressed'],
    exts: ['.zip'],
  },
};

/** Magic byte signatures for file type verification */
const MAGIC_BYTES: Array<{ type: string; bytes: number[] }> = [
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { type: 'application/vnd.openxmlformats', bytes: [0x50, 0x4b, 0x03, 0x04] }, // OOXML is ZIP
];

/** EICAR test string SHA-256 */
const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  sha256: string;
  detectedMime: string;
  magicBytes: string;
}

export interface ScanResult {
  clean: boolean;
  engine: string;
  version: string;
  detections: string[];
}

export class FileSecurityService {
  private readonly uploadDir: string;
  private readonly quarantineDir: string;

  constructor(private readonly pool: Pool) {
    this.uploadDir = path.resolve(process.cwd(), 'uploads', 'secure');
    this.quarantineDir = path.resolve(process.cwd(), 'uploads', 'quarantine');

    // Ensure directories exist
    for (const dir of [this.uploadDir, this.quarantineDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────
  /**
   * Validate a file buffer against allowlisted types, size limits,
   * magic bytes, and extension checks.
   */
  validateFile(
    buffer: Buffer,
    originalName: string,
    context: 'image' | 'document' | 'archive',
  ): FileValidationResult {
    const errors: string[] = [];
    const ext = path.extname(originalName).toLowerCase();
    const allowed = ALLOWED_TYPES[context];

    // 1. Extension check
    if (!allowed.exts.includes(ext)) {
      errors.push(`File extension "${ext}" is not allowed for ${context} uploads`);
    }

    // 2. Double extension check
    const basename = path.basename(originalName, ext);
    if (path.extname(basename)) {
      errors.push('Double file extensions are not allowed');
    }

    // 3. Size check
    if (buffer.length > MAX_FILE_SIZE) {
      errors.push(`File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
    }
    if (buffer.length === 0) {
      errors.push('Empty files are not allowed');
    }

    // 4. Magic bytes verification
    const detectedMime = this.detectMimeByMagic(buffer);
    const magicHex = buffer.slice(0, 8).toString('hex');

    if (detectedMime && !allowed.mimes.some(m => detectedMime.startsWith(m.split('/')[0]))) {
      errors.push(`File content (${detectedMime}) does not match allowed types`);
    }

    // 5. Path traversal in filename
    if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
      errors.push('Filename contains path traversal characters');
    }

    // 6. SHA-256 hash
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      valid: errors.length === 0,
      errors,
      sha256,
      detectedMime: detectedMime || 'application/octet-stream',
      magicBytes: magicHex,
    };
  }

  // ─── Scanning ──────────────────────────────────────────────────────
  /**
   * Scan a file for known malicious patterns.
   * Uses built-in pattern matching + EICAR test string detection.
   * In production, should integrate with ClamAV via clamdscan.
   */
  async scanFile(buffer: Buffer, sha256: string): Promise<ScanResult> {
    const detections: string[] = [];

    // 1. EICAR test file detection
    if (sha256 === EICAR_SHA256) {
      detections.push('EICAR-Test-File');
    }

    // 2. Check content for known malicious patterns
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 65536));

    // Script injection in files
    if (/<script\b/i.test(content)) {
      detections.push('Embedded-Script-Tag');
    }

    // PHP code in uploads
    if (/<\?php/i.test(content)) {
      detections.push('PHP-Code-Injection');
    }

    // Shell commands
    if (/\b(eval|exec|system|passthru|shell_exec)\s*\(/i.test(content)) {
      detections.push('Shell-Command-Injection');
    }

    // 3. Check against database malware signatures
    try {
      const [sigs] = await this.pool.query(
        "SELECT name, pattern, type FROM malware_signature WHERE enabled = 1 AND type = 'hash'",
      ) as any;

      for (const sig of sigs) {
        if (sig.pattern === sha256) {
          detections.push(`Malware-Signature:${sig.name}`);
        }
      }
    } catch {
      // Signature DB may not be populated yet
    }

    return {
      clean: detections.length === 0,
      engine: 'BSC-FileGuard',
      version: '1.0.0',
      detections,
    };
  }

  // ─── Storage ──────────────────────────────────────────────────────
  /**
   * Store an approved file with a randomized server-side filename.
   * Returns the stored path and generated name.
   */
  async storeFile(
    buffer: Buffer,
    originalName: string,
    userId: string,
    context: string,
    entityType?: string,
    entityId?: string,
  ): Promise<{
    id: string;
    storedName: string;
    storedPath: string;
  }> {
    const ext = path.extname(originalName).toLowerCase();
    const storedName = `${uuid()}${ext}`;
    const storedPath = path.join(this.uploadDir, storedName);

    // Validate
    const validation = this.validateFile(buffer, originalName, context as any);
    if (!validation.valid) {
      throw new Error(`File validation failed: ${validation.errors.join('; ')}`);
    }

    // Scan
    const scan = await this.scanFile(buffer, validation.sha256);

    const fileId = uuid();
    const status = scan.clean ? 'APPROVED' : 'QUARANTINED';
    const targetPath = scan.clean ? storedPath : path.join(this.quarantineDir, storedName);

    // Write file
    fs.writeFileSync(targetPath, buffer);

    // Record in database
    await this.pool.query(
      `INSERT INTO file_upload
        (id, userId, originalName, storedName, mimeType, extension, size, sha256, magicBytes,
         status, scanResult, scanEngine, scanVersion, scannedAt,
         quarantineReason, relatedEntityType, relatedEntityId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, ?, NOW(3), NOW(3))`,
      [
        fileId,
        userId,
        originalName,
        storedName,
        validation.detectedMime,
        ext,
        buffer.length,
        validation.sha256,
        validation.magicBytes,
        status,
        JSON.stringify(scan),
        scan.engine,
        scan.version,
        scan.clean ? null : scan.detections.join(', '),
        entityType || null,
        entityId || null,
      ],
    );

    if (!scan.clean) {
      throw new Error(`File quarantined: ${scan.detections.join(', ')}`);
    }

    return { id: fileId, storedName, storedPath };
  }

  /**
   * Serve a file through an authorized download handler.
   * Returns the file path only if the file is approved.
   */
  async getFilePath(fileId: string): Promise<string | null> {
    const [rows] = await this.pool.query(
      "SELECT storedName, status FROM file_upload WHERE id = ? AND status = 'APPROVED'",
      [fileId],
    ) as any;

    if (!rows.length) return null;

    const filePath = path.join(this.uploadDir, rows[0].storedName);
    if (!fs.existsSync(filePath)) return null;

    // Increment download count
    await this.pool.query(
      'UPDATE file_upload SET downloadCount = downloadCount + 1 WHERE id = ?',
      [fileId],
    );

    return filePath;
  }

  // ─── Private Helpers ────────────────────────────────────────────────
  private detectMimeByMagic(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    for (const sig of MAGIC_BYTES) {
      const match = sig.bytes.every((byte, i) => buffer[i] === byte);
      if (match) return sig.type;
    }

    return null;
  }
}
