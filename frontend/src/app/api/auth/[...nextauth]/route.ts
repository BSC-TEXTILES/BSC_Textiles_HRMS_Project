import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export async function GET(req: any, ctx: any) {
  try {
    return await handler(req, ctx);
  } catch (err: any) {
    console.error('[NextAuth GET Error]', err);
    return new Response(JSON.stringify({ error: err?.message || 'Authentication error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(req: any, ctx: any) {
  try {
    return await handler(req, ctx);
  } catch (err: any) {
    console.error('[NextAuth POST Error]', err);
    return new Response(JSON.stringify({ error: err?.message || 'Authentication error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
