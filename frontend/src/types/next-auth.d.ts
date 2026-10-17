import type { DefaultSession } from 'next-auth';

/**
 * The NextAuth session carries identity only.
 *
 * There is deliberately no `token` field: the API's access token lives in an
 * HttpOnly cookie, so a cross-site script on any dashboard page cannot read a
 * credential it could then replay elsewhere.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string[];
      locationId?: string;
      employeeId?: string;
      loginId?: string;
      mustChangePassword?: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
    loginId?: string;
    mustChangePassword?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    permissions: string[];
    locationId?: string;
    employeeId?: string;
    loginId?: string;
    mustChangePassword?: boolean;
  }
}
