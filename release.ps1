# Release a new version of Monomark.
# Usage:  .\release.ps1 [-Bump patch|minor|major] [-Notes "Release notes"]
#
# Steps: bumps version, builds, commits, pushes, creates GitHub release.
param(
    [ValidateSet('patch','minor','major')]
    [string]$Bump = 'patch',
    [string]$Notes = ''
)

# NOTE: do NOT set $ErrorActionPreference = 'Stop' here. PowerShell wraps
# native stderr (npm warnings, git progress) as ErrorRecords, which Stop
# would treat as terminating errors and kill the script mid-build.

$env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\gh\bin"
$env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_TOKEN','User')

# Bump version
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$old = $pkg.version
$parts = $old.Split('.') | ForEach-Object { [int]$_ }
switch ($Bump) {
  'patch' { $parts[2]++ }
  'minor' { $parts[1]++; $parts[2]=0 }
  'major' { $parts[0]++; $parts[1]=0; $parts[2]=0 }
}
$new = "$($parts[0]).$($parts[1]).$($parts[2])"
Write-Host "Version: $old -> $new" -ForegroundColor Cyan

(Get-Content package.json) -replace "`"version`": `"$old`"", "`"version`": `"$new`"" | Set-Content package.json

# Build (don't redirect stderr — npm warnings to stderr would bork the script)
Write-Host "`nBuilding..." -ForegroundColor Cyan
& npm run build:x64
# Note: don't trust npm/electron-builder exit codes blindly — they sometimes
# return non-zero on success (PowerShell's NativeCommandError quirk with stderr).
# Verify by polling for the artifact file with a small grace window for any
# residual file-system caching after electron-builder writes it.
$expected = "release\Monomark-Setup-$new-x64.exe"
# electron-builder runs many serial steps after npm exits: NSIS compile,
# 4× signtool calls (signs main exe, elevate.exe, uninstaller, installer),
# block map generation. On this machine that takes ~15-25s after npm returns.
# Poll for up to 90s before giving up.
$tries = 0
while (-not (Test-Path $expected) -and $tries -lt 90) {
    Start-Sleep -Seconds 1
    $tries++
}
if (-not (Test-Path $expected)) {
    Write-Host "Build failed - $expected not found after 90s" -ForegroundColor Red
    exit 1
}
Write-Host "Build artifact ready after $tries`s wait." -ForegroundColor DarkGray

# Commit + push
Write-Host "`nCommit + push..." -ForegroundColor Cyan
& git add -A
& git commit -m "v$new"
& git push origin main

# Release on GitHub
# Build the args as an array and splat — backtick line-continuation occasionally
# mangles long arg lists for gh.exe under PowerShell, returning exit -536870873
# without creating the release. Splatting is reliable.
Write-Host "`nCreating GitHub release v$new..." -ForegroundColor Cyan
if (-not $Notes) { $Notes = "v$new" }

$ghArgs = @(
  'release', 'create', "v$new",
  "release\Monomark-Setup-$new-x64.exe",
  "release\Monomark-Setup-$new-x64.exe.blockmap",
  "release\Monomark-$new-win.zip",
  "release\latest.yml",
  '--title', "v$new",
  '--notes', $Notes
)
& gh @ghArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDone! Installed Monomark will detect v$new within ~60s of next start." -ForegroundColor Green
} else {
    Write-Host "`nRelease failed with exit code $LASTEXITCODE" -ForegroundColor Red
    Write-Host "Verify on GitHub: gh release view v$new --repo mexrood/Monomark" -ForegroundColor Yellow
    exit $LASTEXITCODE
}
