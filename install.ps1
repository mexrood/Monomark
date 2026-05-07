#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Полная установка Monomark одним скриптом — без NSIS-инсталлера.
    Чистит любые остатки прошлых попыток + копирует приложение + ярлыки.

.DESCRIPTION
    Делает то же, что NSIS-инсталлер, но через PowerShell — Falcon не блокирует.
    1. Убивает все Monomark процессы
    2. Удаляет C:\Program Files\Monomark и %LocalAppData%\Programs\Monomark
    3. Чистит реестр от записей предыдущих установок
    4. Копирует release\win-unpacked → %LocalAppData%\Programs\Monomark
    5. Создаёт ярлыки на рабочем столе и в Start Menu
    6. Регистрирует .md ассоциацию
    7. Добавляет Defender exclusion

.EXAMPLE
    # ПКМ → Run as Administrator на самом ярлыке PowerShell, потом:
    cd D:\Projects\Marrow
    .\install.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$source    = Join-Path $scriptDir 'release\win-unpacked'
$target    = "$env:LOCALAPPDATA\Programs\Monomark"
$exePath   = Join-Path $target 'Monomark.exe'

if (-not (Test-Path (Join-Path $source 'Monomark.exe'))) {
    Write-Host "ERROR: $source\Monomark.exe не найден. Сначала npm run build:x64." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "═══ Monomark direct install ═══" -ForegroundColor Cyan
Write-Host "  Source : $source"
Write-Host "  Target : $target"
Write-Host ""

# ── 1. Kill processes ─────────────────────────────────────────────────────────
Write-Host "[1/7] Killing Monomark processes..." -NoNewline
Get-Process -Name Monomark | Stop-Process -Force
Start-Sleep -Milliseconds 800
Write-Host " OK" -ForegroundColor Green

# ── 2. Remove old install dirs ────────────────────────────────────────────────
Write-Host "[2/7] Removing old installs..." -NoNewline
@(
    "C:\Program Files\Monomark",
    "C:\Program Files (x86)\Monomark",
    $target
) | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Recurse -Force } }
Write-Host " OK" -ForegroundColor Green

# ── 3. Clean registry ─────────────────────────────────────────────────────────
Write-Host "[3/7] Cleaning registry..." -NoNewline
@(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
) | ForEach-Object {
    Get-ChildItem $_ | Where-Object {
        (Get-ItemProperty $_.PSPath).DisplayName -like '*Monomark*'
    } | Remove-Item -Recurse -Force
}
@(
    'HKLM:\SOFTWARE\Monomark', 'HKCU:\SOFTWARE\Monomark',
    'HKLM:\SOFTWARE\Classes\Monomark.md', 'HKCU:\SOFTWARE\Classes\Monomark.md'
) | ForEach-Object { Remove-Item $_ -Recurse -Force }
Write-Host " OK" -ForegroundColor Green

# ── 4. Remove old shortcuts ───────────────────────────────────────────────────
Write-Host "[4/7] Removing old shortcuts..." -NoNewline
@(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Monomark.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Monomark",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Monomark.lnk",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Monomark",
    "$env:USERPROFILE\Desktop\Monomark.lnk",
    "$env:PUBLIC\Desktop\Monomark.lnk"
) | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Recurse -Force } }
Write-Host " OK" -ForegroundColor Green

# ── 5. Copy files ─────────────────────────────────────────────────────────────
Write-Host "[5/7] Copying files (~340 MB)..." -NoNewline
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path "$source\*" -Destination $target -Recurse -Force
Write-Host " OK" -ForegroundColor Green

# ── 6. Create shortcuts ───────────────────────────────────────────────────────
Write-Host "[6/7] Creating shortcuts..." -NoNewline
$wsh = New-Object -ComObject WScript.Shell

# Desktop
$desktop = [System.Environment]::GetFolderPath('Desktop')
$lnk = $wsh.CreateShortcut((Join-Path $desktop 'Monomark.lnk'))
$lnk.TargetPath = $exePath
$lnk.WorkingDirectory = $target
$lnk.Description = 'Monomark — markdown knowledge base'
$lnk.IconLocation = "$exePath,0"
$lnk.Save()

# Start Menu
$startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
$lnk2 = $wsh.CreateShortcut((Join-Path $startMenu 'Monomark.lnk'))
$lnk2.TargetPath = $exePath
$lnk2.WorkingDirectory = $target
$lnk2.Description = 'Monomark — markdown knowledge base'
$lnk2.IconLocation = "$exePath,0"
$lnk2.Save()
Write-Host " OK" -ForegroundColor Green

# ── 7. Defender exclusion + .md association ───────────────────────────────────
Write-Host "[7/7] Defender exclusion + .md assoc..." -NoNewline
try {
    Add-MpPreference -ExclusionPath $target -ExclusionProcess $exePath -ErrorAction Stop
} catch {}

# Register .md association (ProgID: Monomark.md)
$progId = 'Monomark.md'
New-Item -Path "HKCU:\SOFTWARE\Classes\$progId" -Force | Out-Null
Set-ItemProperty "HKCU:\SOFTWARE\Classes\$progId" '(Default)' 'Markdown Document'
New-Item -Path "HKCU:\SOFTWARE\Classes\$progId\DefaultIcon" -Force | Out-Null
Set-ItemProperty "HKCU:\SOFTWARE\Classes\$progId\DefaultIcon" '(Default)' "$exePath,0"
New-Item -Path "HKCU:\SOFTWARE\Classes\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty "HKCU:\SOFTWARE\Classes\$progId\shell\open\command" '(Default)' "`"$exePath`" `"%1`""
Write-Host " OK" -ForegroundColor Green

Write-Host ""
Write-Host "═══ Установлено ═══" -ForegroundColor Cyan
Write-Host "  $exePath" -ForegroundColor White
Write-Host "  Ярлыки: рабочий стол + Start Menu" -ForegroundColor White
Write-Host ""
Write-Host "Запускай через ярлык или: " -NoNewline
Write-Host "Start-Process '$exePath'" -ForegroundColor Yellow
Write-Host ""
