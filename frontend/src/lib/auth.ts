import type { NextAuthOptions } from 'next-auth';
import _CredentialsProvider from 'next-auth/providers/credentials';

const CredentialsProvider: typeof _CredentialsProvider =
  typeof _CredentialsProvider === 'function'
    ? _CredentialsProvider
    : typeof (_CredentialsProvider as any)?.default === 'function'
    ? (_CredentialsProvider as any).default
    : (_CredentialsProvider as any)?.default?.default || _CredentialsProvider;

const API_BASES = [
  process.env.BACKEND_URL ? `${process.env.BACKEND_URL.replace(/\/+$/, '')}/api` : null,
  process.env.API_URL?.trim() || null,
  process.env.NEXT_PUBLIC_API_URL?.trim() || null,
  'http://127.0.0.1:4000/api',
].filter(Boolean) as string[];

/**
 * NextAuth holds only the UI's view of who is signed in.
 *
 * The real authentication decision is made by the Express API, which sets the
 * HttpOnly session cookies. What arrives here is a single-use ticket that the
 * login page received *after* that decision, exchanged for a profile. So:
 *   - no password ever passes through NextAuth, and none is logged;
 *   - there is no offline/demo account that could mint a session the database
 *     knows nothing about (the previous version had one, and it was a
 *     SUPER_ADMIN backdoor);
 *   - the backend JWT is not copied into the NextAuth session, because a
 *     session readable by client code is a token readable by client code.
 */
async function exchangeTicket(ticket: string): Promise<Record<string, unknown>> {
  let lastError = 'no backend reachable';

  for (const base of API_BASES) {
    let response: Response;
    try {
      response = await fetch(`${base}/session/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
        cache: 'no-store',
      });
    } catch (err: any) {
      lastError = err?.message || lastError;
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.user) {
      // An invalid or spent ticket is an answer, not a transport failure.
      throw new Error(data?.error === 'Invalid exchange' ? 'Your sign-in step expired. Please try again.' : 'Sign-in failed');
    }

    const user = data.user;
    return {
      id: user.id,
      email: user.email,
      name: user.fullName || user.email,
      role: user.role || 'EMPLOYEE',
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      locationId: user.locationId || undefined,
      employeeId: user.employeeId || undefined,
      loginId: user.loginId || undefined,
      mustChangePassword: Boolean(user.mustChangePassword),
      sessionId: user.sessionId,
    };
  }

  throw new Error(`Could not reach the authentication server (${lastError}).`);
}

const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && !process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET is required in production.');
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'BSC Textiles SSO',
      credentials: {
        ticket: { label: 'Session ticket', type: 'text' },
      },
      async authorize(credentials) {
        const ticket = String(credentials?.ticket || '').trim();
        if (!ticket) throw new Error('Your sign-in step is missing. Please try again.');
        const user = await exchangeTicket(ticket);
        return user as any;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    // Matches ABSOLUTE_TIMEOUT on the API: when the backend session ends, the
    // UI session ends with it rather than lingering for a week.
    maxAge: 8 * 60 * 60,
    updateAge: 5 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
        token.locationId = (user as any).locationId;
        token.employeeId = (user as any).employeeId;
        token.loginId = (user as any).loginId;
        token.mustChangePassword = (user as any).mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user = {
          ...session.user,
          id: token.id,
          role: token.role,
          permissions: token.permissions,
          locationId: token.locationId,
          employeeId: token.employeeId,
          loginId: token.loginId,
          mustChangePassword: token.mustChangePassword,
        } as any;
      }
      return session;
    },
  },
  // A committed fallback secret means anyone who can read this repository can
  // mint a valid NextAuth session token, so production refuses to start
  // without a real one. The dev value is deliberately non-secret-looking and
  // length-stable so local JWTs stay valid across restarts.
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? (() => {
          throw new Error('NEXTAUTH_SECRET is required in production');
        })()
      : 'bsc-textiles-hrms-dev-nextauth-secret-change-me-32-chars'),
};
