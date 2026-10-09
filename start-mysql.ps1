<#
.SYNOPSIS
    Ensures MySQL 8.0 is running for BSC Textiles HRMS.
.DESCRIPTION
    The MySQL files are installed at "C:\Program Files\MySQL\MySQL Server 8.0"
    but there is no Windows service registered (no admin rights required).
    This script therefore:
      1. Initializes the data directory if missing (one-time).
      2. Starts mysqld.exe as a background process on port 3307.
    Safe to run repeatedly - exits immediately if MySQL is already listening.

    It is invoked automatically by the "BSC Textiles - Start MySQL" scheduled
    task at logon, so MySQL comes back after a reboot without manual action.
    Every run appends to .\logs\mysql-startup.log for troubleshooting.
#>

param(
    [string]$BaseDir = "C:\Program Files\MySQL\MySQL Server 8.0",
    [string]$DataDir = "C:\BSC_Textiles_HRMS_Project\mysql-data",
    [int]$Port = 3307
)

$ErrorActionPreference = "Continue"
$binDir = Join-Path $BaseDir "bin"
$mysqld = Join-Path $binDir "mysqld.exe"

# NOTE: We use port 3307 (not the MySQL default 3306) because a real Windows
# service "MySQL80" (Auto-start, ProgramData data dir, unknown root password)
# grabs 3306 at boot and cannot be stopped without admin rights. Our portable
# instance uses the seeded BSC data dir (root password "password") on 3307 so
# it never conflicts with that service.

# --- Logging helper (append to logs\mysql-startup.log) ----------------------
$scriptDir = $PSScriptRoot
$logDir = Join-Path $scriptDir "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "mysql-startup.log"
$errLog = Join-Path $DataDir "mysql-error.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    switch ($Level) {
        "ERROR" { Write-Host $line -ForegroundColor Red }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line }
    }
}

Write-Log "---- start-mysql.ps1 invoked ----"

# 1. Already running? (check OUR port, not 3306 which the MySQL80 service owns)
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Log "MySQL is already running on port $Port. Nothing to do." "INFO"
    exit 0
}

if (-not (Test-Path $mysqld)) {
    Write-Log "mysqld.exe not found at $mysqld. Install MySQL 8.0 first." "ERROR"
    exit 1
}

# 2. Initialize data directory if this is the first run
if (-not (Test-Path (Join-Path $DataDir "mysql"))) {
    Write-Log "Initializing MySQL data directory at $DataDir ..." "WARN"
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    & $mysqld --initialize-insecure --basedir="$BaseDir" --datadir="$DataDir"
    if ($LASTEXITCODE -ne 0) {
        Write-Log "mysqld --initialize-insecure failed (exit $LASTEXITCODE)." "ERROR"
        exit 1
    }
    Write-Log "Data directory initialized (root has empty password until setup sets it)." "INFO"
}

# 3. Start mysqld in the background, logging to a deterministic error log
Write-Log "Starting MySQL on port $Port (error log: $errLog) ..." "WARN"
Start-Process -FilePath $mysqld `
    -ArgumentList "--basedir=`"$BaseDir`"", "--datadir=`"$DataDir`"", "--port=$Port", "--log-error=`"$errLog`"" `
    -WindowStyle Hidden

# 4. Wait for the port (up to 30 seconds)
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Log "MySQL is running on port $Port." "INFO"
        exit 0
    }
}

Write-Log "MySQL did not start listening on port $Port within 30 seconds. See $errLog" "ERROR"
exit 1
