# Minimal upgrade — no admin needed (overwrites user-space files)
$source = "D:\Projects\Marrow\release\win-unpacked"
$target = "$env:LOCALAPPDATA\Programs\Monomark"

Write-Host "Killing Monomark..." -ForegroundColor Cyan
Get-Process Monomark -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Wait for files to unlock
$exe = Join-Path $target "Monomark.exe"
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

Write-Host "Copying v1.0.1 files..." -ForegroundColor Cyan
Copy-Item -Path "$source\*" -Destination $target -Recurse -Force

Write-Host ""
Write-Host "Verifying app-update.yml:" -ForegroundColor Yellow
Get-Content "$target\resources\app-update.yml"

Write-Host ""
Write-Host "Installed version:" -ForegroundColor Yellow
(Get-Item "$target\Monomark.exe").VersionInfo.ProductVersion

Write-Host ""
Write-Host "Starting Monomark v1.0.1..." -ForegroundColor Green
Start-Process "$target\Monomark.exe"
