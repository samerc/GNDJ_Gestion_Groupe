<#
  GNDJ - backup RESTORE TEST (run on the PROD server; monthly scheduled task "GNDJ-RestoreTest").

  A backup is only useful if it can be restored. This script proves it, without touching the live database:
    1. Takes the NEWEST gndj_*.dump in backup.dir (the nightly backup).
    2. Restores it into a scratch database (restoreTest.database, default "gndj_restore_test"), dropped first.
    3. Checks the restored copy: key tables present and non-empty, row counts close to the live database,
       same latest EF migration as live, and the dump is recent (not an old file left behind).
    4. Drops the scratch database and emails the result (OK / FAILED + the details) to alertTo.

  Needs the database user to be allowed to create databases (CREATEDB). If it isn't, set restoreTest.user /
  restoreTest.password in ops-alert.config.json to an account that is (e.g. postgres).

  Usage:  powershell -ExecutionPolicy Bypass -File deploy\restore-test.ps1 [-ConfigPath <json>] [-NoEmail]
  (ASCII only: Windows PowerShell 5.1 reads non-BOM scripts as ANSI.)
#>
param([string]$ConfigPath, [switch]$NoEmail)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ops-common.ps1")
$cfg = Get-OpsConfig -ConfigPath $ConfigPath

$db = $cfg.database
$bk = $cfg.backup
$rt = $cfg.restoreTest
$scratch = if ($rt -and $rt.database) { $rt.database } else { "gndj_restore_test" }
$user = if ($rt -and $rt.user) { $rt.user } else { $db.user }
$pass = if ($rt -and $rt.password) { $rt.password } else { $db.password }
$maxAgeHours = if ($rt -and $rt.maxDumpAgeHours) { [int]$rt.maxDumpAgeHours } else { 36 }
$psql = Join-Path $db.pgBin "psql.exe"
$pgRestore = Join-Path $db.pgBin "pg_restore.exe"

$log = @()
$ok = $true
$err = ""

# Runs one SQL statement with psql and returns the trimmed text output (throws on error).
# (Windows PowerShell 5.1 turns ANY stderr text of a native command into a terminating error under
# ErrorActionPreference=Stop, even when redirected - so Continue is used locally, and NOTICEs are silenced.)
function Invoke-Sql([string]$database, [string]$sql, [string]$dbUser, [string]$dbPass) {
    $ErrorActionPreference = "Continue"
    $env:PGPASSWORD = $dbPass
    $env:PGOPTIONS = "-c client_min_messages=warning"
    $errFile = [System.IO.Path]::GetTempFileName()
    $out = & $psql -h localhost -U $dbUser -d $database -At -v ON_ERROR_STOP=1 -c $sql 2> $errFile
    $code = $LASTEXITCODE
    $e = Get-Content $errFile -Raw -ErrorAction SilentlyContinue
    Remove-Item $errFile -Force -ErrorAction SilentlyContinue
    if ($code -ne 0) { throw "psql failed on '$database': $e" }
    return (($out | Out-String).Trim())
}

try {
    if (-not (Test-Path $psql)) { throw "psql not found at '$psql' - check database.pgBin." }
    $dump = Get-ChildItem $bk.dir -Filter "gndj_*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $dump) { throw "No gndj_*.dump found in $($bk.dir)." }
    $ageHours = [math]::Round(((Get-Date) - $dump.LastWriteTime).TotalHours, 1)
    $log += "Dump: $($dump.Name) ($([math]::Round($dump.Length / 1MB, 1)) MB, $ageHours h old)"
    if ($ageHours -gt $maxAgeHours) { throw "The newest dump is $ageHours h old (more than $maxAgeHours h): the nightly backup may not be running." }

    # 1. Fresh scratch database.
    Invoke-Sql "postgres" "DROP DATABASE IF EXISTS $scratch" $user $pass | Out-Null
    Invoke-Sql "postgres" "CREATE DATABASE $scratch" $user $pass | Out-Null
    $log += "Scratch database '$scratch' created"

    # 2. Restore (no owners / grants: the scratch copy belongs to the restoring user).
    $env:PGPASSWORD = $pass
    $restoreErrFile = [System.IO.Path]::GetTempFileName()
    $ErrorActionPreference = "Continue"
    & $pgRestore -h localhost -U $user -d $scratch --no-owner --no-acl $dump.FullName 2> $restoreErrFile
    $restoreCode = $LASTEXITCODE
    $restoreErr = Get-Content $restoreErrFile -Raw -ErrorAction SilentlyContinue
    Remove-Item $restoreErrFile -Force -ErrorAction SilentlyContinue
    $ErrorActionPreference = "Stop"
    if ($restoreCode -ne 0) { throw "pg_restore exited with code $restoreCode`n$restoreErr" }
    $log += "Restore OK"

    # 3. Checks: key tables non-empty and close to live (the dump is up to a day old, so allow some drift).
    $tables = @("members", "users", "member_assignments", "units", "settings", "member_documents", "audit_logs")
    foreach ($t in $tables) {
        $restored = [int](Invoke-Sql $scratch "SELECT count(*) FROM $t" $user $pass)
        $live = [int](Invoke-Sql $db.name "SELECT count(*) FROM $t" $db.user $db.password)
        $log += ("  {0,-20} restored {1,7}   live {2,7}" -f $t, $restored, $live)
        if ($t -ne "audit_logs" -and $restored -eq 0 -and $live -gt 0) { throw "Table '$t' is EMPTY in the restored copy." }
        if ($live -gt 50 -and $restored -lt [math]::Floor($live * 0.9)) { throw "Table '$t' has far fewer rows in the backup ($restored) than live ($live)." }
    }
    # (\" : Windows PowerShell 5.1 drops bare double quotes when passing arguments to a native program.)
    $migRestored = Invoke-Sql $scratch 'SELECT max(migration_id) FROM \"__EFMigrationsHistory\"' $user $pass
    $migLive = Invoke-Sql $db.name 'SELECT max(migration_id) FROM \"__EFMigrationsHistory\"' $db.user $db.password
    $log += "Latest migration: restored $migRestored / live $migLive"
    if ($migRestored -ne $migLive) { $log += "  (differs: normal right after a deploy that added a migration; the next backup catches up)" }
    $log += "All checks passed - the backup restores correctly."
}
catch {
    $ok = $false
    $err = $_.Exception.Message
}
finally {
    try { Invoke-Sql "postgres" "DROP DATABASE IF EXISTS $scratch" $user $pass | Out-Null; $log += "Scratch database dropped" }
    catch { $log += "WARNING: could not drop '$scratch': $($_.Exception.Message)" }
    $env:PGPASSWORD = $null
    $env:PGOPTIONS = $null
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$status = if ($ok) { "OK" } else { "FAILED" }
$subject = "[GNDJ Restore test $status] $stamp"
$body = ($log -join "`n")
if (-not $ok) { $body = "RESTORE TEST FAILED`n`n$err`n`n--- steps ---`n$body" }
if (-not $NoEmail) { Send-OpsAlert -Config $cfg -Subject $subject -Body $body }
Write-Host $subject
Write-Host $body
if (-not $ok) { exit 1 }
