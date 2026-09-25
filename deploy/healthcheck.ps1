<#
.SYNOPSIS
  Pings the app's /health endpoint and emails an alert when the site goes down (or recovers), and when a disk
  runs low on free space (or recovers).
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

# ---- Disk space (independent of the site: a full disk is what takes it down). ----
# Checks each drive in disk.drives (default: C plus the drive holding backup.dir). A drive is LOW when its free
# space is under disk.minFreePercent (default 10) OR disk.minFreeGb (default 5). Like the site check, it emails only
# on a change (ok -> low, low -> ok), tracked in disk-state.txt, so a low disk alerts once, not every run.
$dk = $cfg.disk
$minPct = if ($dk -and $dk.minFreePercent) { [double]$dk.minFreePercent } else { 10 }
$minGb = if ($dk -and $dk.minFreeGb) { [double]$dk.minFreeGb } else { 5 }
$drives = @()
if ($dk -and $dk.drives) { $drives = @($dk.drives) }
else {
    $drives = @("C")
    if ($cfg.backup -and $cfg.backup.dir) { $drives += ([System.IO.Path]::GetPathRoot($cfg.backup.dir)).Substring(0, 1) }
}
$lowLines = @()
$allLines = @()
foreach ($d in ($drives | ForEach-Object { $_.ToString().Substring(0, 1).ToUpper() } | Select-Object -Unique)) {
    try {
        $info = New-Object System.IO.DriveInfo("$($d):")
        if (-not $info.IsReady) { continue }
        $freeGb = [math]::Round($info.AvailableFreeSpace / 1GB, 1)
        $totalGb = [math]::Round($info.TotalSize / 1GB, 1)
        $pct = [math]::Round($info.AvailableFreeSpace * 100.0 / $info.TotalSize, 1)
        $line = "$($d): $freeGb GB free of $totalGb GB ($pct %)"
        $allLines += $line
        if ($pct -lt $minPct -or $freeGb -lt $minGb) { $lowLines += $line }
    }
    catch { $allLines += "$($d): could not be read ($($_.Exception.Message))" }
}
$diskStateFile = Join-Path $PSScriptRoot "disk-state.txt"
$diskPrev = if (Test-Path $diskStateFile) { (Get-Content $diskStateFile -Raw).Trim() } else { "ok" }
$diskNow = if ($lowLines.Count -gt 0) { "low" } else { "ok" }
Set-Content $diskStateFile $diskNow -NoNewline -Encoding utf8
if ($diskNow -ne $diskPrev) {
    if ($diskNow -eq "low") {
        Send-OpsAlert -Config $cfg -Subject "[GNDJ DISK LOW] free space under $minPct % / $minGb GB" `
            -Body ("Disk space is LOW at $(Get-Date -Format 'u'):`n" + ($lowLines -join "`n") + "`n`nAll drives:`n" + ($allLines -join "`n") +
                "`n`nFree space: old backups in the backup folder, IIS/app logs, or the uploads folder (see Systeme page > Fichiers orphelins).")
    }
    else {
        Send-OpsAlert -Config $cfg -Subject "[GNDJ disk ok] free space back above the limit" -Body ("Disk space OK again at $(Get-Date -Format 'u'):`n" + ($allLines -join "`n"))
    }
}
Write-Host "disk $diskNow ($($allLines -join '; '))"

if (-not $healthy) { exit 1 }
