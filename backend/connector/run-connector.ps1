<#
.SYNOPSIS
    Starts the BSC Textiles Biometric Hardware Edge Connector
.DESCRIPTION
    Launches the edge connector with local showroom terminal settings.
#>

param(
    [ValidateSet("BEL", "DAV", "SHI")]
    [string]$Showroom = "BEL",
    [string]$CloudApiUrl = "http://localhost:4000/api"
)

$ErrorActionPreference = "Stop"

$deviceConfigs = @{
    "BEL" = @{ IP = "192.168.0.136"; Serial = "JNP2252300795"; Name = "eSSL Belagavi Flagship Main Terminal" };
    "DAV" = @{ IP = "192.168.0.131"; Serial = "JNPJNP2252300802"; Name = "eSSL Davanagere Mega Store Terminal" };
    "SHI" = @{ IP = "192.168.30.131"; Serial = "JNP2252300797"; Name = "eSSL Shivamogga Flagship Terminal" };
}

$cfg = $deviceConfigs[$Showroom]

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " BSC Textiles HRMS - Launching Showroom Edge Connector ($Showroom)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Showroom      : $Showroom ($($cfg.Name))"
Write-Host "Terminal IP   : $($cfg.IP):4370"
Write-Host "Serial Number : $($cfg.Serial)"
Write-Host "Cloud API     : $CloudApiUrl"
Write-Host "============================================================" -ForegroundColor Cyan

$env:CLOUD_API_URL = $CloudApiUrl
$env:DEVICE_IP = $cfg.IP
$env:DEVICE_SERIAL = $cfg.Serial
$env:DEVICE_NAME = $cfg.Name
$env:SHOWROOM_CODE = $Showroom

npx tsx (Join-Path $PSScriptRoot "bscBiometricConnector.ts")
