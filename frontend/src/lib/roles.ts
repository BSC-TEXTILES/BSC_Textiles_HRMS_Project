/**
 * Role helpers shared by the login page, the root landing page and the
 * dashboard layout so that RBAC-driven navigation stays consistent.
 */

/** Roles that manage the system (see `middleware.ts` + backend `requireRole`). */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

/** HR / people-operations roles. */
export const HR_ROLES = [
  'HR',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'PAYROLL_MANAGER',
  'LOCATION_MANAGER',
  'FLOOR_MANAGER',
] as const;

/**
 * Route-level role groups. `middleware.ts` (server) and the sidebar
 * (client) both read these, so a menu entry is never shown for a route the
 * middleware would bounce to /403. The backend re-checks every API call with
 * `authenticate` + `authorize`, so this list is convenience, not a gate.
 */
export const WORKFORCE_ROUTE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'FLOOR_MANAGER',
] as const;

export const PAYROLL_ROUTE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'PAYROLL_MANAGER',
] as const;

export const OPERATIONS_ROUTE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'LOCATION_MANAGER',
  'FLOOR_MANAGER',
] as const;

/**
 * Candidate Hiring routes. Store managers are included because they run
 * walk-in interviews at their location; the backend still narrows every
 * candidate query to the locations their RECRUITMENT scope allows.
 */
export const HIRING_ROUTE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'LOCATION_MANAGER',
  'FLOOR_MANAGER',
] as const;

export function roleInGroup(role: string | undefined | null, group: readonly string[]): boolean {
  return Boolean(role && group.includes(role));
}

/** Everything else is treated as self-service (employee) access. */
export const EMPLOYEE_HOME = '/my-desk';

/** Management landing page (executive overview). */
export const STAFF_HOME = '/dashboard';

/** Governance landing page — the access-control dashboard a Super Admin owns. */
export const GOVERNANCE_HOME = '/admin/access';

/**
 * Resolve the page a user should land on after authenticating.
 *
 * - Super Admin → access-control governance dashboard
 * - Admin / HR / Floor Manager → staff dashboard
 * - Employee → self-service desk
 */
export function getRoleHomePath(role?: string | null): string {
  if (!role) return STAFF_HOME;

  if (role === 'SUPER_ADMIN') return GOVERNANCE_HOME;
  if ((ADMIN_ROLES as readonly string[]).includes(role)) return STAFF_HOME;
  if ((HR_ROLES as readonly string[]).includes(role)) return STAFF_HOME;

  // Everyone else (SALES_EMPLOYEE, TEA_BREAK_MANAGER, OPERATOR, …)
  return EMPLOYEE_HOME;
}

/**
 * Reduce an untrusted `callbackUrl` query value to a safe, same-origin path.
 *
 * NextAuth redirects to `/login?callbackUrl=<absolute url>`, which would send
 * the browser to a different host than the one that owns the session cookie
 * (e.g. `localhost` vs `127.0.0.1`). Anything that is not a same-origin path
 * is discarded in favour of `fallback`.
 */
export function sanitizeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = STAFF_HOME
): string {
  if (!raw) return fallback;

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // Reject obvious protocol-relative / backslash escapes early.
  if (trimmed.startsWith('//') || trimmed.includes('\\')) return fallback;

  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost:3000';
    const url = new URL(trimmed, base);

    if (url.origin !== base) return fallback;
    if (!url.pathname.startsWith('/')) return fallback;

    // Never redirect a freshly authenticated user back to /login, /403, or root
    if (url.pathname === '/login' || url.pathname.startsWith('/login/') || url.pathname === '/403' || url.pathname === '/') {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
