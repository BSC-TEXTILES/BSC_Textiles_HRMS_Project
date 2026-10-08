<#
.SYNOPSIS
    Ensures MySQL 8.0 is running for BSC Textiles HRMS.
.DESCRIPTION
    The MySQL files are installed at "C:\Program Files\MySQL\MySQL Server 8.0"
    but there is no Windows service registered (no admin rights required).
    This script therefore:
      1. Initializes the data directory if missing (one-time).
      2. Starts mysqld.exe as a background process on port 3306.
    Safe to run repeatedly - exits immediately if MySQL is already listening.
#>

param(
    [string]$BaseDir = "C:\Program Files\MySQL\MySQL Server 8.0",
    [string]$DataDir = "C:\BSC_Textiles_HRMS_Project\mysql-data"
)

$binDir = Join-Path $BaseDir "bin"
$mysqld = Join-Path $binDir "mysqld.exe"

# 1. Already running?
if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "MySQL is already running on port 3306." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $mysqld)) {
    Write-Error "mysqld.exe not found at $mysqld. Install MySQL 8.0 first."
    exit 1
}

# 2. Initialize data directory if this is the first run
if (-not (Test-Path (Join-Path $DataDir "mysql"))) {
    Write-Host "Initializing MySQL data directory at $DataDir ..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    & $mysqld --initialize-insecure --basedir="$BaseDir" --datadir="$DataDir"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "mysqld --initialize-insecure failed."
        exit 1
    }
    Write-Host "Data directory initialized (root has empty password until setup sets it)." -ForegroundColor Green
}

# 3. Start mysqld in the background
Write-Host "Starting MySQL on port 3306 ..." -ForegroundColor Yellow
Start-Process -FilePath $mysqld `
    -ArgumentList "--basedir=`"$BaseDir`"", "--datadir=`"$DataDir`"", "--port=3306", "--console" `
    -WindowStyle Hidden

# 4. Wait for the port (up to 30 seconds)
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "MySQL is running on port 3306." -ForegroundColor Green
        exit 0
    }
}

Write-Error "MySQL did not start listening on port 3306 within 30 seconds."
exit 1
