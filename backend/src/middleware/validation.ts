import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = data.body;
      req.query = data.query;
      req.params = data.params;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      }
      return res.status(400).json({ error: 'Invalid request' });
    }
  };
};

export const schemas = {
  login: z.object({
    body: z.object({
      email: z
        .string()
        .trim()
        .min(1, 'Email or Employee Code is required')
        .refine(
          (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || /^(EMP|BSC|TEST)-[A-Z0-9-]+$/i.test(val),
          'Invalid email or employee code format'
        ),
      password: z.string().min(1, 'Password is required'),
    }),
  }),

  register: z.object({
    body: z.object({
      email: z.string().email('Invalid email'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
      fullName: z.string().min(2, 'Name must be at least 2 characters'),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE']).optional(),
      locationId: z.string().optional(),
      employeeId: z.string().optional(),
    }),
  }),

  location: z.object({
    body: z.object({
      code: z.string().min(2).max(10).toUpperCase(),
      name: z.string().min(2).max(100),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      pin: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      whatsapp: z.string().optional(),
      managerId: z.string().optional(),
      hrManagerId: z.string().optional(),
      openingTime: z.string().optional(),
      closingTime: z.string().optional(),
    }),
  }),

  floor: z.object({
    body: z.object({
      name: z.string().min(2).max(50),
      floorNumber: z.number().int().min(-5).max(100),
      locationId: z.string().min(1),
      floorManagerId: z.string().optional(),
      assistantManagerId: z.string().optional(),
    }),
  }),

  department: z.object({
    body: z.object({
      name: z.string().min(2).max(100),
      code: z.string().min(2).max(20).toUpperCase(),
      locationId: z.string().min(1),
      floorId: z.string().optional(),
      managerId: z.string().optional(),
    }),
  }),

  section: z.object({
    body: z.object({
      name: z.string().min(2).max(100),
      code: z.string().min(2).max(20).toUpperCase(),
      locationId: z.string().min(1),
      floorId: z.string().min(1),
      departmentId: z.string().optional(),
      supervisorId: z.string().optional(),
    }),
  }),

  sellingPoint: z.object({
    body: z.object({
      name: z.string().min(2).max(100),
      code: z.string().min(2).max(20).toUpperCase(),
      locationId: z.string().min(1),
      floorId: z.string().min(1),
      sectionId: z.string().min(1),
      category: z.string().optional(),
      managerId: z.string().optional(),
      targetAmount: z.number().optional(),
    }),
  }),

  employee: z.object({
    body: z.object({
      employeeCode: z.string().min(2).max(30),
      firstName: z.string().min(1).max(50),
      lastName: z.string().min(1).max(50),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      locationId: z.string().min(1),
      floorId: z.string().optional(),
      departmentId: z.string().optional(),
      sectionId: z.string().optional(),
      shiftId: z.string().optional(),
      designation: z.string().optional(),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE']).optional(),
      joiningDate: z.string().optional(),
    }),
  }),

  shift: z.object({
    body: z.object({
      name: z.string().min(2).max(50),
      code: z.string().min(2).max(20).toUpperCase(),
      locationId: z.string().min(1),
      departmentId: z.string().optional(),
      startTime: z.string(),
      endTime: z.string(),
      gracePeriod: z.number().int().min(0).max(60).optional(),
      lateThreshold: z.number().int().min(0).max(120).optional(),
      earlyLoginIncentive: z.boolean().optional(),
      earlyLoginRatePerSecond: z.number().optional(),
      latePenaltyEnabled: z.boolean().optional(),
      latePenaltyRatePerSecond: z.number().optional(),
      overtimeEnabled: z.boolean().optional(),
      overtimeRatePerSecond: z.number().optional(),
      earlyLogoutPenaltyEnabled: z.boolean().optional(),
      earlyLogoutRatePerSecond: z.number().optional(),
      lunchDurationMinutes: z.number().int().min(0).max(480).optional(),
      teaDurationMinutes: z.number().int().min(0).max(120).optional(),
      maleLunchMinutes: z.number().int().min(0).max(480).optional(),
      femaleLunchMinutes: z.number().int().min(0).max(480).optional(),
      maleTeaMinutes: z.number().int().min(0).max(120).optional(),
      femaleTeaMinutes: z.number().int().min(0).max(120).optional(),
      faceVerificationThreshold: z.number().min(0).max(100).optional(),
      qrDailyTokenEnabled: z.boolean().optional(),
      qrOneTimeScan: z.boolean().optional(),
      scannerRoles: z.array(z.string()).optional(),
    }),
  }),

  attendance: z.object({
    body: z.object({
      employeeId: z.string().min(1),
      locationId: z.string().min(1),
      shiftId: z.string().optional(),
      attendanceDate: z.string(),
      scheduledLogin: z.string().optional(),
      actualLogin: z.string().optional(),
      scheduledLogout: z.string().optional(),
      actualLogout: z.string().optional(),
    }),
  }),

  break: z.object({
    body: z.object({
      employeeId: z.string().min(1),
      breakType: z.enum(['LUNCH', 'TEA', 'OTHER']),
      breakDate: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      allowedDuration: z.number().int().min(1).max(480),
    }),
  }),

  faceVerification: z.object({
    body: z.object({
      employeeId: z.string().min(1),
      locationId: z.string().min(1),
      deviceId: z.string().optional(),
      matchPercentage: z.number().min(0).max(100),
      threshold: z.number().min(0).max(100),
      purpose: z.string().optional(),
    }),
  }),

  qrScan: z.object({
    body: z.object({
      token: z.string().min(1),
      purpose: z.enum(['ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT', 'LUNCH_START', 'LUNCH_END', 'TEA_BREAK_START', 'TEA_BREAK_END', 'BREAK_START', 'BREAK_END', 'SELLING_POINT_CHECK_IN']),
      locationId: z.string().min(1),
      sellingPointId: z.string().optional(),
      scannerId: z.string().min(1),
      deviceInfo: z.string().optional(),
      ipAddress: z.string().optional(),
    }),
  }),

  incentive: z.object({
    body: z.object({
      name: z.string().min(2).max(100),
      description: z.string().optional(),
      incentiveType: z.enum(['INDIVIDUAL', 'DEPARTMENT', 'LOCATION', 'FLOOR', 'SELLING_POINT', 'SALES', 'ATTENDANCE', 'PERFORMANCE', 'EARLY_LOGIN', 'TARGET', 'CUSTOM']),
      calculationType: z.enum(['FIXED_AMOUNT', 'PER_HOUR', 'PER_MINUTE', 'PER_SECOND', 'PERCENTAGE', 'TARGET_BASED', 'PERFORMANCE_BASED', 'ATTENDANCE_BASED', 'CUSTOM_RULE']),
      locationId: z.string().optional(),
      departmentId: z.string().optional(),
      floorId: z.string().optional(),
      sellingPointId: z.string().optional(),
      employeeId: z.string().optional(),
      amount: z.number().optional(),
      percentage: z.number().min(0).max(100).optional(),
      targetAmount: z.number().optional(),
      effectiveFrom: z.string(),
      effectiveTo: z.string().optional(),
      maxDailyAmount: z.number().optional(),
      maxMonthlyAmount: z.number().optional(),
    }),
  }),

  observation: z.object({
    body: z.object({
      employeeId: z.string().min(1),
      locationId: z.string().min(1),
      floorId: z.string().optional(),
      sectionId: z.string().optional(),
      sellingPointId: z.string().optional(),
      observationType: z.enum(['POSITIVE', 'IMPROVEMENT', 'CUSTOMER_SERVICE', 'SALES', 'GROOMING', 'PRODUCT_KNOWLEDGE', 'ATTENDANCE', 'DISCIPLINE', 'SELLING_SKILL', 'STORE_STANDARD', 'SAFETY']),
      level: z.enum(['EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT', 'CRITICAL']),
      score: z.number().int().min(1).max(5),
      description: z.string().min(10),
      actionRequired: z.string().optional(),
      assignedToId: z.string().optional(),
      dueDate: z.string().optional(),
      videoUrl: z.string().optional(),
      photoUrl: z.string().optional(),
    }),
  }),

  liveStream: z.object({
    body: z.object({
      title: z.string().min(2).max(100),
      description: z.string().optional(),
      locationId: z.string().min(1),
      floorId: z.string().optional(),
      sectionId: z.string().optional(),
      sellingPointId: z.string().optional(),
      streamUrl: z.string().url(),
      scheduledAt: z.string().optional(),
    }),
  }),

  weeklyOff: z.object({
    body: z.object({
      locationId: z.string().min(1),
      floorId: z.string().optional(),
      departmentId: z.string().optional(),
      employeeId: z.string().optional(),
      shiftId: z.string().optional(),
      dayOfWeek: z.enum(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'ROTATIONAL']),
      isRotational: z.boolean().optional(),
      rotationPattern: z.string().optional(),
      effectiveFrom: z.string(),
      effectiveTo: z.string().optional(),
    }),
  }),

  holiday: z.object({
    body: z.object({
      name: z.string().min(2).max(100),
      date: z.string(),
      locationId: z.string().optional(),
      departmentId: z.string().optional(),
      isRecurring: z.boolean().optional(),
    }),
  }),

  pagination: z.object({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }),
  }),
};