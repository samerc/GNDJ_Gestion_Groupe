<#
.SYNOPSIS
  Apply production performance settings to the GNDJ IIS application pool + site.
.DESCRIPTION
  Run ON THE SERVER as Administrator. Fixes the #1 user-perceived-latency problem: with IIS
  defaults the worker process is killed after 20 min idle and recycled every 29 h, and each
  shutdown forces a full cold start (ANCM relaunch + .NET JIT + EF model build + all the
  idempotent SeedData passes). This script:
    - disables the idle time-out (worker never shuts down for inactivity)
    - disables the clock-based periodic recycle, replacing it with ONE quiet-hours recycle
    - sets the pool to AlwaysRunning + enables site preload (Application Initialization)
  so the app stays warm and re-warms itself after a reboot/recycle before the first user hits it.

  Idempotent — safe to re-run. Requires the WebAdministration module (RSAT / IIS Mgmt tools)
  and the "Application Initialization" IIS feature (the install guide enables IIS-ApplicationInit).
.PARAMETER PoolName
  The IIS application pool name. Default: gndj
.PARAMETER SiteName
  The IIS site name. Default: GNDJ
.PARAMETER RecycleTime
  Daily quiet-hours recycle, HH:mm (24h). Default: 03:00. Pass "" to disable entirely.
.EXAMPLE
  ./deploy/tune-apppool.ps1
.EXAMPLE
  ./deploy/tune-apppool.ps1 -PoolName gndj -SiteName GNDJ -RecycleTime 04:00
#>
param(
  [string]$PoolName = "gndj",
  [string]$SiteName = "GNDJ",
  [string]$RecycleTime = "03:00"
)
$ErrorActionPreference = "Stop"
Import-Module WebAdministration -ErrorAction Stop

$poolPath = "IIS:\AppPools\$PoolName"
if (-not (Test-Path $poolPath)) { throw "App pool '$PoolName' not found. Check -PoolName (see IIS Manager)." }

Write-Host "==> Tuning app pool '$PoolName'..." -ForegroundColor Cyan

# 1. Never shut down on inactivity (the big cold-start fix).
Set-ItemProperty $poolPath -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)

# 2. Disable the clock-based periodic recycle (drops mid-day + wipes the in-process caches).
Set-ItemProperty $poolPath -Name recycling.periodicRestart.time -Value ([TimeSpan]::Zero)

# 3. Replace it with a single quiet-hours recycle (optional).
Clear-ItemProperty $poolPath -Name recycling.periodicRestart.schedule -ErrorAction SilentlyContinue
if ($RecycleTime) {
  New-ItemProperty $poolPath -Name recycling.periodicRestart.schedule -Value @{value=$RecycleTime} | Out-Null
  Write-Host "    daily recycle scheduled at $RecycleTime" -ForegroundColor DarkGray
} else {
  Write-Host "    periodic recycle disabled entirely" -ForegroundColor DarkGray
}

# 4. Start the worker as soon as IIS/Windows starts (don't wait for the first request).
Set-ItemProperty $poolPath -Name startMode -Value "AlwaysRunning"

# 5. Confirm "No Managed Code" (in-process ASP.NET Core hosting needs the CLR-less pool).
Set-ItemProperty $poolPath -Name managedRuntimeVersion -Value ""

# 6. Enable site preload so AlwaysRunning actually warms the app after a recycle/reboot.
$sitePath = "IIS:\Sites\$SiteName"
if (Test-Path $sitePath) {
  Set-ItemProperty $sitePath -Name applicationDefaults.preloadEnabled -Value $true
  Write-Host "    preload enabled on site '$SiteName'" -ForegroundColor DarkGray
} else {
  Write-Warning "Site '$SiteName' not found - skipped preload. Check -SiteName."
}

Write-Host "==> Recycling pool once to apply..." -ForegroundColor Cyan
Restart-WebAppPool -Name $PoolName

Write-Host ""
Write-Host "Done. Current settings:" -ForegroundColor Green
Get-ItemProperty $poolPath -Name processModel.idleTimeout, recycling.periodicRestart.time, startMode, managedRuntimeVersion |
  Format-List processModel, recycling, startMode, managedRuntimeVersion
Write-Host "NOTE: pair this with a warm-up probe (the app exposes GET /health) for fastest first hit." -ForegroundColor Yellow
