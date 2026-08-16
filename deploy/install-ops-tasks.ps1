<#
.SYNOPSIS
  Registers the GNDJ ops scheduled tasks (nightly DB backup + health check + self-healing watchdog) and
  sets PostgreSQL to auto-restart on failure.
.DESCRIPTION
  Run ELEVATED on the prod server AFTER filling in deploy\ops-alert.config.json (and, for cloud
  backups, after 'rclone config'). All tasks run as SYSTEM so they survive logoff/reboot. Re-run
  this script any time to update the schedule (it uses -Force to replace existing tasks).

  Self-healing has three layers:
    * GNDJ-Watchdog  - probes local /health every few minutes; if down, restarts PostgreSQL (if needed) and
                       the IIS app pool (also re-enabling a rapid-fail-disabled pool), then emails the outcome.
    * PostgreSQL service recovery - Windows auto-restarts the DB service if it crashes.
    * (app pool AlwaysRunning + disallowOverlappingRotation are set by tune-apppool.ps1.)
.EXAMPLE
  ./deploy/install-ops-tasks.ps1
.EXAMPLE
  ./deploy/install-ops-tasks.ps1 -BackupTime 02:30 -HealthEveryMinutes 10 -WatchdogEveryMinutes 3
#>
param(
    [string]$BackupTime = "03:00",
    [int]$HealthEveryMinutes = 5,
    [int]$WatchdogEveryMinutes = 3,
    [string]$PgService = "postgresql-x64-18"
)
$ErrorActionPreference = "Stop"
$scripts = $PSScriptRoot
$psExe = "powershell.exe"

# Nightly backup task.
$backupAction = New-ScheduledTaskAction -Execute $psExe `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$scripts\backup-db.ps1`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $BackupTime
Register-ScheduledTask -TaskName "GNDJ-Backup" -Action $backupAction -Trigger $backupTrigger `
    -RunLevel Highest -User "SYSTEM" -Force `
    -Description "GNDJ: nightly PostgreSQL backup + off-server upload (deploy\backup-db.ps1)" | Out-Null

# Health check every N minutes.
$healthAction = New-ScheduledTaskAction -Execute $psExe `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$scripts\healthcheck.ps1`""
# NOTE: use a large but FINITE duration (~10 years). [TimeSpan]::MaxValue produces
# P99999999D which Task Scheduler rejects as out of range on Windows Server.
$healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $HealthEveryMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "GNDJ-HealthCheck" -Action $healthAction -Trigger $healthTrigger `
    -RunLevel Highest -User "SYSTEM" -Force `
    -Description "GNDJ: pings /health, emails on state change (deploy\healthcheck.ps1)" | Out-Null

# Self-healing watchdog every N minutes: if the local /health is down, restart the services automatically.
$watchAction = New-ScheduledTaskAction -Execute $psExe `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$scripts\watchdog.ps1`""
$watchTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $WatchdogEveryMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "GNDJ-Watchdog" -Action $watchAction -Trigger $watchTrigger `
    -RunLevel Highest -User "SYSTEM" -Force `
    -Description "GNDJ: self-heals a down app (restarts PostgreSQL + app pool), emails outcome (deploy\watchdog.ps1)" | Out-Null

# PostgreSQL service recovery: Windows auto-restarts the DB if it crashes (1st/2nd fail = 60s, 3rd = 120s;
# the failure counter resets after a day of health). Independent of the watchdog. Best-effort.
try {
    & sc.exe failure $PgService reset= 86400 actions= restart/60000/restart/60000/restart/120000 | Out-Null
    Write-Host "PostgreSQL service '$PgService' set to auto-restart on failure." -ForegroundColor DarkGray
} catch {
    Write-Warning "Could not set service recovery for '$PgService': $($_.Exception.Message)"
}

Write-Host "Registered scheduled tasks:" -ForegroundColor Green
Write-Host "  GNDJ-Backup       - daily at $BackupTime"
Write-Host "  GNDJ-HealthCheck  - every $HealthEveryMinutes min (notify)"
Write-Host "  GNDJ-Watchdog     - every $WatchdogEveryMinutes min (self-heal)"
Write-Host ""
Write-Host "Test now with:"
Write-Host "  Start-ScheduledTask -TaskName GNDJ-Backup"
Write-Host "  Start-ScheduledTask -TaskName GNDJ-HealthCheck"
Write-Host "  Start-ScheduledTask -TaskName GNDJ-Watchdog"
