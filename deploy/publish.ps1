<#
.SYNOPSIS
  Build + assemble a deployable package for GNDJ (API + React build) into .\publish.
.DESCRIPTION
  Run on a build machine (dev box or the server) that has the .NET SDK and Node.js.
  Produces .\publish containing the published API with the React build in wwwroot/.
  Then ship .\publish to the server with deploy.ps1 (see docs/DEPLOYMENT.md Part 9-10).
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
# --include=dev forces devDependencies even when NODE_ENV=production (or an npm production=true
# config) is set on the build/server box — TypeScript and Vite are devDeps and the build needs them,
# otherwise `npm run build` fails with "'tsc' is not recognized".
npm ci --include=dev
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
Pop-Location

Write-Host "==> Copying SPA into wwwroot..." -ForegroundColor Cyan
$wwwroot = Join-Path $OutDir "wwwroot"
if (Test-Path $wwwroot) { Remove-Item $wwwroot -Recurse -Force }
New-Item -ItemType Directory -Force $wwwroot | Out-Null
Copy-Item "client/dist/*" $wwwroot -Recurse -Force

# NOTE: a custom "offline" page for the 500.30 startup-failure case (via web.config <httpErrors> +
# disableStartupErrorPage) was tried and REVERTED 2026-08-16 — adding <httpErrors> to the generated web.config
# made IIS unable to parse it ("Unable to get required configuration section 'system.webServer/aspNetCore'"),
# taking prod down. It's too server-fragile to bake into every deploy. If revisited, do it as a ONE-TIME server
# step (unlock the section: `appcmd unlock config -section:system.webServer/httpErrors`) and test on prod in a
# maintenance window — never patch web.config from publish.ps1. deploy/offline.html is kept for that future use.

Write-Host "==> Done. Package ready in '$OutDir'." -ForegroundColor Green
Write-Host "    Next: ./deploy/deploy.ps1 -Source $OutDir -Target <site path>"
