import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';
import { UserUploadService } from '../services/userUploadService.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search, role, locationId, isActive } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    
    if (req.user!.role !== 'SUPER_ADMIN') {
      where.locationId = req.user!.locationId;
    } else if (locationId) {
      where.locationId = locationId;
    }
    
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { fullName: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          permissions: true,
          locationId: true,
          employeeId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          employee: {
            select: { employeeCode: true, fullName: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);
    
    res.json({ users, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        locationId: true,
        employeeId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            location: true,
            floor: true,
            department: true,
            shift: true,
          },
        },
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && user.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.post('/', authorize('ADD'), validate(schemas.register), async (req: AuthRequest, res) => {
  try {
    const { email, password, fullName, role, permissions, locationId, employeeId } = req.body;
    
    if (req.user!.role !== 'SUPER_ADMIN' && locationId && locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password || 'password123', 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: role || 'EMPLOYEE',
        permissions: permissions || ['VIEW'],
        locationId: locationId || req.user!.locationId || null,
        employeeId: employeeId || null,
        isActive: 1,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        locationId: true,
        employeeId: true,
        isActive: true,
      },
    });

    // Automatically create user directory in uploads
    UserUploadService.ensureUserFolder(fullName);

    res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', authorize('EDIT'), validate(schemas.register), async (req: AuthRequest, res) => {
  try {
    const { email, fullName, role, permissions, locationId, employeeId, isActive } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updateData: any = { email, fullName, isActive };
    if (role) updateData.role = role;
    if (permissions) updateData.permissions = permissions;
    if (locationId) updateData.locationId = locationId;
    if (employeeId) updateData.employeeId = employeeId;
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        locationId: true,
        employeeId: true,
        isActive: true,
      },
    });
    
    if (fullName) {
      UserUploadService.ensureUserFolder(fullName);
    }

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', authorize('DELETE'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.put('/:id/permissions', authorize('MANAGE'), async (req: AuthRequest, res) => {
  try {
    const { permissions } = req.body;
    
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array' });
    }
    
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { permissions },
      select: { id: true, permissions: true },
    });
    
    res.json(user);
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

router.put('/:id/role', authorize('MANAGE'), async (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (req.user!.role !== 'SUPER_ADMIN' && existing.locationId !== req.user!.locationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot assign SUPER_ADMIN role' });
    }
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, role: true },
    });
    
    res.json(user);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

export default router;