import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.use(authenticate);

const holidaySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    date: z.string(),
    locationId: z.string().optional(),
    departmentId: z.string().optional(),
    isRecurring: z.boolean().optional(),
  }),
});

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const scopedLocId = getScopedLocationId(req.user, locationId);
    const where: any = {};
    if (scopedLocId) where.locationId = scopedLocId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(String(startDate));
      if (endDate) where.date.lte = new Date(String(endDate));
    }
    
    const [holidays, total] = await Promise.all([
      prisma.holiday.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { date: 'asc' },
        include: {
          location: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.holiday.count({ where }),
    ]);
    
    res.json({ holidays, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get holidays error:', error);
    res.status(500).json({ error: 'Failed to get holidays' });
  }
});

// Download CSV template for BSC Holidays
router.get('/template', authorize('VIEW'), async (_req: AuthRequest, res) => {
  const csvHeaders = 'Name,Date,Type,Description,Location\n';
  const sampleRows = [
    'Makara Sankranti / Pongal,2025-01-15,MANDATORY,Karnataka State Harvest Festival,ALL',
    'Republic Day,2025-01-26,NATIONAL,National Holiday (Full Paid),ALL',
    'Ugadi (Kannada New Year),2025-03-30,MANDATORY,Karnataka Gazetted Festival,ALL',
    'May Day (Labour Day),2025-05-01,NATIONAL,International Workers Day,ALL',
    'Independence Day,2025-08-15,NATIONAL,National Holiday (Full Paid),ALL',
    'Ganesh Chaturthi,2025-08-27,MANDATORY,Regional Festival Holiday,ALL',
    'Gandhi Jayanti,2025-10-02,NATIONAL,National Holiday (Full Paid),ALL',
    'Ayudha Puja (Machinery Sanctification),2025-10-01,MANDATORY,Textile Machinery Sanctification,ALL',
    'Deepavali / Naraka Chaturdashi,2025-10-20,MANDATORY,Diwali Festive Bonus Day,ALL',
    'Kannada Rajyotsava,2025-11-01,STATE,Karnataka State Formation Day,ALL',
    'Christmas,2025-12-25,NATIONAL,Statutory Declared Holiday,ALL',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bsc_holidays_template.csv"');
  return res.status(200).send(csvHeaders + sampleRows);
});

// Helper to check HR / Admin management authority
function isHolidayManager(user: any): boolean {
  if (!user) return false;
  const role = user.role;
  return (
    role === 'SUPER_ADMIN' ||
    role === 'HR_MANAGER' ||
    role === 'HR_EXECUTIVE' ||
    role === 'LOCATION_MANAGER' ||
    (Array.isArray(user.permissions) && user.permissions.includes('ADD'))
  );
}

// Bulk upload holidays via CSV / JSON
router.post('/bulk', async (req: AuthRequest, res) => {
  try {
    if (!isHolidayManager(req.user)) {
      return res.status(403).json({ error: 'Access denied: HR Manager or Admin privileges required' });
    }

    const { holidays } = req.body;
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ error: 'Array of holidays is required' });
    }

    const createdRecords: any[] = [];
    const errors: string[] = [];

    for (const item of holidays) {
      try {
        if (!item.name || !item.date) {
          errors.push(`Skipped record missing name or date: ${JSON.stringify(item)}`);
          continue;
        }

        const parsedDate = new Date(item.date);
        if (isNaN(parsedDate.getTime())) {
          errors.push(`Invalid date format for ${item.name}: ${item.date}`);
          continue;
        }

        const targetLocationId = req.user!.role === 'SUPER_ADMIN'
          ? (item.locationId && item.locationId !== 'ALL' ? item.locationId : null)
          : (req.user!.locationId || null);

        const record = await prisma.holiday.create({
          data: {
            name: String(item.name).trim(),
            date: parsedDate,
            locationId: targetLocationId,
            departmentId: item.departmentId || null,
            isRecurring: Boolean(item.isRecurring),
          },
        });
        createdRecords.push(record);
      } catch (err: any) {
        errors.push(`Failed to insert ${item.name}: ${err.message}`);
      }
    }

    return res.status(201).json({
      message: `Successfully imported ${createdRecords.length} holidays`,
      count: createdRecords.length,
      holidays: createdRecords,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Bulk holiday import error:', error);
    return res.status(500).json({ error: error.message || 'Failed to import holidays' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    if (!isHolidayManager(req.user)) {
      return res.status(403).json({ error: 'Access denied: HR Manager or Admin privileges required' });
    }

    const { name, date, locationId, departmentId, isRecurring } = req.body;
    if (!name || !date) {
      return res.status(400).json({ error: 'Name and date are required' });
    }
    
    const targetLocationId = req.user!.role === 'SUPER_ADMIN' ? (locationId || null) : req.user!.locationId;
    if (req.user!.role !== 'SUPER_ADMIN' && locationId && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const holiday = await prisma.holiday.create({
      data: {
        name,
        date: new Date(date),
        locationId: targetLocationId,
        departmentId,
        isRecurring: isRecurring || false,
      },
    });
    
    res.status(201).json(holiday);
  } catch (error) {
    console.error('Create holiday error:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

router.put('/:id', authorize('EDIT'), validate(holidaySchema), async (req: AuthRequest, res) => {
  try {
    const { name, date, locationId, departmentId, isRecurring } = req.body;
    
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const holiday = await prisma.holiday.update({
      where: { id: req.params.id },
      data: {
        name,
        date: new Date(date),
        departmentId,
        isRecurring,
      },
    });
    
    res.json(holiday);
  } catch (error) {
    console.error('Update holiday error:', error);
    res.status(500).json({ error: 'Failed to update holiday' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.holiday.delete({ where: { id: req.params.id } });
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Delete holiday error:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

export default router;