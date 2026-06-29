<#
.SYNOPSIS
  Switch PostgreSQL between a HIGH and LOW performance profile for the GNDJ workload.
.DESCRIPTION
  Run ON THE SERVER as Administrator. This box is SHARED with other websites, and GNDJ's load is
  seasonal (the passage / demandes / rentree crunch lands in September-October). So instead of
  baking in aggressive year-round memory settings, this toggles two profiles:

    HIGH  -> use Sept-Oct (peak). GNDJ gets a big share of RAM/cache for fast reads.
    LOW   -> use the rest of the year. Conservative, leaves RAM + OS cache for the other sites.

  Settings are written with ALTER SYSTEM (postgresql.auto.conf) so your hand-edited postgresql.conf
  is left untouched. Because shared_buffers/max_connections change between profiles and those require
  a restart, the script restarts the PostgreSQL service by default (this affects EVERY database on the
  instance, so it asks for confirmation). You only run this twice a year.

  These are starting points for a 24 GB / 8-core box. If GNDJ is the ONLY heavy app, you can raise
  the HIGH numbers (shared_buffers up to ~6GB, effective_cache_size up to ~18GB). If the other sites
  are memory-hungry, lower them. effective_cache_size is only a planner hint (reserves no RAM), so be
  honest about how much OS file cache GNDJ can really expect to have.
.PARAMETER Profile
  High or Low. Required.
.PARAMETER PgBin
  PostgreSQL bin folder (psql.exe). Default: C:\Program Files\PostgreSQL\18\bin
.PARAMETER ServiceName
  Windows service name. Default: postgresql-x64-18
.PARAMETER NoRestart
  Apply settings and only pg_reload_conf() — does NOT restart. shared_buffers/max_connections changes
  will NOT take effect until the next restart. Use only if you understand the consequence.
.EXAMPLE
  ./deploy/pg-profile.ps1 -Profile High      # before the September rush
.EXAMPLE
  ./deploy/pg-profile.ps1 -Profile Low       # after the rush dies down
#>
param(
  [Parameter(Mandatory=$true)][ValidateSet("High","Low")][string]$Profile,
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$ServiceName = "postgresql-x64-18",
  [switch]$NoRestart
)
$ErrorActionPreference = "Stop"

$psql = Join-Path $PgBin "psql.exe"
if (-not (Test-Path $psql)) { throw "psql.exe not found at '$psql'. Pass -PgBin pointing at your PostgreSQL bin folder." }

# Profile-specific (memory) settings.
if ($Profile -eq "High") {
  $settings = [ordered]@{
    "shared_buffers"        = "4GB"     # restart: dedicated cache (Sept-Oct peak)
    "effective_cache_size"  = "12GB"    # reload: planner hint - assume GNDJ dominates OS cache now
    "work_mem"              = "24MB"    # reload: per sort/hash node
    "maintenance_work_mem"  = "512MB"   # reload: VACUUM / index builds
  }
} else {
  $settings = [ordered]@{
    "shared_buffers"        = "1GB"     # restart: modest - leave RAM for the other sites
    "effective_cache_size"  = "4GB"     # reload: conservative shared-box hint
    "work_mem"              = "8MB"     # reload
    "maintenance_work_mem"  = "256MB"   # reload
  }
}

# Hardware-general settings - same in both profiles, set idempotently (SSD + 8 cores).
$common = [ordered]@{
  "max_connections"               = "100"   # restart: app pool maxes at 50, leaves headroom for tooling
  "random_page_cost"              = "1.1"   # reload: SSD
  "effective_io_concurrency"      = "200"   # reload: SSD
  "checkpoint_completion_target"  = "0.9"   # reload
  "wal_buffers"                   = "16MB"  # restart
  "max_worker_processes"          = "8"     # restart
  "max_parallel_workers"          = "8"     # restart
  "max_parallel_workers_per_gather" = "4"   # reload
}

Write-Host "==> PostgreSQL profile: $Profile" -ForegroundColor Cyan
$pw = Read-Host "postgres password" -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $pw).Password

function Set-PgSetting($name, $value) {
  $sql = "ALTER SYSTEM SET $name = '$value';"
  & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to set $name (psql exit $LASTEXITCODE) - wrong password or service down?" }
  Write-Host ("    {0,-32} = {1}" -f $name, $value) -ForegroundColor DarkGray
}

Write-Host "Applying memory settings ($Profile):" -ForegroundColor Cyan
foreach ($k in $settings.Keys) { Set-PgSetting $k $settings[$k] }
Write-Host "Applying common (hardware) settings:" -ForegroundColor Cyan
foreach ($k in $common.Keys) { Set-PgSetting $k $common[$k] }

if ($NoRestart) {
  & $psql -h localhost -U postgres -d postgres -c "SELECT pg_reload_conf();" | Out-Null
  Write-Warning "Reloaded config WITHOUT restart. shared_buffers / max_connections / wal_buffers / worker settings are NOT active until you restart '$ServiceName'."
} else {
  Write-Host ""
  Write-Warning "Restarting '$ServiceName' applies shared_buffers etc. but briefly interrupts EVERY database on this instance (all sites)."
  $confirm = Read-Host "Type RESTART to restart PostgreSQL now (anything else = skip restart)"
  if ($confirm -eq "RESTART") {
    Write-Host "==> Restarting $ServiceName..." -ForegroundColor Cyan
    Restart-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 3
    Write-Host "    service state: $((Get-Service -Name $ServiceName).Status)" -ForegroundColor Green
  } else {
    & $psql -h localhost -U postgres -d postgres -c "SELECT pg_reload_conf();" | Out-Null
    Write-Warning "Skipped restart. Reload applied; restart-only settings take effect at next PostgreSQL restart."
  }
}

$env:PGPASSWORD = $null
Write-Host ""
# Backtick-escape the inner double quotes — in PowerShell the escape char is the backtick, not the
# backslash. The old \" terminated the string early so "SHOW ..." was parsed as a command (harmless,
# but it printed a CommandNotFoundException after the settings had already applied).
Write-Host "Done. Verify with:  & '$psql' -U postgres -c `"SHOW shared_buffers;`"" -ForegroundColor Green
