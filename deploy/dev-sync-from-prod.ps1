<#
.SYNOPSIS
  Refresh the LOCAL DEV database from a PROD pg_dump snapshot, WITHOUT importing prod's email providers — so the
  dev app can NEVER send real email. Run this every once in a while to test against fresh, real data.

.DESCRIPTION
  DESTRUCTIVE: replaces ALL data in the local 'gndj' database with the prod snapshot. Uses the dev 'gndj_admin'
  role, which OWNS the database and has CREATEDB, so no postgres superuser password is needed (unlike the prod
  reset-to-import.ps1). Steps, in a deliberately SAFE order:

    1. Stop the dev API (GNDJ.Api / dotnet) so it holds no DB connections and cannot process email mid-swap.
    2. Back up the CURRENT dev DB (safety) and capture the current dev smtp_servers.
    3. Drop + recreate 'gndj', restore the prod dump.
    4. NEUTRALIZE email BEFORE the app runs again — this is the whole point:
         - unbind every email template from its (prod) SMTP server,
         - clear the email outbox (prod's queued mail — could be hundreds of real recipients),
         - DELETE every SMTP server that came from prod (the real active providers: SMTP2GO / Mailgun / SendPulse),
         - re-insert the captured dev smtp4dev (localhost) so mail is captured locally, never delivered,
         - point app.base_url at the local app and clear email.override_recipient.
    5. Print a SAFETY CHECK — internet-capable active providers MUST be 0.

  AFTER the script you start the dev API yourself (dotnet run); EF then applies any pending migrations on top of
  the prod data (dev code is usually ahead of prod). Optionally start smtp4dev to see the captured test mail.

  WHY email is neutralized BEFORE the API starts: the outbox background worker drains queued mail on startup. If
  the prod dump's active real providers were live when the app came up, dev would send prod's queued emails to
  real families. Deleting the providers + clearing the outbox first makes that impossible.

.PARAMETER Dump
  Path to the prod snapshot (.dump, custom-format pg_dump). e.g. C:\Users\Administrator\Desktop\gndj_YYYYMMDD_HHMM.dump

.PARAMETER Yes
  Skip the typed confirmation.

.EXAMPLE
  .\deploy\dev-sync-from-prod.ps1 -Dump C:\Users\Administrator\Desktop\gndj_20260907_0300.dump
#>
param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$DbUser = "gndj_admin",
  [string]$DbPassword = "GndjDev2026!",   # dev-only DB password (already in appsettings.Development.json)
  [string]$DbHostName = "localhost",
  [int]$DbPort = 5432,
  [string]$BackupDir = "C:\gndj-dev-backups",
  [switch]$Yes
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Dump)) { throw "Snapshot not found: $Dump" }
$psql      = Join-Path $PgBin "psql.exe"
$pgdump    = Join-Path $PgBin "pg_dump.exe"
$pgrestore = Join-Path $PgBin "pg_restore.exe"
foreach ($t in @($psql, $pgdump, $pgrestore)) { if (-not (Test-Path $t)) { throw "Not found: $t" } }

if (-not $Yes) {
  Write-Host ""
  Write-Host "  WARNING - this REPLACES all data in the local 'gndj' database with:" -ForegroundColor Yellow
  Write-Host "    $Dump" -ForegroundColor Yellow
  Write-Host "  Prod EMAIL PROVIDERS are NOT imported - dev stays send-safe (smtp4dev only)." -ForegroundColor Yellow
  Write-Host ""
  if ((Read-Host "Type SYNC to proceed") -ne "SYNC") { Write-Host "Cancelled." -ForegroundColor Cyan; return }
}

$env:PGPASSWORD = $DbPassword
$pg = @("-h", $DbHostName, "-p", "$DbPort", "-U", $DbUser)   # shared psql/pg_dump/pg_restore connection args
$stamp   = Get-Date -Format "yyyyMMdd_HHmmss"
$capFile = Join-Path $env:TEMP "gndj_dev_smtp_servers.sql"
$sqlFile = Join-Path $env:TEMP "gndj_dev_email_neutralize.sql"

function Invoke-Psql([string]$db, [string]$sql) {
  & $psql @pg -d $db -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed on '$db': $sql" }
}

