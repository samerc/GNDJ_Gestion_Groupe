<#
.SYNOPSIS
  Nightly PostgreSQL backup -> local file + off-server cloud copy (rclone) + email status.
.DESCRIPTION
  1. pg_dump the database to a timestamped custom-format (.dump) file in the local backup dir.
  2. Copy it OFF the server to a cloud remote (OneDrive/Google Drive) via rclone - so a full disk
     crash does not take the backups with it.
  3. Prune local + remote copies older than the retention window.
  4. Email a success/failure summary (always on failure; on success if notifyOnSuccess).

  Run ELEVATED on the prod server (or via the SYSTEM scheduled task from install-ops-tasks.ps1).
  All settings/secrets come from deploy\ops-alert.config.json (gitignored). See deploy\OPS.md.
.EXAMPLE
  ./deploy/backup-db.ps1
#>
param([string]$ConfigPath)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ops-common.ps1")
$cfg = Get-OpsConfig -ConfigPath $ConfigPath

$stamp = Get-Date -Format "yyyyMMdd_HHmm"
$db = $cfg.database
$bk = $cfg.backup
$file = Join-Path $bk.dir "gndj_$stamp.dump"
$log = @()
$ok = $true
$err = ""

try {
    if (-not (Test-Path $bk.dir)) { New-Item -ItemType Directory -Path $bk.dir -Force | Out-Null }

    # Step 1. Dump (custom format = compressed, restorable with pg_restore).
    $pgDump = Join-Path $db.pgBin "pg_dump.exe"
    if (-not (Test-Path $pgDump)) { throw "pg_dump not found at '$pgDump' - check database.pgBin." }
    $env:PGPASSWORD = $db.password
    & $pgDump -h localhost -U $db.user -d $db.name -Fc -f $file
    if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }
    $sizeMb = [math]::Round((Get-Item $file).Length / 1MB, 1)
    $log += "Dump OK: $file ($sizeMb MB)"

    # Step 2. Off-server copy via rclone.
    if ($bk.rcloneRemote) {
        # Resolve rclone: prefer an explicit full path from the config (backup.rcloneExe) — the SYSTEM-run
        # scheduled task's PATH often does NOT include a user-scoped winget install, so relying on PATH alone
        # fails at 03:00 even when a manual run works. Fall back to 'rclone' on PATH if no explicit path is set.
        $rcloneExe = $bk.rcloneExe
        if (-not $rcloneExe) {
            $cmd = Get-Command rclone -ErrorAction SilentlyContinue
            if ($cmd) { $rcloneExe = $cmd.Source }
        }
        if (-not $rcloneExe -or -not (Test-Path $rcloneExe)) {
            throw "rclone not found. Install it, then set backup.rcloneExe to the full path of rclone.exe (see OPS.md)."
        }
        # --config lets the SYSTEM-run scheduled task find the OAuth token created under your user.
        $rc = @()
        if ($bk.rcloneConfig) { $rc += @("--config", $bk.rcloneConfig) }
        & $rcloneExe @rc copy $file $bk.rcloneRemote --no-traverse
        if ($LASTEXITCODE -ne 0) { throw "rclone copy exited with code $LASTEXITCODE" }
        $log += "Uploaded to $($bk.rcloneRemote)"
        # Prune remote copies older than the retention window (best-effort).
        & $rcloneExe @rc delete $bk.rcloneRemote --min-age "$($bk.retentionDays)d" 2>$null
        $log += "Remote prune (older than $($bk.retentionDays)d) done"
    } else {
        $log += "WARNING: no rcloneRemote configured - backup is LOCAL ONLY (lost if the server dies)."
    }

    # Step 3. Prune local copies older than the retention window.
    $cutoff = (Get-Date).AddDays(-[int]$bk.retentionDays)
    Get-ChildItem $bk.dir -Filter "gndj_*.dump" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force
    $log += "Local prune (older than $($bk.retentionDays)d) done"
}
catch {
    $ok = $false
    $err = $_.Exception.Message
}
finally {
    $env:PGPASSWORD = $null
}

$status = if ($ok) { "OK" } else { "FAILED" }
$subject = "[GNDJ Backup $status] $stamp"
$body = ($log -join "`n")
if (-not $ok) { $body = "BACKUP FAILED`n`n$err`n`n--- steps completed ---`n$body" }

if (-not $ok -or [bool]$bk.notifyOnSuccess) {
    Send-OpsAlert -Config $cfg -Subject $subject -Body $body
}
Write-Host $subject
Write-Host $body
if (-not $ok) { exit 1 }
