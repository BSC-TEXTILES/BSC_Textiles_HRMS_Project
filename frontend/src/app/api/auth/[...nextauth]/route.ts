import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

async function authHandler(req: any, context: any) {
  try {
    return await handler(req, context);
  } catch (error: any) {
    console.error('[NextAuth Route Error]:', error);
    return new Response(
      JSON.stringify({
        error: error?.message || 'Unknown error',
        stack: error?.stack || '',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export { authHandler as GET, authHandler as POST };
