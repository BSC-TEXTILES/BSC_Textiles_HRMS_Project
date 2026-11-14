/** Resolve the API at runtime: Next rewrites otherwise retain the build host's port. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade'];

function stripHopHeaders(headers: Headers): void {
  for (const name of (headers.get('connection') || '').split(',')) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of hopHeaders) headers.delete(name);
}

async function proxySession(request: Request): Promise<Response> {
  try {
    const incoming = new URL(request.url);
    const origin = process.env.BACKEND_URL?.trim()
      || process.env.API_URL?.trim().replace(/\/api\/?$/, '')
      || `http://127.0.0.1:${process.env.BACKEND_PORT || '4000'}`;
    const target = new URL(origin);
    if (!['http:', 'https:'].includes(target.protocol) || target.origin === incoming.origin) {
      throw new Error('Session backend must be a separate HTTP API origin');
    }
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = new Headers(request.headers);
    stripHopHeaders(headers);
    headers.delete('host');
    headers.delete('content-length');
    headers.set('accept-encoding', 'identity');
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const responseHeaders = new Headers(upstream.headers);
    stripHopHeaders(responseHeaders);
    // Fetch decodes compressed responses; do not forward the encoded length.
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('set-cookie');
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error('[session proxy] Backend request failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({
      error: 'Authentication service unavailable',
      message: 'The authentication service is temporarily unavailable. Please try again shortly.',
      code: 'AUTH_SERVICE_UNAVAILABLE',
    }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } });
  }
}

export { proxySession as GET, proxySession as POST };
