<#
  Runs the GNDJ end-to-end smoke tests against the LOCAL dev app. Run it before every deploy.
    1. API checks     (python tests/e2e/api_smoke.py)   - needs the API on :5000
    2. Browser checks (node tests/e2e/ui_smoke.mjs)     - needs the API + the frontend on :5173 + Microsoft Edge
    3. First-load size budget (node tests/e2e/bundle_budget.mjs) - builds the frontend into a temp folder
  Exit code 0 = everything passed. -ApiOnly skips the browser part; -Unit also runs the .NET unit tests first
  (stop the API before -Unit: the test build needs the DLLs it locks); -SkipBundle skips the size budget.
  (ASCII only: Windows PowerShell 5.1.)
#>
param([switch]$ApiOnly, [switch]$Unit, [switch]$SkipBundle)
$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
$root = Resolve-Path (Join-Path $here "..\..")
$failed = @()

if ($Unit) {
    Write-Host "== .NET unit tests" -ForegroundColor Cyan
    & dotnet test (Join-Path $root "GNDJ.slnx")
    if ($LASTEXITCODE -ne 0) { $failed += "unit tests" }
}

Write-Host "== API smoke tests" -ForegroundColor Cyan
$env:PYTHONIOENCODING = "utf-8"
& python (Join-Path $here "api_smoke.py")
if ($LASTEXITCODE -ne 0) { $failed += "API checks" }

if (-not $ApiOnly) {
    Write-Host "== Browser smoke tests" -ForegroundColor Cyan
    if (-not (Test-Path (Join-Path $here "node_modules\playwright-core"))) {
        Push-Location $here; & npm install --silent; Pop-Location
    }
    Push-Location $here
    & node (Join-Path $here "ui_smoke.mjs")
    if ($LASTEXITCODE -ne 0) { $failed += "browser checks" }
    Pop-Location
}

if (-not $SkipBundle) {
    Write-Host "== First-load size budget" -ForegroundColor Cyan
    & node (Join-Path $here "bundle_budget.mjs")
    if ($LASTEXITCODE -ne 0) { $failed += "size budget" }
}

if ($failed.Count -eq 0) { Write-Host "`nALL SMOKE TESTS PASSED - OK to deploy." -ForegroundColor Green; exit 0 }
Write-Host "`nFAILED: $($failed -join ', ') - fix before deploying." -ForegroundColor Red
exit 1
