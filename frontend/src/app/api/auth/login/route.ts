import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Security Error: JWT_SECRET or NEXTAUTH_SECRET must be defined in production.');
    }
    return 'bsc-textiles-dev-only-secret-do-not-use-in-production-32c';
  }
  return secret.trim();
}

function createToken(payload: any): string {
  const secret = getJwtSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

const ENTERPRISE_USERS: Record<string, any> = {
  'admin@bsctextiles.com': {
    id: 'cmuwszr8b00001vdt6ldrzqdn',
    email: 'admin@bsctextiles.com',
    fullName: 'Super Admin',
    role: 'SUPER_ADMIN',
    permissions: [
      'VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT',
      'ASSIGN', 'EXPORT', 'IMPORT', 'CONFIGURE', 'MANAGE',
      'RECORD', 'UPLOAD', 'PUBLISH', 'SCAN', 'VIEW_SENSITIVE_DATA'
    ],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_admin',
  },
  'hr@bsctextiles.com': {
    id: 'cmuwszr8b00002vdt6ldrzqdo',
    email: 'hr@bsctextiles.com',
    fullName: 'HR Manager',
    role: 'HR_MANAGER',
    permissions: [
      'VIEW', 'ADD', 'EDIT', 'APPROVE', 'REJECT', 'ASSIGN',
      'EXPORT', 'IMPORT', 'MANAGE', 'RECORD'
    ],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_hr',
  },
  'vikram.singh@bsctextiles.com': {
    id: 'cmuwszr8b00002vdt6ldrzqdo',
    email: 'vikram.singh@bsctextiles.com',
    fullName: 'HR Manager',
    role: 'HR_MANAGER',
    permissions: [
      'VIEW', 'ADD', 'EDIT', 'APPROVE', 'REJECT', 'ASSIGN',
      'EXPORT', 'IMPORT', 'MANAGE', 'RECORD'
    ],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_hr',
  },
  'staff@bsctextiles.com': {
    id: 'cmuwszr8b00003vdt6ldrzqdp',
    email: 'staff@bsctextiles.com',
    fullName: 'Staff Member',
    role: 'STAFF',
    permissions: ['VIEW', 'RECORD'],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_staff',
  },
  'rajesh.kumar@bsctextiles.com': {
    id: 'cmuwszr8b00003vdt6ldrzqdp',
    email: 'rajesh.kumar@bsctextiles.com',
    fullName: 'Staff Member',
    role: 'STAFF',
    permissions: ['VIEW', 'RECORD'],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_staff',
  },
  'manager@bsctextiles.com': {
    id: 'cmuwszr8b00004vdt6ldrzqdq',
    email: 'manager@bsctextiles.com',
    fullName: 'Store Manager',
    role: 'STORE_MANAGER',
    permissions: ['VIEW', 'ADD', 'EDIT', 'APPROVE', 'RECORD', 'MANAGE'],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_manager',
  },
  'sales@bsctextiles.com': {
    id: 'cmuwszr8b00005vdt6ldrzqdr',
    email: 'sales@bsctextiles.com',
    fullName: 'Sales Associate',
    role: 'SALES_EMPLOYEE',
    permissions: ['VIEW', 'RECORD'],
    locationId: 'loc_davangere_01',
    employeeId: 'emp_sales',
  },
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    // 1. Authenticate against authoritative backend service
    const backendCandidates = [
      process.env.BACKEND_URL ? `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api` : null,
      process.env.API_URL,
      'http://127.0.0.1:4000/api',
      'http://localhost:4000/api',
    ].filter(Boolean) as string[];

    let backendResponded = false;
    for (const backendUrl of backendCandidates) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${backendUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        backendResponded = true;
        const data = await res.json().catch(() => null);

        if (res.ok && data?.user && data?.token) {
          return NextResponse.json(data);
        }

        if (res.status === 401 || res.status === 400 || res.status === 429) {
          return NextResponse.json(
            { error: data?.error || 'Invalid email or password' },
            { status: res.status }
          );
        }
      } catch {
        // Backend not reachable at this candidate URL, try next
      }
    }

    // 2. Local development fallback (strictly non-production only)
    if (process.env.NODE_ENV !== 'production' && !backendResponded && process.env.ALLOW_DEV_MOCK_LOGIN === 'true') {
      const user = ENTERPRISE_USERS[cleanEmail];
      if (user && cleanPassword === (process.env.DEV_MOCK_PASSWORD || 'DevPassword@2026')) {
        const token = createToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
        });

        return NextResponse.json({
          message: 'Development Mock Login Successful',
          token,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            permissions: user.permissions,
            locationId: user.locationId,
            employeeId: user.employeeId,
          },
        });
      }
    }

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  } catch (err: any) {
    console.error('[Auth API] Unhandled error:', err);
    return NextResponse.json({ error: 'Authentication service error' }, { status: 500 });
  }
}
