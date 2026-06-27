<#
.SYNOPSIS
  One-command update: (optionally pull), build, and ship to the live site with near-zero downtime.
.DESCRIPTION
  Wraps publish.ps1 (build) + deploy.ps1 (ship). Runtime data (uploads/, logs/) and the server-only
  appsettings.Production.json are preserved by deploy.ps1 — never copied or purged.

  The target site folder is resolved in this order:
    1. -Target argument
    2. $env:GNDJ_DEPLOY_TARGET
    3. deploy\target.txt (saved automatically the first time you pass -Target)

  Run this ON THE SERVER (needs .NET SDK + Node.js to build), or point -Target at a UNC share of the
  site folder from a build box.
.EXAMPLE
  ./deploy/update.ps1 -Target C:\inetpub\www\gndj      # first time: sets + remembers the target
.EXAMPLE
  ./deploy/update.ps1                              # afterwards: just this
.EXAMPLE
  ./deploy/update.ps1 -Pull                        # git pull --ff-only first, then build + ship
#>
param(
  [string]$Target,
  [switch]$Pull,
  [string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# ── Resolve + remember the deploy target ───────────────────────────────────────
$targetFile = Join-Path $PSScriptRoot "target.txt"
if (-not $Target) { $Target = $env:GNDJ_DEPLOY_TARGET }
if (-not $Target -and (Test-Path $targetFile)) { $Target = (Get-Content $targetFile -Raw).Trim() }
if (-not $Target) {
  throw "No deploy target. Pass -Target <site path> once (it's remembered), set GNDJ_DEPLOY_TARGET, or create deploy\target.txt. e.g. C:\inetpub\www\gndj"
}
Set-Content $targetFile $Target -NoNewline -Encoding utf8   # remember for next time

Write-Host "==> Updating GNDJ → $Target" -ForegroundColor Cyan

if ($Pull) {
  Write-Host "==> git pull --ff-only..." -ForegroundColor Cyan
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "git pull failed" }
}

# ── Build, then ship ───────────────────────────────────────────────────────────
& "$PSScriptRoot\publish.ps1" -Configuration $Configuration
& "$PSScriptRoot\deploy.ps1" -Source (Join-Path $root "publish") -Target $Target

Write-Host "==> Update complete → $Target" -ForegroundColor Green
Write-Host "    The app re-runs EF migrations on first request. Check logs\gndj-*.log and browse the site."
