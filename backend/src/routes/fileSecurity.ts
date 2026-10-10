import { Router } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';
import { FileSecurityService } from '../services/fileSecurityService.js';
import { uploadLimiter } from '../middleware/rateLimiting.js';
import { prisma } from '../db.js';

const router = Router();

router.use(authenticate);

/**
 * POST /api/files/upload
 * Secure file upload with magic byte inspection, random name generation and malware scanning
 */
router.post('/upload', uploadLimiter, async (req: AuthRequest, res) => {
  try {
    const { originalName, base64Content, allowedTypes, relatedEntityType, relatedEntityId } = req.body;

    if (!originalName || !base64Content) {
      return res.status(400).json({ error: 'Original filename and base64Content are required' });
    }

    const buffer = Buffer.from(base64Content, 'base64');
    const allowed = Array.isArray(allowedTypes) && allowedTypes.length > 0
      ? allowedTypes
      : ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'xlsx', 'csv', 'docx'];

    const result = await FileSecurityService.processUpload({
      userId: req.user!.id,
      originalName,
      buffer,
      allowedExtensions: allowed,
      relatedEntityType,
      relatedEntityId,
    });

    res.status(201).json({
      message: 'File verified and stored securely',
      fileId: result.fileId,
      status: result.status,
      sha256: result.sha256,
    });
  } catch (error: any) {
    res.status(400).json({ error: 'Upload rejected', message: error.message });
  }
});

/**
 * GET /api/files/:id/download
 * Secure download handler: checks permissions and serves approved files only
 */
router.get('/:id/download', async (req: AuthRequest, res) => {
  try {
    const { buffer, fileRecord } = await FileSecurityService.getFile(req.params.id);

    // Ensure user has access (either owner, or elevated role)
    if (fileRecord.userId !== req.user!.id && req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied to this file' });
    }

    res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileRecord.originalName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error: any) {
    res.status(404).json({ error: 'Download failed', message: error.message });
  }
});

/**
 * GET /api/files/quarantine
 * Admin View: List quarantined or infected files
 */
router.get('/quarantine', requireRole('SUPER_ADMIN', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const quarantined = await prisma.fileUpload.findMany({
      where: {
        status: { in: ['QUARANTINED', 'INFECTED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    res.json({ quarantinedFiles: quarantined });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch quarantine records' });
  }
});

export default router;
