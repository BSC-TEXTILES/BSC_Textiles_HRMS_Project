<#
.SYNOPSIS
    Starts the BSC Textiles HRMS development environment.
.DESCRIPTION
    Ensures MySQL is running, then starts backend (:4000) and frontend (:3000)
    via the root `npm run dev` script (concurrently).
#>

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  BSC Textiles HRMS - Starting Development Environment" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check .env
$envPath = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envPath)) {
    Write-Warning ".env file not found. Creating from .env.example ..."
    Copy-Item (Join-Path $PSScriptRoot ".env.example") $envPath
}

# Make sure MySQL is up (backend cannot serve login without it)
Write-Host "Checking MySQL ..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "start-mysql.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Error "MySQL is not running. Fix start-mysql.ps1 output above, then retry."
    exit 1
}

# Start both servers (root script runs backend + frontend together)
Write-Host "Starting backend (:4000) and frontend (:3000) ..." -ForegroundColor Green
Push-Location $PSScriptRoot
try {
    npm run dev
}
finally {
    Pop-Location
}
