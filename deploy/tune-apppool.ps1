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
  Daily quiet-hours recycle, HH:mm (24h). Default: "" (NONE). A .NET app with idleTimeout=0 and no interval
  recycle doesn't need a clock recycle, and a daily one caused an outage (2026-08-16); pass e.g. "04:00" only if
  you want one — keep it OFF the 03:00 DB-backup window, and note overlapping rotation is disabled either way.
.EXAMPLE
  ./deploy/tune-apppool.ps1
.EXAMPLE
  ./deploy/tune-apppool.ps1 -PoolName gndj -SiteName GNDJ -RecycleTime 04:00
#>
param(
  [string]$PoolName = "gndj",
  [string]$SiteName = "GNDJ",
  [string]$RecycleTime = ""
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

# 3b. CRITICAL: forbid OVERLAPPING rotation. By default a recycle starts the new worker while the old one is
#     still running; both then run the app's startup seeders concurrently and the loser hits a duplicate-key
#     (23505), which crash-loops the app and trips rapid-fail -> HTTP 500.30 until the pool is restarted
#     (the 2026-08-16 outage). With this true, the new worker waits for the old to drain first — no concurrent
#     startup. (The app also holds a Postgres advisory lock over startup as a second layer of protection.)
Set-ItemProperty $poolPath -Name recycling.disallowOverlappingRotation -Value $true
Write-Host "    overlapping rotation disabled (no concurrent startup seeding)" -ForegroundColor DarkGray

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

# 7. Turn OFF IIS *dynamic* compression at the site: the ASP.NET Core app already gzip/brotli-compresses its
#    responses in-process (UseResponseCompression), so letting IIS compress again is a wasted second pass — pure
#    CPU on a weak shared box. Static compression stays ON (for the immutable-cached JS/CSS). Idempotent.
if (Test-Path "IIS:\Sites\$SiteName") {
  try {
    Set-WebConfigurationProperty -PSPath "IIS:\Sites\$SiteName" -Filter "system.webServer/urlCompression" -Name doDynamicCompression -Value $false
    Set-WebConfigurationProperty -PSPath "IIS:\Sites\$SiteName" -Filter "system.webServer/urlCompression" -Name doStaticCompression -Value $true
    Write-Host "    IIS dynamic compression OFF / static ON (site '$SiteName') — app compresses in-process" -ForegroundColor DarkGray
  } catch { Write-Warning "Could not set urlCompression on '$SiteName' (server-level lock?): $($_.Exception.Message)" }
}

Write-Host "==> Recycling pool once to apply..." -ForegroundColor Cyan
Restart-WebAppPool -Name $PoolName

Write-Host ""
Write-Host "Done. Current settings:" -ForegroundColor Green
Get-ItemProperty $poolPath -Name processModel.idleTimeout, recycling.periodicRestart.time, startMode, managedRuntimeVersion |
  Format-List processModel, recycling, startMode, managedRuntimeVersion
Write-Host "NOTE: pair this with a warm-up probe (the app exposes GET /health) for fastest first hit." -ForegroundColor Yellow
