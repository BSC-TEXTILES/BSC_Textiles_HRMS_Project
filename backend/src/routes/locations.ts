import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';
import { cacheService } from '../services/cacheService.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    
    if (req.user!.role !== 'SUPER_ADMIN') {
      where.id = req.user!.locationId;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
        { city: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    
    if (status) where.status = status;
    
    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          manager: { select: { id: true, fullName: true, email: true } },
          hrManager: { select: { id: true, fullName: true, email: true } },
          _count: {
            select: { employees: true, floors: true, departments: true },
          },
        },
      }),
      prisma.location.count({ where }),
    ]);
    
    res.json({ locations, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

router.get('/all', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role || 'EMPLOYEE';
    const userLocId = req.user?.locationId || 'none';
    const cacheKey = `locations:all:${userRole}:${userLocId}`;

    const cached = cacheService.get<any[]>(cacheKey);
    if (cached) {
      if (req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
      return res.json(cached.data);
    }

    const where: any = { status: 'ACTIVE' };
    if (userRole !== 'SUPER_ADMIN' && userLocId !== 'none') {
      where.id = userLocId;
    }
    
    const locations = await prisma.location.findMany({
      where,
      select: { id: true, code: true, name: true, city: true, state: true },
      orderBy: { name: 'asc' },
    });
    
    const etag = cacheService.set(cacheKey, locations, 60_000);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(locations);
  } catch (error) {
    console.error('Get all locations error:', error);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: {
        manager: { select: { id: true, fullName: true, email: true } },
        hrManager: { select: { id: true, fullName: true, email: true } },
        floors: {
          where: { status: 'ACTIVE' },
          include: { _count: { select: { sections: true, sellingPoints: true } } },
        },
        departments: {},
        attendanceRules: true,
        breakRules: true,
        incentiveRules: { where: { status: 'ACTIVE' } },
        weeklyOffRules: { where: { effectiveTo: null } },
        _count: { select: { employees: true, floors: true, departments: true, sellingPoints: true } },
      },
    });
    
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && location.id !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(location);
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

router.post('/', authorize('ADD'), validate(schemas.location), async (req: AuthRequest, res) => {
  try {
    const { code, name, address, city, state, pin, phone, email, whatsapp, managerId, hrManagerId, openingTime, closingTime } = req.body;
    
    const existing = await prisma.location.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
      return res.status(400).json({ error: 'Location code already exists' });
    }
    
    const location = await prisma.location.create({
      data: {
        code: code.toUpperCase(),
        name,
        address,
        city,
        state,
        pin,
        phone,
        email,
        whatsapp,
        managerId,
        hrManagerId,
        openingTime: openingTime ? new Date(openingTime) : null,
        closingTime: closingTime ? new Date(closingTime) : null,
        status: 'ACTIVE',
      },
    });
    
    // Create default attendance rules
    await prisma.attendanceRules.create({
      data: {
        locationId: location.id,
        loginTime: new Date('2024-01-01T09:30:00'),
        logoutTime: new Date('2024-01-01T18:30:00'),
      },
    });
    
    cacheService.invalidateLocations();
    res.status(201).json(location);
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

router.put('/:id', authorize('EDIT'), validate(schemas.location), async (req: AuthRequest, res) => {
  try {
    const { code, name, address, city, state, pin, phone, email, whatsapp, managerId, hrManagerId, openingTime, closingTime, status } = req.body;
    
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.id !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { name, address, city, state, pin, phone, email, whatsapp, managerId, hrManagerId, status };
    if (openingTime) updateData.openingTime = new Date(openingTime);
    if (closingTime) updateData.closingTime = new Date(closingTime);
    
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: updateData,
    });
    
    cacheService.invalidateLocations();
    res.json(location);
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.patch('/:id/status', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.id !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: { status },
    });
    
    cacheService.invalidateLocations();
    res.json(location);
  } catch (error) {
    console.error('Update location status error:', error);
    res.status(500).json({ error: 'Failed to update location status' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Super Admin can delete locations' });
    }
    
    // Check for dependent records
    const [employeeCount, floorCount] = await Promise.all([
      prisma.employee.count({ where: { locationId: req.params.id } }),
      prisma.floor.count({ where: { locationId: req.params.id } }),
    ]);
    
    if (employeeCount > 0 || floorCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete location with existing employees or floors. Archive instead.' 
      });
    }
    
    await prisma.location.delete({ where: { id: req.params.id } });
    cacheService.invalidateLocations();
    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

export default router;