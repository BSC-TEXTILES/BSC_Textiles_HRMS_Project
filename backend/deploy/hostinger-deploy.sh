#!/usr/bin/env bash
# ==============================================================================
# BSC Textiles HRMS — Hostinger Production Deployment Script
# Automates zero-downtime deployment for Hostinger KVM VPS (Ubuntu 22.04 / 24.04)
# ==============================================================================

set -euo pipefail

APP_DIR="/var/www/bsc-textiles-hrms"
NODE_MIN_VERSION=20

echo "=================================================================="
echo "🚀 STARTING BSC TEXTILES HRMS PRODUCTION DEPLOYMENT"
echo "=================================================================="
date

# 1. Pre-flight Checks
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js is not installed. Please install Node.js >= 20."
    exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt "$NODE_MIN_VERSION" ]; then
    echo "❌ Node.js version must be >= $NODE_MIN_VERSION (current: $(node -v))."
    exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
    echo "⚠️ PM2 not found. Installing globally via npm..."
    npm install -g pm2
fi

if [ ! -f ".env" ]; then
    echo "❌ Production .env file missing in repository root."
    echo "   Please create .env using .env.example as a template."
    exit 1
fi

# 2. Dependency Installation
echo "📦 Installing clean production dependencies..."
npm ci --workspaces

# 3. Database Migration
echo "🗄️ Executing database migrations..."
npm run db:migrate --workspace=database

# 4. TypeScript Type-Checking
echo "🔍 Verifying TypeScript compilation across workspaces..."
npm run typecheck --workspaces

# 5. Build Workspace Artifacts
echo "🏗️ Building backend API distribution..."
npm run build:backend

echo "🏗️ Building Next.js frontend production bundle..."
npm run build:frontend

# 6. PM2 Process Deployment
echo "🔄 Reloading application processes via PM2..."
if pm2 describe bsc-backend >/dev/null 2>&1; then
    pm2 reload ecosystem.config.cjs --update-env
else
    pm2 start ecosystem.config.cjs
fi

pm2 save

# 7. Verification Health Check
echo "🩺 Performing health check probe..."
sleep 3
if curl -s -f http://127.0.0.1:4000/health >/dev/null; then
    echo "✔ Backend API is healthy on :4000"
else
    echo "⚠️ Warning: Backend health check failed on :4000"
fi

if curl -s -f http://127.0.0.1:3000/api/health >/dev/null || curl -s -f http://127.0.0.1:3000/login >/dev/null; then
    echo "✔ Frontend web server is healthy on :3000"
else
    echo "⚠️ Warning: Frontend health probe failed on :3000"
fi

echo "=================================================================="
echo "🎉 BSC TEXTILES HRMS PRODUCTION DEPLOYMENT COMPLETE"
echo "=================================================================="
