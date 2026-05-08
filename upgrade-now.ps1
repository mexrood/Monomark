# Quick local upgrade — no admin, no NSIS.
# Kills running Monomark, copies fresh release/win-unpacked over installed dir, restarts.
# Useful for testing builds before releasing OR when CrowdStrike blocks the NSIS installer.

$source = "D:\Projects\Marrow\release\win-unpacked"
$target = "$env:LOCALAPPDATA\Programs\Monomark"

if (-not (Test-Path "$source\Monomark.exe")) {
    Write-Host "ERROR: $source\Monomark.exe not found. Run 'npm run build:x64' first." -ForegroundColor Red
    exit 1
}

$srcVer = (Get-Item "$source\Monomark.exe").VersionInfo.ProductVersion
$dstVer = if (Test-Path "$target\Monomark.exe") {
    (Get-Item "$target\Monomark.exe").VersionInfo.ProductVersion
} else { "(none)" }

Write-Host "Source : v$srcVer  ($source)" -ForegroundColor Cyan
Write-Host "Target : v$dstVer  ($target)" -ForegroundColor Cyan

Write-Host ""
Write-Host "Killing Monomark..." -NoNewline
Get-Process Monomark -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Wait for files to unlock (AV may briefly hold them)
$exe = Join-Path $target "Monomark.exe"
if (Test-Path $exe) {
    $tries = 0
    while ($tries -lt 10) {
        try {
            $stream = [System.IO.File]::Open($exe, "Open", "Write", "None")
            $stream.Close()
            break
        } catch {
            Start-Sleep -Milliseconds 500
            $tries++
        }
    }
}
Write-Host " OK" -ForegroundColor Green

Write-Host "Copying v$srcVer files..." -NoNewline
if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
Copy-Item -Path "$source\*" -Destination $target -Recurse -Force
Write-Host " OK" -ForegroundColor Green

Write-Host ""
Write-Host "Installed version: $((Get-Item "$target\Monomark.exe").VersionInfo.ProductVersion)" -ForegroundColor Yellow

# Pull GH_TOKEN into current session so the spawned Monomark inherits it
$env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_TOKEN','User')

Write-Host "Starting Monomark v$srcVer..." -ForegroundColor Green
& cmd /c start "" "$target\Monomark.exe"
