import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        console.log('[NextAuth] authorize called with:', credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        let response: Response;
        try {
          response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
        } catch (fetchErr: any) {
          // If localhost failed (e.g. IPv6 ::1 issue), retry with 127.0.0.1
          if (API_URL.includes('localhost')) {
            const fallbackUrl = API_URL.replace('localhost', '127.0.0.1');
            try {
              response = await fetch(`${fallbackUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: credentials.email,
                  password: credentials.password,
                }),
              });
            } catch (err2: any) {
              console.error('[NextAuth] Connection error:', err2.message);
              throw new Error('Could not connect to authentication server. Please ensure backend is running on port 4000.');
            }
          } else {
            console.error('[NextAuth] Connection error:', fetchErr.message);
            throw new Error('Could not connect to authentication server. Please ensure backend is running on port 4000.');
          }
        }

        const data = await response.json().catch(() => ({}));

        console.log('[NextAuth] Backend response:', { ok: response.ok, hasUser: !!data?.user, hasToken: !!data?.token });

        if (!response.ok || !data?.user) {
          throw new Error(data?.error || 'Invalid email or password');
        }

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName || data.user.email,
          role: data.user.role || 'EMPLOYEE',
          permissions: Array.isArray(data.user.permissions) ? data.user.permissions : [],
          locationId: data.user.locationId || undefined,
          employeeId: data.user.employeeId || undefined,
          token: data.token,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      console.log('[NextAuth] jwt callback:', { hasToken: !!token, hasUser: !!user });
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.permissions = user.permissions;
        token.locationId = user.locationId;
        token.employeeId = user.employeeId;
        token.token = user.token;
      }
      return token;
    },
    async session({ session, token }) {
      console.log('[NextAuth] session callback:', { hasSession: !!session, hasToken: !!token });
      if (token && token.id) {
        session.user = {
          ...session.user,
          id: token.id,
          role: token.role,
          permissions: token.permissions,
          locationId: token.locationId,
          employeeId: token.employeeId,
        };
      }
      session.token = token.token;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'bsc-textiles-hrms-super-secret-jwt-key-2024-production-ready-32chars',
};
