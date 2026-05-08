---
name: monomark-release
description: Manage Monomark Electron app releases — bump version, build, push to GitHub, trigger auto-updates, install locally, check status. Trigger when the user asks to ship/release/publish a new version, push to live, update, reinstall, check release status, or anything related to the Monomark deployment pipeline.
---

# Monomark Release Pipeline

This skill encodes the full release/auto-update workflow for the Monomark Electron app. Use it whenever the user wants to ship a version, check what's deployed, install locally, or diagnose updater issues.

## Trigger phrases (RU + EN)

The user may say any of these — all map to operations below.

**Release a new version:**
- «запусти обновления», «запуш в лайв», «зарелизи», «сделай релиз», «выкати», «новая версия»
- "release", "ship it", "push to live", "publish update", "deploy", "cut a release"
- Optionally with bump type: «минорный релиз», "minor bump", «мажорный», "major"
- Optionally with notes: «релизни с коммитом 'fix X'», "release with notes ..."

**Install latest build locally (without going through GitHub):**
- «обнови у меня», «переустанови», «накати последнюю», «поставь свежее»
- "upgrade me", "install locally", "give me the latest"

**Check release status:**
- «что в релизах», «покажи последние версии», «какая на GitHub», «статус»
- "what's released", "show releases", "current version", "latest on github"

**Verify auto-update is working:**
- «проверь updater», «глянь почему не приходит», «лог апдейтера»
- "check updater", "why no update dialog", "updater log"

**Trigger auto-update test:**
- «сделай чтоб я посмотрел», «проверим что обновление приходит»
- "make it so I can see", "test the update flow end-to-end"

## Project state (constants)

- **Repo:** `mexrood/Monomark` (PRIVATE on GitHub)
- **Branch:** `main`
- **Release output:** `D:\Projects\Marrow\release\`
- **Installed at:** `%LOCALAPPDATA%\Programs\Monomark\`
- **Updater log:** `%APPDATA%\Monomark\logs\main.log`
- **Downloaded updates pending:** `%LOCALAPPDATA%\monomark-updater\pending\`
- **GH_TOKEN:** stored in User env vars (set via `[Environment]::SetEnvironmentVariable('GH_TOKEN',$t,'User')`)
- **gh CLI:** `$env:LOCALAPPDATA\Programs\gh\bin\gh.exe` (not in default PATH for new sessions until shell restart)

## Operations

### 1. Release new version (the main one)

The repo has a one-shot script at `D:\Projects\Marrow\release.ps1`. Use it:

```powershell
cd D:\Projects\Marrow
.\release.ps1                          # patch bump (default)
.\release.ps1 -Bump minor              # minor bump
.\release.ps1 -Bump major              # major bump
.\release.ps1 -Notes "fix X, add Y"    # custom release notes
```

The script: bumps `package.json` version → `npm run build:x64` → commits → pushes to `main` → `gh release create` with all 4 assets (`*.exe`, `*.exe.blockmap`, `*.zip`, `latest.yml`).

After release, the running Monomark detects the new version within ~60s of next start.

**If `release.ps1` is missing**, fall back to manual steps (see ## Manual release recipe below).

### 2. Install latest build locally (no admin, no NSIS)

User-space upgrade — kills running Monomark, copies fresh `release/win-unpacked` over installed dir. Script: `D:\Projects\Marrow\upgrade-now.ps1`.

```powershell
powershell -ExecutionPolicy Bypass -File D:\Projects\Marrow\upgrade-now.ps1
```

This bypasses the NSIS installer entirely (which CrowdStrike on this machine kills silently) and avoids needing admin rights. Use it when:
- The user wants to test a build before releasing
- They need to upgrade their local install to match latest source
- A new build is in `release/win-unpacked` but hasn't been released yet

### 3. Check what's installed vs what's on GitHub

```powershell
# Installed
"Installed: $((Get-Item "$env:LOCALAPPDATA\Programs\Monomark\Monomark.exe").VersionInfo.ProductVersion)"
Get-Content "$env:LOCALAPPDATA\Programs\Monomark\resources\app-update.yml"

