# Runs the fiche reader ON DEMAND: starts Ollama (if not running), reads the fiches, writes the Excel, stops the
# Ollama it started (frees its memory). Fiches already read are skipped, so runs add up into one Excel.
#
#   List the units (fiches, read, left):  run-ocr.ps1 -ListUnits
#   One unit:                              run-ocr.ps1 -Unit C1         (several: -Unit C1,T3)
#   Everything left:                       run-ocr.ps1
#   Trial (20 fiches, in C:\gndj-ocr\essai): run-ocr.ps1 -Trial 20      (can be combined with -Unit)
#   Stop by a given time:                  run-ocr.ps1 -Until 06:00     (no new fiche started after it)
# Stop early with Ctrl+C: the fiche in progress finishes and the Excel is written.
# Call it as: powershell -ExecutionPolicy Bypass -File deploy\ocr\run-ocr.ps1 <options>
#
# The optional night task runs it with -Until 06:00. Pause that task: create C:\gndj-ocr\PAUSE.
# ASCII only (PowerShell 5.1).

[CmdletBinding()]
param(
    [string]$OutDir = 'C:\gndj-ocr',
    [string]$OllamaDir = 'C:\ollama',
    [string]$SiteDir = 'C:\inetpub\www\gndj',
    [string]$Model = 'qwen2.5vl:7b',
    [string]$Until = '',
    [string[]]$Unit = @(),
    [switch]$ListUnits,
    [int]$Threads = 4,
    [int]$Trial = 0,
    [int]$Limit = 0,
    [switch]$RetryErrors,
    [switch]$Night        # set by the night task: honours the PAUSE file
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ollama-common.ps1')

$exe = Join-Path $OutDir 'tool\FicheOcr.exe'
if (-not (Test-Path $exe)) { throw "$exe not found: run setup-ocr.ps1 first." }

if ($ListUnits) {
    # Reads the database only: no model needed.
    & $exe --site $SiteDir --out $OutDir --list-units
    exit $LASTEXITCODE
}

$logDir = Join-Path $OutDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("run-{0:yyyyMMdd-HHmm}.log" -f (Get-Date))
function Log($m) { $line = "{0:HH:mm:ss} {1}" -f (Get-Date), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding UTF8 }

if ($Night -and (Test-Path (Join-Path $OutDir 'PAUSE'))) {
    Log 'PAUSE file present: nothing to do tonight.'
    exit 0
}

$started = $null
try {
    $started = Start-OllamaIfNeeded -OllamaExe (Join-Path $OllamaDir 'ollama.exe') -ModelsDir (Join-Path $OllamaDir 'models')
    if ($started) { Log "Ollama started (pid $($started.Id))." } else { Log 'Ollama already running.' }

    $argList = @('--site', $SiteDir, '--out', $OutDir, '--model', $Model, '--threads', $Threads)
    if ($Until) { $argList += @('--until', $Until) }
    if ($Unit.Count -gt 0) { $argList += @('--unit', ($Unit -join ',')) }
    if ($Trial -gt 0) { $argList += @('--essai', $Trial) }
    if ($Limit -gt 0) { $argList += @('--limit', $Limit) }
    if ($RetryErrors) { $argList += '--retry-errors' }
    Log ("FicheOcr " + ($argList -join ' '))

    # Native output goes to the log; stderr must not stop the script under ErrorActionPreference=Stop.
    $ErrorActionPreference = 'Continue'
    & $exe @argList 2>&1 | ForEach-Object { Log $_ }
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Log "FicheOcr exit code $code."
    exit $code
} finally {
    if ($started) { Stop-OllamaTree $started; Log 'Ollama stopped.' }
}
