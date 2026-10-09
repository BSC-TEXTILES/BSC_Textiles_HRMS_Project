<#
.SYNOPSIS
    Sets up the BSC Textiles HRMS Native MySQL 8.0 database.
.DESCRIPTION
    1. Starts MySQL 8.0 if it is not running (start-mysql.ps1).
    2. Creates the database and sets the root password.
    3. Applies native MySQL 8.0 migrations (npm run db:migrate).
    4. Seeds native MySQL baseline dataset (npm run db:seed).
#>

param(
    [string]$MySqlRootPassword = "password",
    [string]$DatabaseName = "bsc_textiles_hrms",
    [string]$MySqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  BSC Textiles HRMS - Native MySQL 8.0 Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Make sure MySQL is running -----------------------------------------
& (Join-Path $PSScriptRoot "start-mysql.ps1")
if ($LASTEXITCODE -ne 0) { exit 1 }

if (-not (Test-Path $MySqlPath)) {
    Write-Error "mysql.exe not found at $MySqlPath"
    exit 1
}

# --- 2. Root password + database -------------------------------------------
$createDb = "CREATE DATABASE IF NOT EXISTS $DatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

& $MySqlPath -u root "-p$MySqlRootPassword" -e $createDb 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Connecting without password (fresh install) and setting root password..." -ForegroundColor Yellow
    $init = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$MySqlRootPassword'; FLUSH PRIVILEGES; $createDb"
    & $MySqlPath -u root --skip-password -e $init 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Cannot connect to MySQL as root. Is another root password set?"
        exit 1
    }
}
Write-Host "Database '$DatabaseName' is ready (root password: $MySqlRootPassword)." -ForegroundColor Green

# --- 3. Apply Native MySQL 8.0 schema + seed -------------------------------
Push-Location $PSScriptRoot
try {
    Write-Host "Applying Native MySQL schema and migrations (npm run db:migrate) ..." -ForegroundColor Cyan
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database migration failed."
        exit 1
    }

    Write-Host "Seeding native MySQL users, locations and employees (npm run db:seed) ..." -ForegroundColor Cyan
    npm run db:seed
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database seed failed."
        exit 1
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Database Setup Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Credentials (all use password: password123):" -ForegroundColor Yellow
Write-Host "  admin@bsctextiles.com       - Super Admin" -ForegroundColor White
Write-Host "  kavita.bhat@bsctextiles.com - HR (Belagavi)" -ForegroundColor White
Write-Host "  vikram.singh@bsctextiles.com - HR (Shivamogga)" -ForegroundColor White
Write-Host "  amit.patel@bsctextiles.com  - Floor Manager" -ForegroundColor White
Write-Host "  ramesh.gowda@bsctextiles.com - T-Shop / Tea Break" -ForegroundColor White
Write-Host "  rajesh.kumar@bsctextiles.com - Sales Employee" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  npm run dev    (starts backend :4000 + frontend :3000)" -ForegroundColor White
Write-Host "  Open http://localhost:3000/login" -ForegroundColor White
