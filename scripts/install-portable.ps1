#Requires -Version 5.1
<#
.SYNOPSIS
    Installs the Monomark portable ZIP build as if it were a proper installation.
    Use this when the NSIS installer is blocked by antivirus (CrowdStrike, etc.).

.DESCRIPTION
    1. Copies the win-unpacked directory to %LOCALAPPDATA%\Programs\Monomark
    2. Creates a desktop shortcut
    3. Creates a Start Menu shortcut
    4. Registers .md file association (optional, prompts)

.PARAMETER Source
    Path to the win-unpacked directory. Defaults to the folder next to this script.

.PARAMETER InstallDir
    Target directory. Defaults to %LOCALAPPDATA%\Programs\Monomark.

.EXAMPLE
    .\install-portable.ps1
    .\install-portable.ps1 -Source "C:\Downloads\win-unpacked" -InstallDir "$env:LOCALAPPDATA\Programs\Monomark"
#>

param(
    [string]$Source = "",
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\Monomark"
)

$ErrorActionPreference = 'Stop'

# ── Resolve source directory ──────────────────────────────────────────────────
if (-not $Source) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
    # When distributed with the ZIP, the script is next to win-unpacked
    $candidates = @(
        (Join-Path $scriptDir 'win-unpacked'),
        (Join-Path (Split-Path -Parent $scriptDir) 'win-unpacked'),
        $scriptDir   # script itself might be inside win-unpacked
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c 'Monomark.exe')) { $Source = $c; break }
    }
    if (-not $Source) {
        Write-Error "Cannot locate Monomark.exe. Run with -Source pointing to the win-unpacked folder."
        exit 1
    }
}

$exePath = Join-Path $InstallDir 'Monomark.exe'

Write-Host ""
Write-Host "Monomark Portable Installer" -ForegroundColor Cyan
Write-Host "  Source : $Source"
Write-Host "  Target : $InstallDir"
Write-Host ""

# ── Copy files ───────────────────────────────────────────────────────────────
Write-Host "Copying files..." -NoNewline
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
Copy-Item -Path "$Source\*" -Destination $InstallDir -Recurse -Force
Write-Host " done." -ForegroundColor Green

# ── Desktop shortcut ─────────────────────────────────────────────────────────
Write-Host "Creating desktop shortcut..." -NoNewline
$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$lnk = $wsh.CreateShortcut((Join-Path $desktop 'Monomark.lnk'))
$lnk.TargetPath       = $exePath
$lnk.WorkingDirectory = $InstallDir
$lnk.Description      = 'Monomark — markdown knowledge base'
$lnk.IconLocation     = "$exePath,0"
$lnk.Save()
Write-Host " done." -ForegroundColor Green

# ── Start Menu shortcut ───────────────────────────────────────────────────────
Write-Host "Creating Start Menu shortcut..." -NoNewline
$startMenu = Join-Path ([System.Environment]::GetFolderPath('StartMenu')) 'Programs\Monomark'
if (-not (Test-Path $startMenu)) { New-Item -ItemType Directory -Path $startMenu -Force | Out-Null }
$lnk2 = $wsh.CreateShortcut((Join-Path $startMenu 'Monomark.lnk'))
$lnk2.TargetPath       = $exePath
$lnk2.WorkingDirectory = $InstallDir
$lnk2.Description      = 'Monomark — markdown knowledge base'
$lnk2.IconLocation     = "$exePath,0"
$lnk2.Save()
Write-Host " done." -ForegroundColor Green

# ── Optional: Add Defender exclusion ─────────────────────────────────────────
Write-Host ""
Write-Host "Adding Windows Defender exclusion for install directory..." -NoNewline
try {
    Add-MpPreference -ExclusionPath $InstallDir -ExclusionProcess $exePath -ErrorAction Stop
    Write-Host " done." -ForegroundColor Green
} catch {
    Write-Host " skipped (run as admin to enable)." -ForegroundColor Yellow
}

# ── Optional: .md file association ───────────────────────────────────────────
Write-Host ""
$assoc = Read-Host "Register Monomark as default app for .md files? [y/N]"
if ($assoc -match '^[Yy]') {
    $regRoot = 'HKCU:\SOFTWARE\Classes'
    # ProgID
    $progId = 'Monomark.md'
    New-Item -Path "$regRoot\$progId"                        -Force | Out-Null
    Set-ItemProperty "$regRoot\$progId"         '(Default)' 'Markdown Document'
    New-Item -Path "$regRoot\$progId\DefaultIcon"            -Force | Out-Null
    Set-ItemProperty "$regRoot\$progId\DefaultIcon" '(Default)' "$exePath,0"
    New-Item -Path "$regRoot\$progId\shell\open\command"     -Force | Out-Null
    Set-ItemProperty "$regRoot\$progId\shell\open\command" '(Default)' "`"$exePath`" `"%1`""
    # Extension association
    New-Item -Path "$regRoot\.md"                            -Force | Out-Null
    Set-ItemProperty "$regRoot\.md"             '(Default)' $progId
    # Notify shell
    $null = [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
    [System.Windows.Forms.MessageBox]::Show(
        "Monomark is now the default app for .md files.`nYou may need to refresh the desktop.",
        'Monomark', 'OK', 'Information') | Out-Null
    Write-Host ".md association registered." -ForegroundColor Green
}

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Cyan
Write-Host "Launch Monomark from your desktop or Start Menu."
Write-Host ""
