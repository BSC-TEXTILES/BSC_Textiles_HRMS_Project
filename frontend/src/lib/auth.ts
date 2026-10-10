import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_URL = process.env.API_URL || 'http://127.0.0.1:4000/api';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        let response: Response | null = null;
        const candidateUrls = [
          API_URL,
          API_URL.includes('127.0.0.1') ? API_URL.replace('127.0.0.1', 'localhost') : API_URL.replace('localhost', '127.0.0.1'),
          'http://127.0.0.1:4000/api',
          'http://localhost:4000/api',
        ];
        const uniqueUrls = Array.from(new Set(candidateUrls));

        let lastErrorMsg = '';
        for (const url of uniqueUrls) {
          try {
            response = await fetch(`${url}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            });
            if (response) break;
          } catch (err: any) {
            lastErrorMsg = err?.message || 'Network request failed';
          }
        }

        if (!response) {
          console.error('[NextAuth] Could not connect to backend across candidate URLs:', uniqueUrls, lastErrorMsg);
          throw new Error('Could not connect to authentication server. Please ensure backend is running on port 4000.');
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.user) {
          throw new Error(data?.error || data?.message || 'Invalid email or password');
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
      if (token) {
        if (token.id) {
          session.user = {
            ...session.user,
            id: token.id,
            role: token.role,
            permissions: token.permissions,
            locationId: token.locationId,
            employeeId: token.employeeId,
          };
        }
        if (token.token) {
          session.token = token.token;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'bsc-textiles-hrms-super-secret-jwt-key-2024-production-ready-32chars',
};
