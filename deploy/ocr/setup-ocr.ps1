# One-time setup of the offline fiche-medicale reader (FicheOcr) on the production server.
# Run in an ELEVATED PowerShell from the repo clone:
#   powershell -ExecutionPolicy Bypass -File deploy\ocr\setup-ocr.ps1
#
# What it does (each step is skipped when already done):
#   1. Downloads Ollama (zip, no installer, no tray app) into C:\ollama
#   2. Downloads the vision model (~6 GB) into C:\ollama\models
#   3. Builds FicheOcr into C:\gndj-ocr\tool
#   4. Locks C:\gndj-ocr to Administrators + SYSTEM (the results are medical data)
#   5. Registers an OPTIONAL night task "GNDJ-FicheOcr" (23:00-06:00), DISABLED: runs are on demand with
#      run-ocr.ps1 (-ListUnits, -Unit C1, -Trial 20)
#
# Ollama only listens on 127.0.0.1 (never on the network); nothing is opened in the firewall or IIS.
# Everything here is ASCII on purpose (Windows PowerShell 5.1 reads non-BOM scripts as ANSI).

[CmdletBinding()]
param(
    [string]$OllamaDir = 'C:\ollama',
    [string]$OutDir = 'C:\gndj-ocr',
    [string]$Model = 'qwen2.5vl:7b',
    [string]$OllamaZipUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',
    [string]$OllamaZip = '',          # a zip already downloaded by hand (skips the download)
    [string]$StartAt = '23:00',
    [switch]$EnableNightly            # enable the night task right away (normally: after the trial)
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on PS 5.1

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$modelsDir = Join-Path $OllamaDir 'models'
$toolDir = Join-Path $OutDir 'tool'
$ollamaExe = Join-Path $OllamaDir 'ollama.exe'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this script in an elevated (Administrator) PowerShell.' }

# ---- 1. Ollama ----
if (-not (Test-Path $ollamaExe)) {
    New-Item -ItemType Directory -Force $OllamaDir | Out-Null
    $zip = $OllamaZip
    if (-not $zip) {
        $zip = Join-Path $env:TEMP 'ollama-windows-amd64.zip'
        Write-Host "Downloading Ollama from $OllamaZipUrl ..."
        Invoke-WebRequest -Uri $OllamaZipUrl -OutFile $zip -UseBasicParsing
    }
    Write-Host "Extracting Ollama into $OllamaDir ..."
    Expand-Archive -Path $zip -DestinationPath $OllamaDir -Force
    if (-not (Test-Path $ollamaExe)) { throw "ollama.exe not found in $OllamaDir after extracting." }
} else {
    Write-Host "Ollama already in $OllamaDir"
}

# Machine-wide settings so the night task (SYSTEM) finds the same models.
[Environment]::SetEnvironmentVariable('OLLAMA_MODELS', $modelsDir, 'Machine')
[Environment]::SetEnvironmentVariable('OLLAMA_HOST', '127.0.0.1:11434', 'Machine')
$env:OLLAMA_MODELS = $modelsDir
$env:OLLAMA_HOST = '127.0.0.1:11434'
New-Item -ItemType Directory -Force $modelsDir | Out-Null

# ---- 2. Model ----
. (Join-Path $PSScriptRoot 'ollama-common.ps1')
$started = Start-OllamaIfNeeded -OllamaExe $ollamaExe -ModelsDir $modelsDir
try {
    Write-Host "Downloading the model $Model (about 6 GB, resumes if interrupted) ..."
    & $ollamaExe pull $Model
    if ($LASTEXITCODE -ne 0) { throw "ollama pull $Model failed." }
    & $ollamaExe list
} finally {
    Stop-OllamaTree $started
}

# ---- 3. Build the tool ----
New-Item -ItemType Directory -Force $toolDir | Out-Null
Write-Host "Building FicheOcr into $toolDir ..."
& dotnet publish (Join-Path $repo 'tools\FicheOcr\FicheOcr.csproj') -c Release -o $toolDir --nologo
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }

# ---- 4. Lock the results folder (medical data) ----
New-Item -ItemType Directory -Force (Join-Path $OutDir 'logs') | Out-Null
& icacls $OutDir /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null
Write-Host "$OutDir is readable by Administrators and SYSTEM only."

# ---- 5. Night task ----
$runScript = Join-Path $PSScriptRoot 'run-ocr.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`" -OutDir `"$OutDir`" -OllamaDir `"$OllamaDir`" -Model $Model -Until 06:00 -Night"
$trigger = New-ScheduledTaskTrigger -Daily -At $StartAt
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 8) -Priority 7 `
    -MultipleInstances IgnoreNew -StartWhenAvailable:$false
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'GNDJ-FicheOcr' -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'GNDJ: offline reading of the scanned fiches medicales (night)' -Force | Out-Null
if ($EnableNightly) {
    Enable-ScheduledTask -TaskName 'GNDJ-FicheOcr' | Out-Null
    Write-Host "Night task GNDJ-FicheOcr registered and ENABLED ($StartAt)."
} else {
    Disable-ScheduledTask -TaskName 'GNDJ-FicheOcr' | Out-Null
    Write-Host "Optional night task GNDJ-FicheOcr registered but DISABLED: runs are on demand."
    Write-Host "  List the units: powershell -ExecutionPolicy Bypass -File deploy\ocr\run-ocr.ps1 -ListUnits"
    Write-Host "  Read one unit:  powershell -ExecutionPolicy Bypass -File deploy\ocr\run-ocr.ps1 -Unit C1"
    Write-Host "  Nightly runs:   Enable-ScheduledTask -TaskName GNDJ-FicheOcr"
}
