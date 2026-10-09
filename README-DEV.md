# BSC Textiles HRMS - Development Setup

## Prerequisites

1. **Node.js 20+** - already installed
2. **MySQL 8.0 files** - installed at `C:\Program Files\MySQL\MySQL Server 8.0`
   (no Windows service needed; the scripts below start `mysqld` directly)

## Quick Start (Windows)

```powershell
# 1. Start MySQL + create database + apply native MySQL schema + seed users
.\setup-database.ps1

# 2. Start development servers (backend :4000, frontend :3000)
npm run dev
```

Then open **http://localhost:3000/login**.

> After a reboot, just run `.\start-mysql.ps1` (or `.\start-dev.ps1`, which
> calls it) before `npm run dev` - MySQL runs as a background process, not as
> a Windows service.

## How the database layer works

The project is built on **Pure Native MySQL 8.0** (`mysql2/promise` connection pool) with zero Prisma dependencies:

| Layer | Architecture | Used by | How to apply |
|-------|--------------|---------|--------------|
| **Native MySQL 8.0** | Native connection pool (`mysql2/promise`) + indexed SQL | **Backend API & All Services** | `npm run db:setup` (or `npm run db:migrate && npm run db:seed`) |

The backend authenticates against the native MySQL database using pure SQL queries and secure bcrypt hashes of `password123`.

## Test Credentials

All accounts use password: **`password123`**

| Email | Role shown in seed | Location |
|-------|--------------------|----------|
| `admin@bsctextiles.com` | Super Admin | All |
| `kavita.bhat@bsctextiles.com` | HR Executive | Belagavi |
| `vikram.singh@bsctextiles.com` | HR Manager | Shivamogga |
| `amit.patel@bsctextiles.com` | Floor Manager | Belagavi |
| `ramesh.gowda@bsctextiles.com` | Tea Break Manager | Belagavi |
| `rajesh.kumar@bsctextiles.com` | Sales Employee | Belagavi |

The login page offers these as one-click personas (36 users total after seeding).

## URLs

- **Frontend**: http://localhost:3000
- **Login**: http://localhost:3000/login
- **Backend API**: http://localhost:4000/api
- **Health Check**: http://localhost:4000/api/health

## Environment Variables

- **Root `.env`** - read by the backend (and `prisma`/`tsx` run from the repo root):
  `DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- **`frontend/.env.local`** - read by Next.js only (it does **not** read the root `.env`):
  `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`

## Troubleshooting

### Login returns 500 / "Can't reach database server at localhost:3306"
MySQL is not running → `.\start-mysql.ps1`

### Login returns 401 "Invalid credentials"
- The `user` table is missing or unseeded → `.\setup-database.ps1`
- All test users use `password123`
- Check the account exists: `SELECT email, isActive FROM bsc_textiles_hrms.user;`

### Backend warns "[config] JWT_SECRET is not set"
`backend/src/config/env.ts` loads the root `.env` itself before reading
secrets (import-order safe). If the warning still appears, verify the root
`.env` contains a non-placeholder `JWT_SECRET`.

### NextAuth warnings (`NO_SECRET`, `NEXTAUTH_URL`)
Next.js only reads `frontend/.env.local` - make sure that file exists and
restart `npm run dev` after editing it.

### Port already in use
```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

### Reset the database from scratch
```powershell
.\setup-database.ps1    # runs native MySQL migrations + seeds baseline users
```

## Project Structure

```
├── backend/            # Express + TypeScript + Native MySQL 8.0 API
├── frontend/           # Next.js 15 + React + Tailwind (env: frontend/.env.local)
├── database/           # Native MySQL 8.0 schema, versioned migrations & seeds
├── docker-compose.yml  # Optional Docker setup (requires Docker Desktop)
├── .env                # Backend + Database environment configuration
├── start-mysql.ps1     # Start mysqld background process on :3306
├── setup-database.ps1  # MySQL check + native migration + seed
├── start-dev.ps1       # MySQL check + start both servers
└── start-dev.ps1 / npm run dev
```

## Useful Commands

```bash
# Run both servers
npm run dev

# Backend / frontend only
npm run dev:backend
npm run dev:frontend

# Backend tests (starts by logging in as the personas above)
npm run test --workspace=backend

# Type check / lint
npm run typecheck
npm run lint

# Apply Native MySQL schema migrations and seed
npm run db:setup
```
