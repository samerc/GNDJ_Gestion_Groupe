<#
.SYNOPSIS
  Bump the app version and auto-generate the changelog from git history, then commit + tag (+ optional push).
.DESCRIPTION
  Run this ON THE DEV MACHINE, on a clean `main`, BEFORE deploying. It:
    1. Bumps client/package.json (npm semver: major|minor|patch).
    2. Collects the commit subjects since the previous version tag and writes them into
       client/src/data/changelog.json as the new release's notes (private "Journal des versions").
    3. Commits "chore(release): vX.Y.Z" and creates the git tag vX.Y.Z.
    4. With -Push, pushes the commit and the tag to origin.
  Then deploy normally (e.g. `./deploy/update.ps1 -Pull` on the server) — the build bakes the new
  version + commit + date into the bundle (vite.config.ts), so the footer shows the live version.
.EXAMPLE
  ./deploy/bump.ps1 -Type patch -Push
.EXAMPLE
  ./deploy/bump.ps1 -Type minor        # bump + commit + tag locally; push yourself later
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('major', 'minor', 'patch')][string]$Type,
  [switch]$Push
)
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$client = Join-Path $root 'client'
$changelog = Join-Path $client 'src/data/changelog.json'

# Refuse to run on a dirty tree — the release commit must contain only the bump, and npm/tags assume a clean state.
$dirty = git -C $root status --porcelain
if ($dirty) { throw "Working tree is not clean. Commit or stash your changes before bumping." }

# The previous version tag (vX.Y.Z). Used as the lower bound for 'what changed'. Empty on the very first bump.
$lastTag = (git -C $root tag --list 'v*' --sort=-v:refname | Select-Object -First 1)

# Bump package.json only (no git commit/tag from npm — we own those below).
Push-Location $client
try { npm version $Type --no-git-tag-version | Out-Null } finally { Pop-Location }
$version = (Get-Content (Join-Path $client 'package.json') -Raw | ConvertFrom-Json).version
$date = (Get-Date -Format 'yyyy-MM-dd')

# Commit subjects since the last tag (newest first), minus release commits. These become the release notes.
$range = if ($lastTag) { "$lastTag..HEAD" } else { 'HEAD' }
$subjects = git -C $root log $range --no-merges --pretty=format:'%s' |
  Where-Object { $_ -and ($_ -notmatch '^chore\(release\)') }

$tmp = New-TemporaryFile
try {
  ($subjects -join "`n") | Set-Content -Path $tmp -Encoding utf8
  node (Join-Path $PSScriptRoot 'bump.mjs') $version $date $tmp $changelog
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

# Stage the bump + changelog (package-lock only if it actually changed/exists) and make the release commit + tag.
$toAdd = @((Join-Path $client 'package.json'), $changelog)
$lock = Join-Path $client 'package-lock.json'
if (Test-Path $lock) { $toAdd += $lock }
git -C $root add $toAdd
git -C $root commit -m "chore(release): v$version" | Out-Null
git -C $root tag "v$version"

if ($Push) {
  git -C $root push
  git -C $root push origin "v$version"
}

Write-Host "==> Bumped to v$version ($($subjects.Count) change(s) recorded)." -ForegroundColor Green
if (-not $Push) { Write-Host "    Not pushed. Run: git push && git push origin v$version" -ForegroundColor Yellow }
