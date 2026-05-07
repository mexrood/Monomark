# Marrow — notes for Claude Code

## ⚠️ Progressive blur in topbar — DO NOT change this structure

**Files:** `src/App.module.css` + `src/App.tsx`

This is the **visual signature** of the app. The design is fixed and must not
be simplified, collapsed, or replaced. See `Marrow/MARROW_FIX_BLUR_PROMPT_1.md`
and `Marrow/MARROW_FIX_BLUR_DEBUG.md` for full context.

### Correct structure (currently in place)

4 blur layers + gradient overlay, all direct children of `.navBlur`:

```tsx
<div className={styles.navBlur}>
  <div className={styles.blurLayer1} />
  <div className={styles.blurLayer2} />
  <div className={styles.blurLayer3} />
  <div className={styles.blurLayer4} />
  <div className={styles.gradientOverlay} />
</div>
```

Each `.blurLayerN` has **both** `backdrop-filter` and `mask-image` on the same
element. This is intentional — it works correctly in Electron/Chromium as long
as no ancestor has `transform`, `will-change`, `filter`, or `contain`.

The `.navBlur > div` rule in the CSS positions ALL direct children (including
`gradientOverlay`) as `position: absolute; inset: 0`. This line is mandatory —
without it `gradientOverlay` collapses to zero height and the top fade vanishes.

### What was tried and failed

| Attempt | Why it failed |
|---|---|
| `blurMask` wrapper + `blurInner` child (mask on parent, blur on child) | `mask-image` on a **parent** also breaks `backdrop-filter` on children in Chromium |
| Single `blurBase` + `blurFade` gradient overlay (no mask at all) | Produces a flat uniform blur, not the progressive 4-layer effect |
| Missing `position: absolute` on `gradientOverlay` | Div collapses to zero height — top fade invisible, looks broken |
| GPU flags only (`CSSBackdropFilter`, `UseSkiaRenderer`, `enable-gpu-rasterization`) | Don't fix the root cause — `transparent: true` on the BrowserWindow switches compositor to per-pixel-alpha mode where `backdrop-filter` is silently disabled on Windows |
| `transparent: true` on BrowserWindow | **Root cause of blur not working in production.** Do NOT restore this. |

### Current approach (working)

- **`transparent: false`** on the main BrowserWindow — uses normal compositor mode where `backdrop-filter` works
- `backgroundColor` is read from `electron-store` key `'theme'` so the correct color (`#131313` dark / `#F0F0F0` light) is set at window creation — no flash
- **CSS:** `html, body { border-radius: 12px }` clips the content visually to rounded corners
- Windows 11 DWM automatically rounds frameless window corners natively
- The `.corners` overlay divs in React are harmless leftovers (no longer needed but kept)

### If blur breaks again

Do **not** change the CSS structure. Instead, find the ancestor causing it:

```bash
grep -rn "transform:\|will-change\|filter:\|contain:" src/ --include="*.css" | grep -v "backdrop-filter\|text-transform\|transition\|@keyframes"
```

Any ancestor of `.contentWrap` with `transform`, `will-change`, `filter`, or
`contain` will silently disable `backdrop-filter`. Remove it.
Use the `::before` debug snippet in `MARROW_FIX_BLUR_DEBUG.md` to verify
backdrop-filter is working at all before touching anything else.

---

## MCP server

- Runs locally at `http://127.0.0.1:7456/mcp`
- Config for Claude Code: `.mcp.json` in project root (already committed)
- Pre-approved via `enabledMcpjsonServers` in `.claude/settings.local.json`
- MCP status is managed by a **single global listener** in `useAppStore.init()`.
  `McpPanel.tsx` must NOT register its own `onStatusChange` — it would kill
  the global listener on unmount and break the indicator dot.

---

## External file preview — separate window

External files (dropped or opened outside the vault) open in a **dedicated
preview BrowserWindow**, not in the main window. This eliminates the
"hide-to-tray → reopen = stuck in external view forever" loop.

### Architecture

- `src/store/useVaultStore.ts` → `openDocument()`: if `isInsideVault` is false
  **and** `window.marrow.preview` exists, calls `preview.open(path, content)`
  instead of writing to the store. The main window state never changes.
- `electron/main.ts`: `preview:open` IPC creates (or reuses) a `previewWindow`.
  Sends `preview:load` with `{ filePath, content }` to that window.
- `electron/preload.ts`: exposes `window.marrow.preview` namespace with
  `open`, `close`, `onLoad`, `offLoad`.
- `src/main.tsx`: detects `?preview=1` in the URL and renders `<PreviewApp />`
  instead of the normal `<App />`.
- `src/PreviewApp.tsx`: standalone reader UI — subscribes to `preview:load`,
  shows the markdown via `ExternalView`, has a footer with Save / Dismiss.

### Window IPC fix (multi-window)

`window:minimize`, `window:maximize`, `window:close`, `window:isMaximized`
handlers in `main.ts` now use `BrowserWindow.fromWebContents(event.sender)`
instead of the hardcoded `mainWindow` reference. This lets the preview window
use the same controls. The `window:close` handler still hides only `mainWindow`
and destroys any other window.

### Do not revert
- Do not move external files back into the main window's vault store state.
  That was the source of the infinite loop and the "страшный" preview UX.
- In the preview window `window.marrow.preview` is still defined; clicking a
  relative `.md` link re-uses the same preview window (the IPC handler checks
  `previewWindow && !isDestroyed()` before creating a new one).

---

## Auto-save / file watcher race condition

`src/utils/autoSaveGuard.ts` — shared `Set<string>` of paths being written.
`useAutoSave.ts` adds to the set before writing, removes after 1500ms.
`useFileWatcher.ts` checks the set and skips the "file changed externally"
dialog for our own writes.
Do not remove this guard or the sync-error dialog will reappear on every save.
