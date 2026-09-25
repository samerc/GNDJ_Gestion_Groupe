<#
.SYNOPSIS
  Nightly PostgreSQL backup -> local file + off-server cloud copy (rclone) + email status.
.DESCRIPTION
  1. pg_dump the database to a timestamped custom-format (.dump) file in the local backup dir.
  2. Copy it OFF the server to a cloud remote (OneDrive/Google Drive) via rclone, into <remote>/database -
     so a full disk crash does not take the backups with it.
  2b. Also sync the yearly audit-log archives (backup.auditArchiveDir) off-server (kept, not pruned).
  2c. And the new-year document archives (backup.documentArchiveDir) (kept, not pruned).
  3. Prune local + remote DB dumps (gndj_*.dump ONLY) older than the retention window. The audit and
     document archives in <remote>/audit and <remote>/documents are never pruned.
  4. Email a success/failure summary to backup.alertTo (admin + CG) - always on failure; on success
     if notifyOnSuccess.

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
    # Capture pg_dump's stderr to a temp file so a failure reports the REAL reason (version mismatch, auth,
    # connection, disk full...) instead of a bare exit code. (Redirect to a file, not 2>&1, to avoid PS 5.1
    # wrapping native stderr in ErrorRecords under $ErrorActionPreference=Stop.)
    # --exclude-table='_bak_*' skips one-off in-DB backup tables (created by cleanup scripts, sometimes owned by
    # the postgres superuser). They're redundant copies that don't belong in a dump anyway, and if the app user
    # can't LOCK them pg_dump would otherwise abort the whole backup.
    $dumpErrFile = [System.IO.Path]::GetTempFileName()
    & $pgDump -h localhost -U $db.user -d $db.name --exclude-table='_bak_*' -Fc -f $file 2> $dumpErrFile
    $dumpCode = $LASTEXITCODE
    $dumpErr = (Get-Content $dumpErrFile -Raw -ErrorAction SilentlyContinue)
    Remove-Item $dumpErrFile -Force -ErrorAction SilentlyContinue
    if ($dumpCode -ne 0) { throw "pg_dump exited with code $dumpCode`n$dumpErr" }
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
        # Dumps go to their own <remote>/database folder (the archives live in <remote>/audit and /documents).
        $dbRemote = "$($bk.rcloneRemote)/database"
        & $rcloneExe @rc copy $file $dbRemote --no-traverse
        if ($LASTEXITCODE -ne 0) { throw "rclone copy exited with code $LASTEXITCODE" }
        $log += "Uploaded to $dbRemote"
        # Prune remote DUMPS older than the retention window (best-effort). --include limits it to gndj_*.dump:
        # 'rclone delete' is recursive, and without the filter it used to wipe the yearly audit/document
        # archives in the subfolders after the retention window. The second call cleans dumps uploaded to the
        # remote ROOT before the database/ folder existed (--max-depth 1 = root only).
        & $rcloneExe @rc delete $dbRemote --include "gndj_*.dump" --min-age "$($bk.retentionDays)d" 2>$null
        & $rcloneExe @rc delete $bk.rcloneRemote --include "gndj_*.dump" --max-depth 1 --min-age "$($bk.retentionDays)d" 2>$null
        $log += "Remote prune of dumps (older than $($bk.retentionDays)d) done"
    } else {
        $log += "WARNING: no rcloneRemote configured - backup is LOCAL ONLY (lost if the server dies)."
    }

    # Step 2b. Sync the audit-log year archives OFF-server too (best-effort — a failure here must NOT fail the
    # DB backup). The app writes a CSV per scout year to backup.auditArchiveDir (config AuditArchive:Directory,
    # e.g. C:\gndj-backups\audit) when a new year is created; we push those to <remote>/audit. NOT pruned —
    # these yearly archives are the permanent record of the cleared audit trail (12-month retention model).
    if ($bk.rcloneRemote -and $bk.auditArchiveDir) {
        try {
            if (Test-Path $bk.auditArchiveDir) {
                & $rcloneExe @rc copy $bk.auditArchiveDir "$($bk.rcloneRemote)/audit" --no-traverse
                if ($LASTEXITCODE -ne 0) { throw "rclone copy (audit) exited with code $LASTEXITCODE" }
                $log += "Audit archives synced to $($bk.rcloneRemote)/audit"
            }
        } catch {
            $log += "WARNING: audit-archive sync failed: $($_.Exception.Message)"
        }
    }

    # Step 2c. Same for the new-year document archives (zip of every document, written once per scout year by
    # the app's "Nettoyage de nouvelle annee" to backup.documentArchiveDir = config DocumentArchive:Directory).
    # Pushed to <remote>/documents, NOT pruned (they are the only copy of the deleted documents). Best-effort.
    if ($bk.rcloneRemote -and $bk.documentArchiveDir) {
        try {
            if (Test-Path $bk.documentArchiveDir) {
                & $rcloneExe @rc copy $bk.documentArchiveDir "$($bk.rcloneRemote)/documents" --no-traverse
                if ($LASTEXITCODE -ne 0) { throw "rclone copy (documents) exited with code $LASTEXITCODE" }
                $log += "Document archives synced to $($bk.rcloneRemote)/documents"
            }
        } catch {
            $log += "WARNING: document-archive sync failed: $($_.Exception.Message)"
        }
    }

    # Step 3. Prune local copies older than the retention window (DB dumps only — NOT the audit archives).
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
