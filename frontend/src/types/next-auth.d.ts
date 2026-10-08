import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string[];
      locationId?: string;
      employeeId?: string;
    } & DefaultSession['user'];
    token?: string;
  }

  interface User {
    id: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
    token?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
    token?: string;
  }
}
