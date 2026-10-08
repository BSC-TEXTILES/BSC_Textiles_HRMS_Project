import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

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

        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });

        const data = await response.json().catch(() => ({}));

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
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.permissions = token.permissions;
        session.user.locationId = token.locationId;
        session.user.employeeId = token.employeeId;
      }
      session.token = token.token;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
