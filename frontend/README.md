# HRMS frontend

[Project overview](../README.md) · [Backend](../backend/README.md) · [Documentation](../backend/docs/README.md)

## Responsibilities

The Next.js App Router application renders dashboard, employees, organization, attendance/devices, leave, payroll, incentives, showroom operations, hiring, self-service, reports and administration. Public application forms use /apply/[code]. The root README provides the full module inventory.

## Structure and data flow

- src/app: pages, layouts and server API handlers.
- src/components: reusable/domain UI, including consent and session controls.
- src/lib: shared integration utilities.
- next.config.ts: rewrites and framework/build configuration.

~~~mermaid
flowchart LR
    Page[Page / component] --> Client[API request]
    Client --> Route[Same-origin /api]
    Route --> API[Express domain API]
    API --> Result[Authorized response]
    Result --> Page
    Events[Socket.IO events] --> Page
~~~

In unified production, root server-routing.js dispatches requests between Express and Next.js. Most business APIs reach Express; NextAuth /api/auth and selected dashboard APIs stay with Next.js. In development, rewrites and the session catch-all proxy connect the separate servers.

## Sessions and consent

Backend /api/session endpoints authenticate credentials and manage HttpOnly access/refresh cookies. NextAuth exchanges a one-use ticket for browser session integration. UI permission visibility does not replace backend action and record-scope authorization.

The standalone /api/session/[...path] proxy uses BACKEND_URL, forwards cookies and returns a controlled 503 if the API is unreachable. Unified production dispatches these requests directly to Express.

Consent saves show an inline failure and permit retry. Failed persistence must not be represented as saved consent.

## Commands and configuration

From the repository root:

~~~powershell
npm run dev
npm run build:frontend
npm run typecheck --workspace=frontend
~~~

npm run dev starts the frontend on 3000 and standalone API on 4000 by default. npm run dev:frontend starts only the frontend. Configure NEXTAUTH_URL, NEXTAUTH_SECRET, FRONTEND_URL, API_URL and BACKEND_URL consistently. NEXT_PUBLIC_API_URL=/api keeps browser calls same-origin. NEXT_PUBLIC_* values are public build inputs and must never contain secrets.

Production uses root npm start after both workspaces are built. A frontend-only start requires a separately reachable backend. See [deployment recovery](../backend/docs/SESSION-DEPLOYMENT.md).

## Verification

Build/typecheck establish source compatibility. Verify login, refresh/logout, restricted navigation, consent failures, exports and live updates against an isolated configured backend. A rendered page does not prove that its database or device source is ready.
