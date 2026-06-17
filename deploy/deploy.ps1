<#
.SYNOPSIS
  Push a published package to the IIS site with near-zero downtime.
.DESCRIPTION
  Run ON THE SERVER (or with -Target pointing at a UNC share of the site folder).
  Uses ANCM's app_offline.htm so the app shuts down gracefully and releases its DLLs,
  copies the new files, then brings it back. Runtime state (uploads/, logs/) and the
  server-only appsettings.Production.json are NEVER touched.
.EXAMPLE
  ./deploy/deploy.ps1 -Source .\publish -Target C:\inetpub\gndj
.EXAMPLE
  ./deploy/deploy.ps1 -Source .\publish -Target \\GNDJ-SRV\gndj$   # remote share
#>
param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Target
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $Source "GNDJ.Api.dll"))) {
  throw "Source '$Source' doesn't look like a publish folder (no GNDJ.Api.dll). Run publish.ps1 first."
}
New-Item -ItemType Directory -Force $Target | Out-Null

$offline = Join-Path $Target "app_offline.htm"
Write-Host "==> Taking app offline..." -ForegroundColor Cyan
"Mise a jour en cours, merci de patienter..." | Out-File $offline -Encoding utf8
Start-Sleep -Seconds 2   # let in-flight requests drain

Write-Host "==> Copying files (preserving uploads/, logs/, appsettings.Production.json)..." -ForegroundColor Cyan
# /E copy all subdirs; preserve server-only files by excluding them from the copy.
# (No /MIR — we never purge, so uploads/logs and prod config are safe even if added under Target.)
robocopy $Source $Target /E /NFL /NDL /NP /R:2 /W:2 `
  /XF app_offline.htm appsettings.Production.json `
  /XD (Join-Path $Target "uploads") (Join-Path $Target "logs") | Out-Null
if ($LASTEXITCODE -ge 8) { Remove-Item $offline -Force -ErrorAction SilentlyContinue; throw "robocopy failed ($LASTEXITCODE)" }

Write-Host "==> Bringing app online..." -ForegroundColor Cyan
Remove-Item $offline -Force

Write-Host "==> Deployed. The app re-runs EF migrations on first request." -ForegroundColor Green
Write-Host "    Check logs\gndj-*.log and browse the site to confirm."
