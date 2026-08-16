<#
.SYNOPSIS
  Self-healing watchdog: if the app is down, restart the services automatically and email the outcome.
.DESCRIPTION
  Run every few minutes via Task Scheduler (installed by install-ops-tasks.ps1) as SYSTEM. Probes /health
  (by default the SAME public URL the notifier uses — prod hosts the app IN-PROCESS under IIS, so a naive
  localhost:5000 probe would always fail). If it's still down after a few retries, it walks a remediation ladder:
     1. ensure PostgreSQL is running (the app crash-loops on startup without a DB), then
     2. restart the IIS app pool — which ALSO re-enables a pool that IIS disabled via rapid-fail protection
        (exactly the 2026-08-16 failure mode: 500.30 until someone restarted the pool by hand).
  It then re-probes and emails whether it HEALED or still needs a human. Skips while a deploy is in progress
  (app_offline.htm present) so it never fights update.ps1/deploy.ps1.

  Complements healthcheck.ps1 (which NOTIFIES on external up/down); this one ACTS. Secrets/settings come
  from deploy\ops-alert.config.json (gitignored). See deploy\OPS.md.
.PARAMETER ProbeUrl    Health URL to probe. Default = the SAME public /health the notifier uses
                       (config.health.url), or config.watchdog.localUrl to override. NOTE: prod hosts the app
                       IN-PROCESS under IIS (not Kestrel on :5000), so probe the real site URL, not localhost:5000.
.PARAMETER PoolName    IIS app pool to restart (default "gndj").
.PARAMETER SitePath    Site root, checked for app_offline.htm (default C:\inetpub\www\gndj).
.PARAMETER PgService   PostgreSQL service name (default postgresql-x64-18).
.PARAMETER Retries     Health probes before declaring it down (default 3, 10s apart) — avoids acting on a blip.
.EXAMPLE
  ./deploy/watchdog.ps1
#>
param(
  [string]$ConfigPath,
  [string]$ProbeUrl,
  [string]$PoolName,
  [string]$SitePath,
  [string]$PgService,
  [int]$Retries = 3,
  [int]$RetryDelaySec = 10
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ops-common.ps1")
$cfg = Get-OpsConfig -ConfigPath $ConfigPath

# Config with fallbacks (works even if the config file has no "watchdog" block).
$wd = $cfg.watchdog
# Probe URL: an explicit watchdog.localUrl, else the SAME public /health the notifier uses (proven to work
# through Cloudflare), else a dev fallback. Prod runs in-process under IIS, so localhost:5000 would always fail.
if (-not $ProbeUrl) {
  $ProbeUrl = if ($wd -and $wd.localUrl) { $wd.localUrl }
              elseif ($cfg.health -and $cfg.health.url) { $cfg.health.url }
              else { "http://localhost:5000/health" }
}
if (-not $PoolName)  { $PoolName  = if ($wd -and $wd.poolName)  { $wd.poolName }  else { "gndj" } }
if (-not $SitePath)  { $SitePath  = if ($wd -and $wd.sitePath)  { $wd.sitePath }  else { "C:\inetpub\www\gndj" } }
if (-not $PgService) { $PgService = if ($wd -and $wd.pgService) { $wd.pgService } else { "postgresql-x64-18" } }

# Browser UA so Cloudflare doesn't 403 the probe (bare script/urllib agents are blocked) — matches healthcheck.ps1.
$ua = if ($cfg.health -and $cfg.health.userAgent) { $cfg.health.userAgent } else {
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
$timeout = if ($cfg.health -and $cfg.health.timeoutSec) { [int]$cfg.health.timeoutSec } else { 20 }

$stateFile = Join-Path $PSScriptRoot "watchdog-state.txt"

function Test-AppHealth {
  try {
    $r = Invoke-WebRequest -Uri $ProbeUrl -TimeoutSec $timeout -UseBasicParsing -Headers @{ "User-Agent" = $ua }
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

# Don't fight a deploy: app_offline.htm means update.ps1/deploy.ps1 took the site down on purpose.
if (Test-Path (Join-Path $SitePath "app_offline.htm")) { Write-Host "Deploy in progress (app_offline.htm) - skipping."; return }

# Probe with retries so a single blip (or a normal short recycle) doesn't trigger a restart.
$healthy = $false
for ($i = 1; $i -le $Retries; $i++) {
  if (Test-AppHealth) { $healthy = $true; break }
  if ($i -lt $Retries) { Start-Sleep -Seconds $RetryDelaySec }
}

$prev = if (Test-Path $stateFile) { (Get-Content $stateFile -Raw).Trim() } else { "unknown" }

if ($healthy) {
  Set-Content $stateFile "up" -NoNewline -Encoding utf8
  Write-Host "up"
  return
}

# ---- DOWN: attempt self-healing ----
Write-Host "DOWN after $Retries probes - attempting recovery..."
$actions = @()

# 1) PostgreSQL must be running (startup migrations/seeders need it; without it the app crash-loops).
try {
  $svc = Get-Service $PgService -ErrorAction Stop
  if ($svc.Status -ne 'Running') {
    Start-Service $PgService
    $actions += "started $PgService (was $($svc.Status))"
  }
} catch {
  $actions += "PG service check failed: $($_.Exception.Message)"
}

# 2) Restart the app pool. Restart if running (clears a hung worker); Start if stopped/disabled
#    (this is what re-enables a pool that rapid-fail protection turned off).
try {
  Import-Module WebAdministration -ErrorAction Stop
  $state = (Get-WebAppPoolState -Name $PoolName -ErrorAction Stop).Value
  if ($state -eq 'Started') { Restart-WebAppPool -Name $PoolName; $actions += "restarted app pool" }
  else { Start-WebAppPool -Name $PoolName; $actions += "started app pool (was $state)" }
} catch {
  $actions += "app pool restart failed: $($_.Exception.Message)"
}

# 3) Re-probe for up to ~70s (cold start + EF model build + seeders + warmup).
$recovered = $false
for ($i = 1; $i -le 7; $i++) {
  Start-Sleep -Seconds 10
  if (Test-AppHealth) { $recovered = $true; break }
}

$summary = if ($actions.Count) { $actions -join "; " } else { "no action taken" }
$ts = Get-Date -Format 'u'

if ($recovered) {
  Set-Content $stateFile "up" -NoNewline -Encoding utf8
  Write-Host "RECOVERED: $summary"
  # A self-heal is worth knowing about — send it every time it happens (should be rare).
  Send-OpsAlert -Config $cfg -Subject "[GNDJ auto-healed] the app was down and recovered" `
    -Body "The watchdog detected the app DOWN and restored it automatically at $ts.`n`nActions: $summary`nProbe: $ProbeUrl"
} else {
  Set-Content $stateFile "down" -NoNewline -Encoding utf8
  Write-Host "STILL DOWN: $summary"
  # Escalate only on the FIRST failed run of an outage (avoid a mail every few minutes while it stays down);
  # the watchdog keeps retrying remediation on each run regardless.
  if ($prev -ne "down") {
    Send-OpsAlert -Config $cfg -Subject "[GNDJ auto-heal FAILED] app still DOWN - manual help needed" `
      -Body "The watchdog tried to restart the services at $ts but the app is STILL DOWN.`n`nActions: $summary`nProbe: $ProbeUrl`n`nCheck: app pool state, PostgreSQL, disk space, and C:\inetpub\www\gndj\logs."
  }
  exit 1
}
