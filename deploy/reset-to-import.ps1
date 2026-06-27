<#
.SYNOPSIS
  Reset the GNDJ database back to the imported snapshot (.dump file). DESTRUCTIVE - testing only.
.DESCRIPTION
  Stops IIS, drops + recreates the 'gndj' database, re-enables the unaccent extension, restores the
  snapshot, optionally clears uploaded files, then restarts IIS. Prompts for the postgres password and
  requires you to type RESET to confirm. Use ONLY before go-live - this deletes ALL current data.
  Run it in an ELEVATED PowerShell (Run as administrator).
.PARAMETER Dump
  Full path to the gndj_data_*.dump snapshot to restore.
.PARAMETER PgBin
  PostgreSQL bin folder. Default: C:\Program Files\PostgreSQL\18\bin
.PARAMETER SitePath
  IIS site folder (used by -ClearUploads). Default: C:\inetpub\www\gndj
.PARAMETER ClearUploads
  Also empty the uploads\ folder (member docs/photos) for a fully clean slate.
.PARAMETER Yes
  Skip the typed confirmation (for unattended use). The password is still prompted unless -PgPassword is given.
.PARAMETER PgPassword
  The postgres superuser password (avoids the prompt). Prefer the prompt so it isn't left in history.
.EXAMPLE
  .\deploy\reset-to-import.ps1 -Dump C:\gndj-backups\gndj_data_20260626_2002.dump
.EXAMPLE
  .\deploy\reset-to-import.ps1 -Dump C:\gndj-backups\gndj_data_20260626_2002.dump -ClearUploads
#>
param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$SitePath = "C:\inetpub\www\gndj",
  [switch]$ClearUploads,
  [switch]$Yes,
  [string]$PgPassword
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Dump)) { throw "Snapshot not found: $Dump" }
$psql      = Join-Path $PgBin "psql.exe"
$pgrestore = Join-Path $PgBin "pg_restore.exe"
if (-not (Test-Path $psql))      { throw "psql.exe not found in $PgBin" }
if (-not (Test-Path $pgrestore)) { throw "pg_restore.exe not found in $PgBin" }

# Postgres superuser password (secure prompt unless passed in)
if (-not $PgPassword) {
  $sec = Read-Host "Enter the PostgreSQL 'postgres' superuser password" -AsSecureString
  $PgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

# Confirmation
if (-not $Yes) {
  Write-Host ""
  Write-Host "  WARNING - this DELETES all current data in the 'gndj' database and replaces it with:" -ForegroundColor Yellow
  Write-Host "    $Dump" -ForegroundColor Yellow
  if ($ClearUploads) { Write-Host "  It will also empty $SitePath\uploads" -ForegroundColor Yellow }
  Write-Host ""
  if ((Read-Host "Type RESET to proceed") -ne "RESET") { Write-Host "Cancelled." -ForegroundColor Cyan; return }
}

$env:PGPASSWORD = $PgPassword
Write-Host "==> Stopping IIS..." -ForegroundColor Cyan
iisreset /stop | Out-Null
try {
  Write-Host "==> Dropping + recreating database..." -ForegroundColor Cyan
  & $psql -U postgres -h 127.0.0.1 -d postgres -c 'DROP DATABASE IF EXISTS gndj WITH (FORCE);'
  & $psql -U postgres -h 127.0.0.1 -d postgres -c 'CREATE DATABASE gndj OWNER gndj_admin;'
  & $psql -U postgres -h 127.0.0.1 -d gndj -c 'CREATE EXTENSION IF NOT EXISTS unaccent;'

  Write-Host "==> Restoring snapshot (one 'unaccent COMMENT' error is normal/harmless)..." -ForegroundColor Cyan
  & $pgrestore --no-owner --no-privileges --role=gndj_admin -h 127.0.0.1 -U postgres -d gndj $Dump

  if ($ClearUploads -and (Test-Path (Join-Path $SitePath "uploads"))) {
    Write-Host "==> Clearing uploads..." -ForegroundColor Cyan
    Remove-Item (Join-Path $SitePath "uploads\*") -Recurse -Force -ErrorAction SilentlyContinue
  }

  $count = (& $psql -U postgres -h 127.0.0.1 -d gndj -t -A -c 'SELECT count(*) FROM members;').Trim()
  Write-Host "==> Done. Restored snapshot - members = $count" -ForegroundColor Green
}
finally {
  Write-Host "==> Starting IIS..." -ForegroundColor Cyan
  iisreset /start | Out-Null
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
