# ===========================================================================
# BSC Textiles HRMS — backend API image
#
# Build context is the REPOSITORY ROOT (see .dockerignore), not ./backend:
#   docker build -f backend/Dockerfile .
# The root context is required because npm workspaces hoist the native modules
# (@node-rs/argon2, better-sqlite3) into the ROOT node_modules — an install
# run from ./backend alone would not see them — and because the API reads
# database/shards/*.sql at runtime.
#
# Production only: TypeScript is compiled in a throwaway stage; the runtime
# stage carries dist plus production dependencies, runs as uid 1001 and expects
# a read-only root filesystem (compose mounts tmpfs for /tmp and writable
# volumes for logs and uploads).
# ===========================================================================

# --- deps: hoisted production dependencies --------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 compiles from source when no prebuilt matches the running
# ABI; without a toolchain the install fails with an unhelpful ninja/gcc error.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests only, so a source edit does not re-resolve the dependency graph.
# All three workspace package.json files must be present: npm refuses to run
# any workspace command when a declared workspace has no manifest.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY database/package.json ./database/

RUN npm ci --omit=dev && npm cache clean --force

# --- build: compile TypeScript --------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY backend/package.json backend/tsconfig.json ./backend/
COPY frontend/package.json ./frontend/
COPY backend/src ./backend/src
COPY database ./database

RUN npm run build --workspace=backend

# --- tools: same image plus dev dependencies ------------------------------
# The one-off shard provisioner runs `tsx src/scripts/*.ts`, which needs the
# source and devDependencies. It is a separate build target so the runtime
# image stays free of dev tooling.
FROM build AS tools
RUN npm ci && npm cache clean --force
USER 1001
CMD ["npx", "tsx", "src/scripts/provisionShards.ts"]

# --- runtime --------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

# Unprivileged, pinned uid so a mounted volume can be chowned on the host
# without guessing which number the image picked.
RUN groupadd --gid 1001 hrms \
 && useradd --uid 1001 --gid 1001 --no-create-home --shell /usr/sbin/nologin hrms

ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Asia/Kolkata

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/database ./database

# `storage/quarantine` is not configurable — fileSecurityService resolves it
# against the process working directory, so WORKDIR /app below is part of the
# contract: change it and the quarantine volume stops being where uploads land,
# leaving scanned files on a read-only layer.
RUN mkdir -p /app/uploads /app/logs /app/storage/quarantine \
 && chown -R 1001:1001 /app/uploads /app/logs /app/storage

USER 1001
WORKDIR /app

EXPOSE 4000

# Liveness uses the unauthenticated health route: a process that boots but
# cannot reach MySQL or Redis must report unhealthy, not "running".
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `npm run dev` (tsx watch) is never a production entrypoint.
CMD ["node", "backend/dist/index.js"]
