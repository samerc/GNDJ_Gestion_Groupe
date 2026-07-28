<#
.SYNOPSIS
  Push a published package to the IIS site with near-zero downtime.
.DESCRIPTION
  Run ON THE SERVER (or with -Target pointing at a UNC share of the site folder).
  Uses ANCM's app_offline.htm so the app shuts down gracefully and releases its DLLs,
  copies the new files, then brings it back. Runtime state (uploads/, logs/) and the
  server-only appsettings.Production.json are NEVER touched.
.EXAMPLE
  ./deploy/deploy.ps1 -Source .\publish -Target C:\inetpub\www\gndj
.EXAMPLE
  ./deploy/deploy.ps1 -Source .\publish -Target \\GNDJ-SRV\gndj$   # remote share
#>
param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Target,
  [string]$AppPool = "gndj"   # IIS app pool identity that must own the runtime folders
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $Source "GNDJ.Api.dll"))) {
  throw "Source '$Source' doesn't look like a publish folder (no GNDJ.Api.dll). Run publish.ps1 first."
}
New-Item -ItemType Directory -Force $Target | Out-Null

# Ensure the app-pool identity can write the runtime folders it creates at startup. The DataProtection
# key ring lives under the content root and is written by the pool at boot; without Modify rights it logs
# "An error occurred while reading the key ring" (UnauthorizedAccessException). Same for uploads/logs.
# Best-effort (needs an elevated shell); a failure here is a warning, not a deploy blocker.
foreach ($sub in @("dataprotection-keys", "uploads", "logs")) {
  $dir = Join-Path $Target $sub
  New-Item -ItemType Directory -Force $dir | Out-Null
  try {
    icacls $dir /grant "IIS AppPool\$($AppPool):(OI)(CI)M" /T /C /Q | Out-Null
  } catch {
    Write-Host "==> WARN: could not grant '$dir' to IIS AppPool\$AppPool (run elevated to fix keyring errors)." -ForegroundColor Yellow
  }
}

$offline = Join-Path $Target "app_offline.htm"
Write-Host "==> Taking app offline..." -ForegroundColor Cyan
"Mise a jour en cours, merci de patienter..." | Out-File $offline -Encoding utf8
Start-Sleep -Seconds 2   # let in-flight requests drain

Write-Host "==> Copying files (preserving uploads/, logs/, appsettings.Production.json)..." -ForegroundColor Cyan
# /E copy all subdirs; preserve server-only files by excluding them from the copy.
# (No /MIR — we never purge, so uploads/logs and prod config are safe even if added under Target.)
robocopy $Source $Target /E /NFL /NDL /NP /R:2 /W:2 `
  /XF app_offline.htm appsettings.Production.json `
  /XD (Join-Path $Target "uploads") (Join-Path $Target "logs") (Join-Path $Target "dataprotection-keys") | Out-Null
if ($LASTEXITCODE -ge 8) { Remove-Item $offline -Force -ErrorAction SilentlyContinue; throw "robocopy failed ($LASTEXITCODE)" }

Write-Host "==> Bringing app online..." -ForegroundColor Cyan
Remove-Item $offline -Force

Write-Host "==> Deployed. The app re-runs EF migrations on first request." -ForegroundColor Green
Write-Host "    Check logs\gndj-*.log and browse the site to confirm."
