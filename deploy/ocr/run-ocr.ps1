# Runs one pass of the fiche reader: starts Ollama (if not running), reads fiches until -Until, writes the
# Excel, stops the Ollama it started (frees its memory for the day). Used by the night task and for the trial.
#
#   Trial (20 fiches, no end time, results in C:\gndj-ocr\essai):
#     powershell -ExecutionPolicy Bypass -File deploy\ocr\run-ocr.ps1 -Trial 20 -Until ''
#   Night (what the task runs): reads until 06:00, picks up where it stopped last night.
#
# Pause the night runs (enrolment, rentree...): create the file C:\gndj-ocr\PAUSE ; delete it to resume.
# ASCII only (PowerShell 5.1).

[CmdletBinding()]
param(
    [string]$OutDir = 'C:\gndj-ocr',
    [string]$OllamaDir = 'C:\ollama',
    [string]$SiteDir = 'C:\inetpub\www\gndj',
    [string]$Model = 'qwen2.5vl:7b',
    [string]$Until = '06:00',
    [int]$Threads = 4,
    [int]$Trial = 0,
    [int]$Limit = 0,
    [switch]$RetryErrors
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ollama-common.ps1')

$logDir = Join-Path $OutDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("run-{0:yyyyMMdd-HHmm}.log" -f (Get-Date))
function Log($m) { $line = "{0:HH:mm:ss} {1}" -f (Get-Date), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding UTF8 }

if ($Trial -eq 0 -and (Test-Path (Join-Path $OutDir 'PAUSE'))) {
    Log 'PAUSE file present: nothing to do tonight.'
    exit 0
}

$exe = Join-Path $OutDir 'tool\FicheOcr.exe'
if (-not (Test-Path $exe)) { throw "$exe not found: run setup-ocr.ps1 first." }

$started = $null
try {
    $started = Start-OllamaIfNeeded -OllamaExe (Join-Path $OllamaDir 'ollama.exe') -ModelsDir (Join-Path $OllamaDir 'models')
    if ($started) { Log "Ollama started (pid $($started.Id))." } else { Log 'Ollama already running.' }

    $argList = @('--site', $SiteDir, '--out', $OutDir, '--model', $Model, '--threads', $Threads)
    if ($Until) { $argList += @('--until', $Until) }
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
