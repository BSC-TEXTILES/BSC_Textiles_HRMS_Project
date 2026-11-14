const frontendApiPaths = new Set([
  '/api/analytics/punctuality', '/api/attendance/punches/detail',
  '/api/biometric/liveness-logs', '/api/presence/live-floor',
  '/api/terminals/network-status',
]);

function isBackendRequest(url) {
  const pathname = new URL(url, 'http://localhost').pathname.replace(/\/$/, '');
  if (frontendApiPaths.has(pathname)) return false;
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) return false;
  return pathname === '/api' || pathname.startsWith('/api/')
    || pathname === '/health' || pathname === '/ready'
    || pathname === '/iclock' || pathname.startsWith('/iclock/')
    || pathname.startsWith('/uploads/attendance/')
    || pathname === '/.well-known/jwks.json';
}

module.exports = { isBackendRequest };
