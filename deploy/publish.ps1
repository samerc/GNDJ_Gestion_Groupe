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

Write-Host "==> Friendly offline page + custom startup-error handling..." -ForegroundColor Cyan
# A small static "we'll be right back" page served by IIS when the app can't START (HTTP 500.30) — instead of
# the default ASP.NET Core diagnostic page, which leaks stack/config details. Lives at the site root (next to
# web.config); IIS serves it directly even while the app is down.
Copy-Item (Join-Path $PSScriptRoot "offline.html") (Join-Path $OutDir "offline.html") -Force

# PATCH the web.config that `dotnet publish` generated (rather than commit our own) so the ASP.NET Core Module's
# processPath/arguments stay exactly as generated — no risk of a wrong launch path. We only ADD two things:
#   (1) disableStartupErrorPage="true"  -> the module returns an empty 500.30 instead of its detailed page, so
#   (2) <httpErrors> can substitute our offline.html for the startup-failure status codes. existingResponse="Auto"
#       leaves the app's OWN error responses (their JSON body / errorId) untouched — only the body-less ANCM
#       startup failures get the friendly page.
$webConfigPath = Join-Path $OutDir "web.config"
if (-not (Test-Path $webConfigPath)) { throw "web.config not found in '$OutDir' after publish." }
[xml]$wc = Get-Content $webConfigPath
$ancm = $wc.SelectSingleNode("//aspNetCore")
if (-not $ancm) { throw "aspNetCore element not found in generated web.config." }
$ancm.SetAttribute("disableStartupErrorPage", "true")

$sw = $ancm.ParentNode   # the <system.webServer> containing <aspNetCore> (works whether or not it's inside <location>)
$existing = $sw.SelectSingleNode("httpErrors")
if ($existing) { $sw.RemoveChild($existing) | Out-Null }
$he = $wc.CreateElement("httpErrors")
$he.SetAttribute("errorMode", "Custom")
$he.SetAttribute("existingResponse", "Auto")
# In-process startup failures are 500.30-500.38; 502.5 is the out-of-process process-failure (safety net).
$codes = @(); foreach ($s in 30,31,32,33,34,35,36,37,38) { $codes += ,@(500,$s) }; $codes += ,@(502,5)
foreach ($c in $codes) {
  $rm = $wc.CreateElement("remove"); $rm.SetAttribute("statusCode", "$($c[0])"); $rm.SetAttribute("subStatusCode", "$($c[1])"); $he.AppendChild($rm) | Out-Null
  $er = $wc.CreateElement("error"); $er.SetAttribute("statusCode", "$($c[0])"); $er.SetAttribute("subStatusCode", "$($c[1])"); $er.SetAttribute("path", "offline.html"); $er.SetAttribute("responseMode", "File"); $he.AppendChild($er) | Out-Null
}
$sw.AppendChild($he) | Out-Null
$wc.Save($webConfigPath)
Write-Host "    offline.html + web.config custom errors applied." -ForegroundColor DarkGray

Write-Host "==> Done. Package ready in '$OutDir'." -ForegroundColor Green
Write-Host "    Next: ./deploy/deploy.ps1 -Source $OutDir -Target <site path>"
