<#
.SYNOPSIS
  Registers the two GNDJ ops scheduled tasks: nightly DB backup + periodic health check.
.DESCRIPTION
  Run ELEVATED on the prod server AFTER filling in deploy\ops-alert.config.json (and, for cloud
  backups, after 'rclone config'). Both tasks run as SYSTEM so they survive logoff/reboot. Re-run
  this script any time to update the schedule (it uses -Force to replace existing tasks).
.EXAMPLE
  ./deploy/install-ops-tasks.ps1
.EXAMPLE
  ./deploy/install-ops-tasks.ps1 -BackupTime 02:30 -HealthEveryMinutes 10
#>
param(
    [string]$BackupTime = "03:00",
    [int]$HealthEveryMinutes = 5
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
$healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $HealthEveryMinutes) `
    -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "GNDJ-HealthCheck" -Action $healthAction -Trigger $healthTrigger `
    -RunLevel Highest -User "SYSTEM" -Force `
    -Description "GNDJ: pings /health, emails on state change (deploy\healthcheck.ps1)" | Out-Null

Write-Host "Registered scheduled tasks:" -ForegroundColor Green
Write-Host "  GNDJ-Backup       - daily at $BackupTime"
Write-Host "  GNDJ-HealthCheck  - every $HealthEveryMinutes min"
Write-Host ""
Write-Host "Test now with:"
Write-Host "  Start-ScheduledTask -TaskName GNDJ-Backup"
Write-Host "  Start-ScheduledTask -TaskName GNDJ-HealthCheck"