try {
  Write-Host "==> Stopping dev API..." -ForegroundColor Cyan
  Get-Process GNDJ.Api, dotnet -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  Write-Host "==> Backing up current dev DB + capturing dev smtp_servers..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $backup = Join-Path $BackupDir "gndj_dev_before_sync_$stamp.dump"
  & $pgdump @pg -d gndj -Fc -f $backup
  if ($LASTEXITCODE -ne 0) { throw "Backup of the current dev DB failed - aborting before anything destructive." }
  # Capture dev's own SMTP providers so we can put them back after the restore. An empty capture is fine
  # (dev then ends with 0 SMTP servers, which is fully send-safe).
  & $pgdump @pg -d gndj --data-only --column-inserts --table=public.smtp_servers -f $capFile

  Write-Host "==> Dropping + recreating 'gndj' and restoring the prod dump..." -ForegroundColor Cyan
  Invoke-Psql "postgres" "DROP DATABASE IF EXISTS gndj WITH (FORCE);"
  Invoke-Psql "postgres" "CREATE DATABASE gndj OWNER $DbUser;"
  Invoke-Psql "gndj"     "CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
  # pg_restore emits ONE harmless error (can't COMMENT the unaccent extension as non-superuser) and exits non-zero.
  # That's expected - don't let it abort the script, and don't check its exit code.
  $ErrorActionPreference = "Continue"
  & $pgrestore @pg --no-owner --no-privileges -d gndj $Dump
  $ErrorActionPreference = "Stop"

  Write-Host "==> Neutralizing email (BEFORE the app runs)..." -ForegroundColor Cyan
  @"
UPDATE email_templates SET smtp_server_id = NULL WHERE smtp_server_id IS NOT NULL;
DELETE FROM email_outbox;
DELETE FROM smtp_servers;
UPDATE settings SET value = 'http://localhost:5173' WHERE key = 'app.base_url';
UPDATE settings SET value = '' WHERE key = 'email.override_recipient';
"@ | Out-File -FilePath $sqlFile -Encoding utf8
  & $psql @pg -d gndj -v ON_ERROR_STOP=1 -f $sqlFile
  if ($LASTEXITCODE -ne 0) { throw "Email neutralization failed - DO NOT start the app until this is fixed." }

  # Put dev's own smtp_servers back (smtp4dev). If none were captured, dev has 0 servers = fully safe.
  if ((Test-Path $capFile) -and ((Get-Content $capFile -Raw) -match 'INSERT INTO')) {
    & $psql @pg -d gndj -f $capFile | Out-Null
  } else {
    Write-Host "   (no dev smtp_servers captured - dev has 0 SMTP servers; add smtp4dev in the app to test email)" -ForegroundColor DarkYellow
  }

  Write-Host "==> Safety check..." -ForegroundColor Cyan
  $realActive = (& $psql @pg -d gndj -t -A -c "SELECT count(*) FROM smtp_servers WHERE is_active AND host NOT IN ('localhost','127.0.0.1');").Trim()
  $members    = (& $psql @pg -d gndj -t -A -c "SELECT count(*) FROM members;").Trim()
  $active     = (& $psql @pg -d gndj -t -A -c "SELECT COALESCE(string_agg(name, ', '), '(none)') FROM smtp_servers WHERE is_active;").Trim()
  Write-Host ""
  Write-Host "   members restored              : $members" -ForegroundColor Green
  Write-Host "   active SMTP servers           : $active" -ForegroundColor Green
  if ($realActive -ne "0") {
    Write-Host "   internet-capable active SMTP  : $realActive  <-- NOT SAFE, investigate before starting the app!" -ForegroundColor Red
  } else {
    Write-Host "   internet-capable active SMTP  : 0  -> dev cannot send real email. Safe." -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "==> Next:" -ForegroundColor Cyan
  Write-Host "     1. Start the dev API (applies any pending EF migrations on top of the prod data):"
  Write-Host "          dotnet run --project src/GNDJ.Api --urls http://localhost:5000"
  Write-Host "     2. (optional) Start smtp4dev to capture test mail locally (SMTP :2525 / web UI :5050)."
  Write-Host "     Pre-sync backup of the dev DB: $backup" -ForegroundColor DarkGray
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item $sqlFile -ErrorAction SilentlyContinue
}
