# ===========================================================================
# BSC Textiles HRMS — frontend (Next.js 15 App Router) image
#
# Build context is the REPOSITORY ROOT:
#   docker build -f frontend/Dockerfile .
# npm workspaces hoist dependencies into the root node_modules and the root
# package.json carries the security `overrides` (next/react/postcss/dompurify
# pins). Building from ./frontend alone would silently ignore those pins, so
# the root lockfile is the only supported install.
#
# Compiled by `next build`, served by `next start`. Runs as uid 1002 with a
# read-only root filesystem; nothing under /app is written at runtime.
# ===========================================================================

FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY database/package.json ./database/

RUN npm ci && npm cache clean --force

# --- build ----------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they must be build ARGUMENTS — setting them only at runtime changes nothing
# for the browser. Keep the API first-party ("/api"): the session cookies are
# HttpOnly and must never be sent to a second origin.
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_WS_URL=""
ARG NEXT_TELEMETRY_DISABLED=1
ENV NEXT_TELEMETRY_DISABLED=${NEXT_TELEMETRY_DISABLED} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY frontend ./frontend

RUN npm run build --workspace=frontend \
 && npm prune --omit=dev

# --- runtime --------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1002 web \
 && useradd --uid 1002 --gid 1002 --no-create-home --shell /usr/sbin/nologin web

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Kolkata

COPY --chown=1002:1002 package.json ./
COPY --chown=1002:1002 --from=build /app/node_modules ./node_modules
COPY --chown=1002:1002 --from=build /app/frontend/package.json ./frontend/package.json
COPY --chown=1002:1002 --from=build /app/frontend/next.config.ts ./frontend/next.config.ts
COPY --chown=1002:1002 --from=build /app/frontend/tsconfig.json ./frontend/tsconfig.json
COPY --chown=1002:1002 --from=build /app/frontend/.next ./frontend/.next
COPY --chown=1002:1002 --from=build /app/frontend/public ./frontend/public

# next start re-reads next.config.ts at boot (the security headers and the
# /api rewrite live there), and Next can only transpile a TypeScript config
# when the typescript package resolves. npm prune above removes it because it
# is a devDependency, so it is restored from the pre-prune tree — it has zero
# runtime dependencies of its own.
COPY --from=deps /app/node_modules/typescript ./node_modules/typescript

USER 1002
WORKDIR /app/frontend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `next dev` would bind a hot-reloading server as root; never in production.
CMD ["npx", "next", "start", "-p", "3000"]
