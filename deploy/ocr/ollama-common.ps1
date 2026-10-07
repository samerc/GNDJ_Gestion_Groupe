# Shared helpers for the fiche reader scripts (dot-sourced). ASCII only.

# Starts "ollama serve" (localhost only, one model, one request at a time, below-normal priority) unless an
# Ollama is already answering. Returns the started process, or $null when one was already running.
function Start-OllamaIfNeeded {
    param([string]$OllamaExe, [string]$ModelsDir)

    if (Test-OllamaUp) { return $null }

    $env:OLLAMA_HOST = '127.0.0.1:11434'
    $env:OLLAMA_MODELS = $ModelsDir
    $env:OLLAMA_NUM_PARALLEL = '1'
    $env:OLLAMA_MAX_LOADED_MODELS = '1'
    $env:OLLAMA_KEEP_ALIVE = '10m'

    $p = Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden -PassThru
    try { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal } catch { }

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if (Test-OllamaUp) { return $p }
    }
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw 'Ollama did not start within 60 seconds.'
}

function Test-OllamaUp {
    try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/version' -UseBasicParsing -TimeoutSec 3 | Out-Null
        return $true
    } catch { return $false }
}

# The model runner is a child process ("ollama.exe runner" / llama server); stop it with the server.
function Stop-OllamaTree {
    param($Process)
    if (-not $Process) { return }
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $($Process.Id)" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
}
