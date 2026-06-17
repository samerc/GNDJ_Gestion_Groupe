<#
.SYNOPSIS
  Build + assemble a deployable package for GNDJ (API + React build) into .\publish.
.DESCRIPTION
  Run on a build machine (dev box or the server) that has the .NET SDK and Node.js.
  Produces .\publish containing the published API with the React build in wwwroot/.
  Then ship .\publish to the server with deploy.ps1 (see docs/DEPLOYMENT.md §13).
.EXAMPLE
  ./deploy/publish.ps1
#>
param(
  [string]$OutDir = "publish",
  [string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent      # repo root
Set-Location $root

Write-Host "==> Publishing API ($Configuration)..." -ForegroundColor Cyan
dotnet publish "src/GNDJ.Api/GNDJ.Api.csproj" -c $Configuration -o $OutDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

Write-Host "==> Building frontend..." -ForegroundColor Cyan
Push-Location client
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
Pop-Location

Write-Host "==> Copying SPA into wwwroot..." -ForegroundColor Cyan
$wwwroot = Join-Path $OutDir "wwwroot"
if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
New-Item -ItemType Directory -Force $wwwroot | Out-Null
Copy-Item "client/dist/*" $wwwroot -Recurse -Force

Write-Host "==> Done. Package ready in '$OutDir'." -ForegroundColor Green
Write-Host "    Next: ./deploy/deploy.ps1 -Source $OutDir -Target <site path>"
