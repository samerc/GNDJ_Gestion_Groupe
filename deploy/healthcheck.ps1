<#
.SYNOPSIS
  Pings the app's /health endpoint and emails an alert when the site goes down (or recovers).
.DESCRIPTION
  Meant to run every few minutes via Task Scheduler (installed by install-ops-tasks.ps1). To avoid
  alert spam it emails only on a STATE CHANGE (up-to-down and down-to-up), tracked in health-state.txt.
  It hits the PUBLIC url with a browser User-Agent so it exercises the whole path (DNS, Cloudflare,
  TLS, origin) - i.e. "is the site up for a real user", not just "is the process alive".
  Settings/secrets come from deploy\ops-alert.config.json (gitignored). See deploy\OPS.md.
.EXAMPLE
  ./deploy/healthcheck.ps1
#>
param([string]$ConfigPath)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ops-common.ps1")
$cfg = Get-OpsConfig -ConfigPath $ConfigPath

$url = $cfg.health.url
$timeout = if ($cfg.health.timeoutSec) { [int]$cfg.health.timeoutSec } else { 20 }
# Browser UA so Cloudflare does not 403 the probe (it blocks bare script/urllib agents).
$ua = if ($cfg.health.userAgent) { $cfg.health.userAgent } else {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
$stateFile = Join-Path $PSScriptRoot "health-state.txt"

$healthy = $false
$detail = ""
try {
    $resp = Invoke-WebRequest -Uri $url -TimeoutSec $timeout -UseBasicParsing -Headers @{ "User-Agent" = $ua }
    if ($resp.StatusCode -eq 200) { $healthy = $true; $detail = "200 OK" }
    else { $detail = "HTTP $($resp.StatusCode)" }
}
catch {
    $detail = $_.Exception.Message
}

$prev = if (Test-Path $stateFile) { (Get-Content $stateFile -Raw).Trim() } else { "unknown" }
$now = if ($healthy) { "up" } else { "down" }
Set-Content $stateFile $now -NoNewline -Encoding utf8

# Alert only on transitions (first run from "unknown" to down also alerts; unknown to up is silent).
if ($now -ne $prev) {
    if ($now -eq "down") {
        Send-OpsAlert -Config $cfg -Subject "[GNDJ DOWN] $url unreachable" `
            -Body "Health check FAILED at $(Get-Date -Format 'u')`nURL: $url`nDetail: $detail"
    }
    elseif ($prev -ne "unknown") {
        Send-OpsAlert -Config $cfg -Subject "[GNDJ recovered] $url is back up" `
            -Body "Health check RECOVERED at $(Get-Date -Format 'u')`nURL: $url`nDetail: $detail"
    }
}
Write-Host "$now ($detail)"
if (-not $healthy) { exit 1 }