# Latest on GitHub
$env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\gh\bin"
gh release list --repo mexrood/Monomark --limit 5
```

### 4. Read updater log

```powershell
Get-Content "$env:APPDATA\Monomark\logs\main.log" -Tail 50
```

Look for:
- `GH_TOKEN present: true` → token reached the process
- `Found version X.Y.Z` → updater detected new release  
- `Update for version X is not available` → installed already == latest
- `404` or `releases.atom` → auth/private repo issue (check `private: true` in `app-update.yml`)
- `HttpError 401/403` → token invalid or scope insufficient

### 5. Trigger auto-update dialog (full E2E test)

Bump + release a new version, then restart Monomark:
```powershell
$env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_TOKEN','User')
Get-Process Monomark -EA SilentlyContinue | Stop-Process -Force
Start-Sleep 2
& cmd /c start "" "$env:LOCALAPPDATA\Programs\Monomark\Monomark.exe"
# Wait ~15s, dialog should appear: "Update ready: vX.Y.Z — Restart now / Later"
```

## Critical gotchas (HARD-WON, do not deviate)

1. **GH_TOKEN env inheritance.** When launching Monomark from PowerShell, the User env var `GH_TOKEN` is NOT automatically in the current shell session — only in NEW shells started after it was set. ALWAYS pull it explicitly before launching:
   ```powershell
   $env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_TOKEN','User')
   ```
   Then any process you spawn inherits it. Without this, the updater hits private repo as anonymous → 404.

2. **Launching Monomark.exe from PowerShell tooling.** `Start-Process` with `-RedirectStandardOutput` causes Electron to crash immediately (exit code -536870873) because it doesn't tolerate redirected stdio. Use `cmd /c start "" "path\Monomark.exe"` instead — that's the equivalent of double-clicking from Explorer.

3. **artifactName must NOT contain spaces.** GitHub silently renames spaces → dots in uploaded assets, but `latest.yml` uses hyphens. Mismatch → 404 on update download. Current `electron-builder.yml` has `artifactName: "${productName}-Setup-${version}-${arch}.exe"` — keep it that way.

4. **Private repo needs `private: true` in publish config.** Without it, electron-updater uses the public `releases.atom` RSS feed (which 404s on private repos AND ignores the auth header). Already set in `electron-builder.yml`.

5. **gh CLI is NOT in default PATH.** It's at `$env:LOCALAPPDATA\Programs\gh\bin`. Always prepend to PATH before invoking:
   ```powershell
   $env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\gh\bin"
   ```

6. **gh.exe stdout via PowerShell tool sometimes returns empty.** When that happens, fall back to running gh through Bash tool — `export PATH="/c/Users/Alex/AppData/Local/Programs/gh/bin:$PATH"` works reliably.

7. **PowerShell here-string `@'...'@` cannot be passed via `-Command`.** Always use `-File` with a `.ps1` file for multi-line scripts.

8. **NSIS must use `oneClick: true` for auto-updates.** `oneClick: false` shows the full installer wizard on every auto-update — annoying UX. With `oneClick: true`, "Restart now" → app closes → installer runs silently → new version starts. This is what every Electron app with auto-update does. **Do NOT switch back to `oneClick: false`** unless you're abandoning auto-updates. Path selection is sacrificed but always installs to `%LocalAppData%\Programs\Monomark` which is correct.

9. **GitHub publish timing race.** `release.ps1` finishes the moment `gh release create` returns, but the running Monomark may have done its update check seconds before the release became visible. Always wait ~30s after release.ps1 completes before restarting Monomark to test the auto-update.

## Manual release recipe (if release.ps1 is missing)

```powershell
cd D:\Projects\Marrow
$env:Path = "$env:Path;$env:LOCALAPPDATA\Programs\gh\bin"
$env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_TOKEN','User')

# 1. Bump (replace 1.0.X with current+1)
(Get-Content package.json) -replace '"version": "1.0.6"', '"version": "1.0.7"' | Set-Content package.json

# 2. Build (~30s)
npm run build:x64

# 3. Commit + push
git add -A
git commit -m "v1.0.7"
git push origin main

# 4. Release
gh release create v1.0.7 `
  "release\Monomark-Setup-1.0.7-x64.exe" `
  "release\Monomark-Setup-1.0.7-x64.exe.blockmap" `
  "release\Monomark-1.0.7-win.zip" `
  "release\latest.yml" `
  --title "v1.0.7" --notes "what's new"
```

## Future: when repo moves to TM-Storage org

When the user transfers `mexrood/Monomark` → `TM-Storage/Monomark` on GitHub:
1. Update `electron-builder.yml`: `owner: TM-Storage`
2. Bump version, release as usual
3. GitHub auto-redirects old URLs, so installed clients on `mexrood/Monomark` will continue receiving updates until they're upgraded once. After that, they hit `TM-Storage/Monomark` directly.

## Files relevant to this skill

- `D:\Projects\Marrow\release.ps1` — release pipeline
- `D:\Projects\Marrow\upgrade-now.ps1` — local install without admin
- `D:\Projects\Marrow\install.ps1` — full clean install (admin required)
- `D:\Projects\Marrow\electron-builder.yml` — publish config (owner, repo, private, artifactName)
- `D:\Projects\Marrow\electron\updater.ts` — auto-updater code with electron-log
- `D:\Projects\Marrow\package.json` — version (bumped each release)
