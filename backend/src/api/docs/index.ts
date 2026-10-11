import { Router } from 'express';

export const docsRouter = Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BSC Textiles HRMS — Enterprise REST API',
    version: '1.0.0',
    description: 'Authoritative RESTful API documentation for BSC Textiles Multi-Store Human Resource Management System.',
    contact: {
      name: 'BSC Textiles IT & HR Operations',
      email: 'hr@bsctextiles.com',
    },
  },
  servers: [
    { url: '/api/v1', description: 'API Version 1 (Production)' },
    { url: '/api', description: 'Default API Endpoint' },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'System health & uptime check',
        responses: {
          '200': { description: 'System healthy and database connection pool active' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Multi-store employee login with Argon2id verification',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  deviceId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Authenticated successfully' },
          '401': { description: 'Invalid credentials or account locked' },
        },
      },
    },
    '/attendance/punch': {
      post: {
        summary: 'Biometric QR + Face verification attendance punch',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Attendance punch recorded with sub-second precision' },
        },
      },
    },
    '/payroll/runs': {
      get: {
        summary: 'List master store payroll cycles',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Payroll runs list' },
          '403': { description: 'Forbidden: Insufficient privileges' },
        },
      },
    },
    '/employees': {
      get: {
        summary: 'Paginated active workforce roster scoped by store location',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Employees roster' },
        },
      },
    },
    '/audit/logs': {
      get: {
        summary: 'Query immutable tamper-verified audit trail',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Audit trail logs' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

docsRouter.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

docsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BSC Textiles HRMS — API Reference</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 24px; }
    h1 { color: #f8fafc; font-size: 28px; margin: 0 0 8px 0; }
    p { color: #94a3b8; font-size: 15px; margin: 0; }
    .badge { display: inline-block; background: #0284c7; color: #fff; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; margin-top: 12px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .method { display: inline-block; font-weight: 700; font-size: 12px; padding: 4px 8px; border-radius: 4px; margin-right: 8px; }
    .get { background: #065f46; color: #34d399; }
    .post { background: #1e40af; color: #60a5fa; }
    .put { background: #854d0e; color: #facc15; }
    .path { font-family: monospace; font-size: 15px; color: #f1f5f9; }
    .desc { color: #94a3b8; font-size: 14px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BSC Textiles HRMS — API Documentation</h1>
      <p>Modular, secure RESTful interface contracts for multi-store retail workforce governance.</p>
      <span class="badge">Version 1.0.0 Production</span>
      <p style="margin-top: 10px;"><a href="/api/docs/openapi.json" style="color: #38bdf8; text-decoration: none;">⬇ Download OpenAPI 3.0 Specification (JSON)</a></p>
    </div>

    <div class="card">
      <span class="method get">GET</span><span class="path">/api/v1/health</span>
      <div class="desc">System health, connection pool status, and diagnostic metrics.</div>
    </div>
    <div class="card">
      <span class="method post">POST</span><span class="path">/api/v1/auth/login</span>
      <div class="desc">Multi-store workforce authentication with Argon2id and rate-limiting.</div>
    </div>
    <div class="card">
      <span class="method get">GET</span><span class="path">/api/v1/employees</span>
      <div class="desc">Paginated employee directory filtered by branch store and department.</div>
    </div>
    <div class="card">
      <span class="method post">POST</span><span class="path">/api/v1/attendance/punch</span>
      <div class="desc">Sub-second QR badge and facial biometric attendance recording.</div>
    </div>
    <div class="card">
      <span class="method get">GET</span><span class="path">/api/v1/payroll/runs</span>
      <div class="desc">Master payroll cycle ledger across store locations.</div>
    </div>
    <div class="card">
      <span class="method get">GET</span><span class="path">/api/v1/audit/logs</span>
      <div class="desc">Immutable tamper-verified audit trail with hash-chain verification.</div>
    </div>
  </div>
</body>
</html>`);
});

export default docsRouter;
