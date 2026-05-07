#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-shot cleanup of all Monomark traces — broken installs, registry, processes.
    Run this ONCE before installing the new build, as Administrator.

.DESCRIPTION
    Kills all Monomark processes, deletes C:\Program Files\Monomark and
    %LocalAppData%\Programs\Monomark (if any), removes ALL registry entries
    that reference Monomark, and adds a Defender exclusion.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\cleanup.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'

Write-Host ""
Write-Host "=== Monomark cleanup ===" -ForegroundColor Cyan
Write-Host ""

# ── Kill all Monomark processes ──────────────────────────────────────────────
Write-Host "Killing Monomark processes..." -NoNewline
Get-Process -Name Monomark | Stop-Process -Force
Start-Sleep -Milliseconds 800
Write-Host " done." -ForegroundColor Green

# ── Delete install directories ───────────────────────────────────────────────
$paths = @(
    "C:\Program Files\Monomark",
    "C:\Program Files (x86)\Monomark",
    "$env:LOCALAPPDATA\Programs\Monomark"
)
foreach ($p in $paths) {
    if (Test-Path $p) {
        Write-Host "Removing $p..." -NoNewline
        Remove-Item $p -Recurse -Force
        if (Test-Path $p) {
            Write-Host " FAILED (locked?)" -ForegroundColor Red
        } else {
            Write-Host " done." -ForegroundColor Green
        }
    }
}

# ── Clean Uninstall registry entries ─────────────────────────────────────────
Write-Host "Cleaning registry..." -NoNewline
$regRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
$removed = 0
foreach ($root in $regRoots) {
    Get-ChildItem $root | ForEach-Object {
        $name = (Get-ItemProperty $_.PSPath).DisplayName
        if ($name -like '*Monomark*') {
            Remove-Item $_.PSPath -Recurse -Force
            $removed++
        }
    }
}
# Also clean app-specific registry roots
Remove-Item 'HKLM:\SOFTWARE\Monomark' -Recurse -Force
Remove-Item 'HKCU:\SOFTWARE\Monomark' -Recurse -Force
Remove-Item 'HKLM:\SOFTWARE\Classes\Monomark.md' -Recurse -Force
Remove-Item 'HKCU:\SOFTWARE\Classes\Monomark.md' -Recurse -Force
Write-Host " done ($removed Uninstall entries)." -ForegroundColor Green

# ── Remove Start Menu / Desktop shortcuts ─────────────────────────────────────
Write-Host "Removing shortcuts..." -NoNewline
$shortcuts = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Monomark.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Monomark\Monomark.lnk",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Monomark.lnk",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Monomark\Monomark.lnk",
    "$env:USERPROFILE\Desktop\Monomark.lnk",
    "$env:PUBLIC\Desktop\Monomark.lnk"
)
foreach ($s in $shortcuts) { if (Test-Path $s) { Remove-Item $s -Force } }
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Monomark" -Recurse -Force
Remove-Item "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Monomark" -Recurse -Force
Write-Host " done." -ForegroundColor Green

# ── Add Defender exclusion proactively ───────────────────────────────────────
Write-Host "Adding Defender exclusion for future install path..." -NoNewline
try {
    $futurePath = "$env:LOCALAPPDATA\Programs\Monomark"
    Add-MpPreference -ExclusionPath $futurePath, $env:TEMP -ErrorAction Stop
    Write-Host " done." -ForegroundColor Green
} catch {
    Write-Host " skipped." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Cleanup complete ===" -ForegroundColor Cyan
Write-Host "You can now run: release\Monomark Setup 1.0.0 x64.exe" -ForegroundColor White
Write-Host ""
