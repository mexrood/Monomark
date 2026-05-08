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
$tries = 0
while (-not (Test-Path $expected) -and $tries -lt 8) {
    Start-Sleep -Seconds 1
    $tries++
}
if (-not (Test-Path $expected)) {
    Write-Host "Build failed - $expected not found after 8s" -ForegroundColor Red
    exit 1
}

# Commit + push
Write-Host "`nCommit + push..." -ForegroundColor Cyan
& git add -A
& git commit -m "v$new"
& git push origin main

# Release on GitHub
Write-Host "`nCreating GitHub release v$new..." -ForegroundColor Cyan
if (-not $Notes) { $Notes = "v$new" }
& gh release create "v$new" `
  "release\Monomark-Setup-$new-x64.exe" `
  "release\Monomark-Setup-$new-x64.exe.blockmap" `
  "release\Monomark-$new-win.zip" `
  "release\latest.yml" `
  --title "v$new" --notes $Notes

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDone! Installed Monomark will detect v$new within ~60s of next start." -ForegroundColor Green
} else {
    Write-Host "`nRelease failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
