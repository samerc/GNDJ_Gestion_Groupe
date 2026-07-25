<#
.SYNOPSIS
  End-to-end test of the health monitoring: cause a REAL brief outage so the health check detects it and
  emails you (DOWN + recovered). Nothing is faked - the site genuinely stops and restarts; the alert comes
  from the monitoring reacting to a true failure.
.DESCRIPTION
  Stops the IIS app pool (the site really goes down - through Cloudflare, visitors see an error page),
  waits, then restarts it. Two ways to observe the alert:
    * default        - keep the site down for -DownSeconds (>= the health-check interval) so the SCHEDULED
                       GNDJ-HealthCheck task catches it unattended and emails you; recovery is sent by the
                       next scheduled run after restart. This proves the cron alerts on its own.
    * -TriggerCheck  - also run .\healthcheck.ps1 immediately after stopping (DOWN email) and after restart
                       (recovered email) for instant feedback with the shortest possible outage.

  Run ELEVATED on the PROD server, in the deploy folder. The pool is ALWAYS restarted (even on error or
  Ctrl-C) via a finally block, so a failed/interrupted run cannot leave the site down.
.PARAMETER PoolName     IIS app pool to stop/start (default "gndj", matches tune-apppool.ps1).
.PARAMETER SiteName     IIS site name (informational; default "GNDJ").
.PARAMETER DownSeconds  How long to keep the site down (default 360). To let the SCHEDULED task catch it,
                        keep this GREATER than the health-check interval (install-ops-tasks default = 5 min).
                        Ignored with -TriggerCheck (that mode restarts as soon as the DOWN email is sent).
.PARAMETER TriggerCheck Also invoke .\healthcheck.ps1 right after stop (DOWN email) and after restart
                        (recovered email) - instant, minimal outage.
.PARAMETER Yes          Skip the confirmation prompt (for unattended runs).
.PARAMETER ConfigPath   Passed through to healthcheck.ps1 when -TriggerCheck is used.
.EXAMPLE
  ./deploy/simulate-outage.ps1 -TriggerCheck        # short outage, instant DOWN + recovered emails
.EXAMPLE
  ./deploy/simulate-outage.ps1 -DownSeconds 360     # leave it down so the scheduled task alerts on its own
#>
param(
    [string]$PoolName = "gndj",
    [string]$SiteName = "GNDJ",
    [int]$DownSeconds = 360,
    [switch]$TriggerCheck,
    [switch]$Yes,
    [string]$ConfigPath
)
$ErrorActionPreference = "Stop"
Import-Module WebAdministration -ErrorAction Stop

$poolPath = "IIS:\AppPools\$PoolName"
if (-not (Test-Path $poolPath)) { throw "App pool '$PoolName' not found. Check -PoolName (see IIS Manager)." }

# Run the REAL monitor script in a child process so its 'exit 1' (a failed check exits non-zero) can't
# terminate this script. Its output streams up; the child loads its own ops config.
$healthCheck = Join-Path $PSScriptRoot "healthcheck.ps1"
function Invoke-RealHealthCheck {
    $psArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $healthCheck)
    if ($ConfigPath) { $psArgs += @("-ConfigPath", $ConfigPath) }
    & powershell.exe @psArgs
}

Write-Host ""
Write-Host "This STOPS the live site (app pool '$PoolName' / site '$SiteName')." -ForegroundColor Yellow
if ($TriggerCheck) {
    Write-Host "Outage: a few seconds (restarts as soon as the DOWN email is sent)." -ForegroundColor Yellow
} else {
    Write-Host "Outage: about $DownSeconds seconds (so the scheduled health check can catch it)." -ForegroundColor Yellow
}
Write-Host "Through Cloudflare, visitors will see an error page during that window." -ForegroundColor Yellow
if (-not $Yes) {
    $ans = Read-Host "Proceed? (type 'yes' to continue)"
    if ($ans -ne "yes") { Write-Host "Aborted."; return }
}

# Only stop if it's currently running; restore accordingly in finally.
$wasStarted = (Get-WebAppPoolState -Name $PoolName).Value -eq "Started"
$stopped = $false
try {
    if ($wasStarted) {
        Write-Host "Stopping app pool '$PoolName' ..." -ForegroundColor Cyan
        Stop-WebAppPool -Name $PoolName
        $stopped = $true
        Start-Sleep -Seconds 3   # let in-flight requests drain and Cloudflare see the origin down
    } else {
        Write-Warning "App pool '$PoolName' was already stopped - leaving it as found."
    }

    if ($TriggerCheck) {
        Write-Host "Health check against the DOWN site (expect a '[GNDJ DOWN]' email) ..." -ForegroundColor Cyan
        Invoke-RealHealthCheck
    } else {
        Write-Host "Site is down. The scheduled GNDJ-HealthCheck will detect it and email you within its interval." -ForegroundColor Cyan
        Write-Host "Holding the outage for $DownSeconds s (Ctrl-C is safe - the pool restarts on exit) ..." -ForegroundColor Cyan
        Start-Sleep -Seconds $DownSeconds
    }
}
finally {
    if ($stopped) {
        Write-Host "Restarting app pool '$PoolName' ..." -ForegroundColor Cyan
        Start-WebAppPool -Name $PoolName
    }
}

if ($stopped) {
    Start-Sleep -Seconds 5   # give the origin a moment to answer again before the recovery check
    if ($TriggerCheck) {
        Write-Host "Health check after restart (expect a '[GNDJ recovered]' email) ..." -ForegroundColor Cyan
        Invoke-RealHealthCheck
    } else {
        Write-Host "Site restarted. The next scheduled health check will send the recovery email." -ForegroundColor Green
    }
}
Write-Host "Done." -ForegroundColor Green
