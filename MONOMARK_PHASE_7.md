# MONOMARK — Phase 7: Polish

## 🚫 Жёсткие правила контекста (читай первым, выполняй всегда)

**НЕ читай:**
- Никакие spec/patch/phase файлы (`MARROW_*.md`, `MONOMARK_*.md`, `*_PHASE_*.md`).
- `node_modules`, `dist`, `dist-electron`, `package-lock.json`, `yarn.lock`.
- Файлы которые ты не будешь редактировать. Совсем.

**НЕ делай:**
- Не запускай `tree`, `ls -R`, `find`, `Glob` "чтобы понять структуру".
- Не делай `grep`/`rg` по всему проекту "на всякий случай". Если grep нужен — один с конкретной строкой, открыть найденное, всё.
- Не открывай `package.json` если задача не требует install/upgrade.
- Не читай файлы целиком если нужна одна функция — читай нужный диапазон.
- Если что-то непонятно — **спроси меня одной строкой**. Не ходи по проекту "на всякий случай". Стоимость спросить = 30 секунд, стоимость угадать неправильно = час работы вхолостую.

**Для каждой задачи указан точный список файлов.** Не выходи за него без необходимости. Если кажется что список неполон — спроси: "Для задачи N мне нужен ещё файл X, можно?".

---

## Задача 1 — Шрифт: Inter Display

### Файлы
- `src/globals.css` — где определены `--font-sans` и font-face declarations
- `index.html` (если шрифт линкуется оттуда)
- `package.json` (если используется npm package `@fontsource/...`)

### Действия

1. Скачать **Inter** family с https://rsms.me/inter/. Нужен variable font файл `InterVariable.woff2` (один файл покрывает все weights через `font-variation-settings`).

2. Положить в `src/assets/fonts/InterVariable.woff2` (или эквивалентную папку assets).

3. В `globals.css` заменить существующие `@font-face` для DM Sans на:

```css
@font-face {
  font-family: 'Inter';
  src: url('/src/assets/fonts/InterVariable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

4. Обновить CSS variable:
```css
:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  /* --font-mono остаётся как был (JetBrains Mono) */
}
```

5. **Включить Inter Display features** через CSS:
```css
body {
  font-family: var(--font-sans);
  font-feature-settings: 'cv11', 'ss01', 'ss03'; /* Inter Display-style alts */
  font-variation-settings: 'opsz' 28; /* Display optical size для крупных текстов */
}
```

   - `cv11` — alternate single-storey `a`
   - `ss01` — open digits
   - `ss03` — curved `f`, `t`, etc.

6. Headings — выставить optical size в Display range:
```css
h1, h2, h3, .cm-md-h1, .cm-md-h2, .cm-md-h3 {
  font-variation-settings: 'opsz' 32;
}
```

7. Body / inline текст — Text range:
```css
.prose p, .prose li, .cm-md-p, .cm-md-li,
.prose, .cm-content {
  font-variation-settings: 'opsz' 14;
}
```

Variable optical size делает Inter "Inter Display" на заголовках и "Inter Text" на body автоматически.

8. Удалить DM Sans файлы и font-face декларации.

### Acceptance
- [ ] Шрифт во всех местах приложения — Inter (с `opsz` Display на заголовках, Text на body).
- [ ] Нет fallback на system-ui кроме случаев когда Inter не загрузился.
- [ ] DM Sans файлы удалены из bundle, не зашиты больше.

---

## Задача 2 — TOC (Table of Contents) sidebar

### Что сейчас
Маленький TOC справа от документа (см. скриншоты пользователя — вертикальные полоски). Проблемы:
- Справа → конкурирует с правым text formatting flow
- Мелкий текст → плохо читается
- "Не отсюда" — стиль не интегрирован с остальным app

### Целевое
- TOC на **левой** стороне документа (между sidebar tree и контентом, либо как inset слева от текста).
- Текст того же размера как в Sidebar (~14px).
- Стилистически — те же tokens (typography, color, hover) что у sidebar tree items. Должен ощущаться частью app, не приклеенным элементом.

### Файлы
- Найти grep'ом `TOC\|TableOfContents\|outline` в `src/`. Скорее всего это `src/components/Document/TOC.tsx` или похожее.
- Соответствующий `.module.css`
- `src/components/Document/Document.tsx` — для layout (move TOC из right в left).

### Действия

1. **Layout shift:**
```css
.documentArea {
  display: grid;
  grid-template-columns: auto 1fr; /* TOC | content */
  gap: 24px;
}
.toc {
  width: 220px;
  position: sticky;
  top: 32px;
  align-self: start;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}
```

   Если документ не имеет TOC (пустой / без headings) — TOC column не рендерится, grid-template-columns становится `1fr`.

2. **Стилизация items** — копируй inspiration с Sidebar TreeNode:
```css
.tocItem {
  display: block;
  padding: 4px 12px;
  font-size: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 4px;
  transition: background 100ms ease, color 100ms ease;
  line-height: 1.5;
}
.tocItem:hover {
  background: var(--bg-elev-1);
  color: var(--text-primary);
}
.tocItem.active {
  color: var(--text-primary);
  font-weight: 500;
}
.tocItem.level-2 { padding-left: 24px; }
.tocItem.level-3 { padding-left: 36px; }
```

3. **Активное состояние** — текущий heading подсвечен в `--text-primary`. Реализуется через IntersectionObserver на headings.

4. **Section label сверху** TOC (опционально, в духе "VAULT" label у sidebar):
```tsx
<div className={styles.tocLabel}>On this page</div>
```
   Стиль: `font-size: 11px`, `text-transform: uppercase`, `letter-spacing: 0.06em`, `color: var(--text-tertiary)`, `padding: 4px 12px 8px`.

5. **Скрывать TOC** если в документе < 3 headings (нет смысла). Логика: при render считаем количество `<h1-h6>` (или markdown nodes ATXHeading*), если <3 — TOC не показываем.

### Acceptance
- [ ] TOC слева от документа.
- [ ] Шрифт ~14px, цвета через design tokens, hover идентичный sidebar items.
- [ ] Sticky при скролле документа.
- [ ] Активный item подсвечен.
- [ ] При <3 headings — TOC не отображается (нет пустого блока).

---

## Задача 3 — Search palette: top-anchored + Recent notes как default

### Текущая проблема
Search palette центрирован vertically → при наборе текста результаты появляются → palette меняет высоту → "прыгает" чтобы оставаться по центру. Это раздражает.

### Целевое
- Top-anchored: palette на фиксированных 100px от верха окна. Не прыгает при изменении высоты.
- Default state (пустой input): показывает 10-15 recent notes (последние modified).
- При вводе текста → recent заменяются на search results.

### Файлы
- `src/components/SearchPalette/SearchPalette.tsx`
- `src/components/SearchPalette/SearchPalette.module.css`
- `src/store/useSearchStore.ts` (для логики recent)
- `src/store/useVaultStore.ts` (нужен список всех файлов с mtime)

### Действия

1. **CSS — top anchor:**
```css
.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start; /* было center */
  padding-top: 100px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
}
.palette {
  width: 100%;
  max-width: 600px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: var(--bg-elev-2);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: var(--shadow-popover);
  overflow: hidden;
}
.input {
  padding: 14px 18px;
  font-size: 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  outline: none;
  color: var(--text-primary);
}
.results {
  overflow-y: auto;
  flex: 1;
}
```

2. **Recent notes** — получить из vault store. Если `useVaultStore` хранит file tree с mtime — отсортировать по mtime descending, взять top 15.

```tsx
const allFiles = useVaultStore(s => s.allFiles); // flat list
const recent = useMemo(() => 
  [...allFiles].sort((a, b) => b.mtime - a.mtime).slice(0, 15),
  [allFiles]
);
```

   Если такой методы нет — добавь computed selector в useVaultStore.

3. **Логика default vs search:**
```tsx
const query = useSearchStore(s => s.query);
const searchResults = useSearchStore(s => s.results); // от MiniSearch
const items = query.trim() === '' ? recent : searchResults;
const sectionLabel = query.trim() === '' ? 'Recent' : 'Results';
```

4. **UI:**
```tsx
<div className={styles.palette}>
  <div className={styles.inputWrap}>
    <Search size={16} strokeWidth={1.5} />
    <input ... />
  </div>
  <div className={styles.results}>
    <div className={styles.sectionLabel}>{sectionLabel}</div>
    {items.map((item, i) => (
      <button
        key={item.path}
        className={cx(styles.row, { [styles.active]: i === selectedIndex })}
        onClick={() => openFile(item.path)}
      >
        <FileText size={14} strokeWidth={1.5} />
        <span className={styles.title}>{item.title || item.name}</span>
        {query && <span className={styles.snippet}>{item.snippet}</span>}
      </button>
    ))}
  </div>
</div>
```

5. **Highlight matching letters** в title если query is present:
```tsx
function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return <>
    {text.slice(0, idx)}
    <strong>{text.slice(idx, idx + query.length)}</strong>
    {text.slice(idx + query.length)}
  </>;
}
```

6. **Keyboard:**
- `↑/↓` — навигация selectedIndex
- `Enter` — открыть выделенный
- `Esc` — закрыть palette (focus возвращается)

### Стилизация
```css
.sectionLabel {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  padding: 10px 18px 6px;
  font-weight: 500;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 14px;
  transition: background 100ms;
}
.row:hover,
.row.active {
  background: var(--bg-elev-3);
}
.title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.snippet {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}
```

### Acceptance
- [ ] Palette не прыгает при наборе текста (top-anchored).
- [ ] Открыл Cmd+K, пустой input → видит 15 recent files отсортированных по дате изменения.
- [ ] Начал печатать → recent заменились на search results, section label "Results".
- [ ] ↑/↓/Enter работают.
- [ ] Title матчей выделен жирным.

---

## Задача 4 — Settings: убрать вкладку About, влить в General

### Файлы
- `src/components/Settings/SettingsNav.tsx`
- `src/components/Settings/SettingsView.tsx` (если switch по табам там)
- `src/components/Settings/panels/GeneralPanel.tsx`
- `src/components/Settings/panels/AboutPanel.tsx` — удалить файл целиком после merge
- `src/store/useUIStore.ts` — убрать `'about'` из `SettingsTab` type если он там

### Действия

1. Из `AboutPanel.tsx` скопировать всю разметку (Version row, Updates row, License row).
2. В `GeneralPanel.tsx` после существующих опций (Theme, Vault folder) добавить:
```tsx
<div className={styles.sectionDivider} />
<div className={styles.sectionLabel}>About</div>
{/* Version row */}
{/* Updates row — см. задачу 5 ниже */}
{/* License row */}
```
3. Стиль `sectionLabel` — те же 11px uppercase tertiary что используешь везде для секций.
4. `sectionDivider` — 1px line `var(--border-subtle)`, margin 24px 0.
5. Удалить:
   - `panels/AboutPanel.tsx`
   - Запись `'about'` из `SettingsNav` tabs list
   - Case `'about'` из switch в SettingsView
   - `'about'` из union type `SettingsTab` в useUIStore

### Acceptance
- [ ] В Settings nav теперь только: General, Launch, Server (MCP). Без About.
- [ ] General panel внизу имеет блок "About" с Version, Updates, License.
- [ ] Файл AboutPanel.tsx удалён.

---

## Задача 5 — Inline update UX

### Что
Заменить простую кнопку "Check for updates" на полноценный stateful UI с явными состояниями: idle, checking, no-update, available, downloading, ready, installing, error.

### Файлы
- `electron/main.ts` — где инстанцируется `autoUpdater` (electron-updater)
- `electron/ipc/updater.ts` (создать если нет)
- `electron/preload.ts`
- `src/store/useAppStore.ts` — добавить updateStatus state
- `src/components/Settings/panels/GeneralPanel.tsx` — UI для Updates row
- `electron/tray.ts` — для tray notifications

### Действия

#### 5.1. Main process — события электрон-updater

В `electron/main.ts` или новом `electron/ipc/updater.ts`:

```ts
import { autoUpdater } from 'electron-updater';
import { ipcMain, BrowserWindow, Notification } from 'electron';

autoUpdater.autoDownload = false; // мы сами решаем когда скачивать
autoUpdater.autoInstallOnAppQuit = false; // не ставить молча

function broadcast(status: UpdateStatus) {
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('updater:status', status));
}

autoUpdater.on('checking-for-update', () => {
  broadcast({ kind: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  broadcast({
    kind: 'available',
    version: info.version,
    releaseNotes: info.releaseNotes || '',
    releaseDate: info.releaseDate
  });
});

autoUpdater.on('update-not-available', () => {
  broadcast({ kind: 'idle', lastChecked: Date.now() });
});

autoUpdater.on('download-progress', (progress) => {
  broadcast({
    kind: 'downloading',
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond
  });
});

autoUpdater.on('update-downloaded', (info) => {
  broadcast({ kind: 'ready', version: info.version });
  // OS notification если main window не focused
  if (Notification.isSupported()) {
    new Notification({
      title: 'Monomark update ready',
      body: `Version ${info.version} ready to install`
    }).show();
  }
});

autoUpdater.on('error', (err) => {
  broadcast({ kind: 'error', message: err.message });
});

// IPC handlers
ipcMain.handle('updater:checkForUpdates', async () => {
  return await autoUpdater.checkForUpdates();
});
ipcMain.handle('updater:downloadUpdate', async () => {
  return await autoUpdater.downloadUpdate();
});
ipcMain.handle('updater:quitAndInstall', () => {
  autoUpdater.quitAndInstall(true, true); // silent + force restart
});
```

#### 5.2. Preload

```ts
contextBridge.exposeInMainWorld('monomark', {
  // ...existing
  updater: {
    check: () => ipcRenderer.invoke('updater:checkForUpdates'),
    download: () => ipcRenderer.invoke('updater:downloadUpdate'),
    install: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatus: (cb) => {
      const listener = (_, status) => cb(status);
      ipcRenderer.on('updater:status', listener);
      return () => ipcRenderer.removeListener('updater:status', listener);
    }
  }
});
```

#### 5.3. Renderer state

В `useAppStore.ts`:

```ts
export type UpdateStatus =
  | { kind: 'idle'; lastChecked?: number }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; releaseNotes: string; releaseDate: string }
  | { kind: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { kind: 'ready'; version: string }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

interface AppStore {
  // ...existing
  updateStatus: UpdateStatus;
  setUpdateStatus: (s: UpdateStatus) => void;
}
```

В корневом `App.tsx` подписаться:
```tsx
useEffect(() => {
  return window.monomark.updater.onStatus((s) => {
    useAppStore.getState().setUpdateStatus(s);
  });
}, []);
```

#### 5.4. UI в GeneralPanel — Updates row

```tsx
function UpdatesRow() {
  const status = useAppStore(s => s.updateStatus);

  return (
    <div className={styles.row}>
      <div className={styles.rowLeft}>
        <div className={styles.rowTitle}>Updates</div>
        <div className={styles.rowDescription}>
          {renderStatusText(status)}
        </div>
        {status.kind === 'downloading' && (
          <div className={styles.progress}>
            <div className={styles.progressBar} style={{ width: `${status.percent}%` }} />
          </div>
        )}
        {status.kind === 'available' && (
          <details className={styles.releaseNotes}>
            <summary>What's changed</summary>
            <div dangerouslySetInnerHTML={{ __html: status.releaseNotes }} />
          </details>
        )}
      </div>
      <div className={styles.rowRight}>
        {renderActionButton(status)}
      </div>
    </div>
  );
}

function renderStatusText(s: UpdateStatus): string {
  switch (s.kind) {
    case 'idle': return s.lastChecked
      ? `Last checked ${formatRelative(s.lastChecked)}`
      : 'Click to check';
    case 'checking': return 'Checking for updates...';
    case 'available': return `New version v${s.version} available`;
    case 'downloading': return `Downloading ${(s.transferred / 1024 / 1024).toFixed(1)} / ${(s.total / 1024 / 1024).toFixed(1)} MB`;
    case 'ready': return `v${s.version} ready to install`;
    case 'installing': return 'Installing... app will restart';
    case 'error': return s.message;
  }
}

function renderActionButton(s: UpdateStatus) {
  switch (s.kind) {
    case 'idle':
      return <button onClick={() => window.monomark.updater.check()}>Check for updates</button>;
    case 'checking':
      return <button disabled><Spinner /> Checking...</button>;
    case 'available':
      return <button onClick={() => window.monomark.updater.download()}>Download</button>;
    case 'downloading':
      return <button disabled>{Math.round(s.percent)}%</button>;
    case 'ready':
      return <button onClick={() => window.monomark.updater.install()}>Install and restart</button>;
    case 'installing':
      return <button disabled><Spinner /></button>;
    case 'error':
      return <button onClick={() => window.monomark.updater.check()}>Try again</button>;
  }
}
```

Стили progress:
```css
.progress {
  height: 4px;
  background: var(--bg-elev-1);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}
.progressBar {
  height: 100%;
  background: var(--accent);
  transition: width 200ms ease-out;
}
.releaseNotes {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
.releaseNotes summary {
  cursor: pointer;
  user-select: none;
}
```

#### 5.5. Tray feedback

В `electron/tray.ts`:

```ts
import { Tray, Menu, Notification, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { useAppStore } from '...'; // на стороне main нет zustand — придётся хранить локально

let lastUpdateStatus: UpdateStatus = { kind: 'idle' };

// Подписаться на updater events (если они уже emit'ятся в main) — здесь обновлять lastUpdateStatus и rebuilding tray menu

function buildMenu() {
  const checkLabel = (() => {
    switch (lastUpdateStatus.kind) {
      case 'checking': return 'Checking...';
      case 'available': return `Download v${lastUpdateStatus.version}`;
      case 'downloading': return `Downloading ${Math.round(lastUpdateStatus.percent)}%`;
      case 'ready': return `Install v${lastUpdateStatus.version}`;
      default: return 'Check for updates...';
    }
  })();

  return Menu.buildFromTemplate([
    { label: 'Open Monomark', click: () => { /* open window */ } },
    { type: 'separator' },
    {
      label: checkLabel,
      enabled: !['checking', 'downloading', 'installing'].includes(lastUpdateStatus.kind),
      click: async () => {
        if (lastUpdateStatus.kind === 'available') {
          await autoUpdater.downloadUpdate();
        } else if (lastUpdateStatus.kind === 'ready') {
          autoUpdater.quitAndInstall(true, true);
        } else {
          await autoUpdater.checkForUpdates();
          // Если no-update — небольшое notification
          if (lastUpdateStatus.kind === 'idle') {
            new Notification({
              title: 'Monomark',
              body: 'You\'re on the latest version'
            }).show();
          }
        }
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
}
```

После каждого изменения `lastUpdateStatus`:
```ts
tray.setContextMenu(buildMenu());
```

#### 5.6. Auto-check at startup

В main, после `app.whenReady()`:
```ts
setTimeout(() => {
  autoUpdater.checkForUpdates().catch(() => {});
}, 5000); // через 5 сек после старта, в фоне
```

Каждые 4 часа:
```ts
setInterval(() => {
  autoUpdater.checkForUpdates().catch(() => {});
}, 4 * 60 * 60 * 1000);
```

### Acceptance
- [ ] Settings → General → About → Updates показывает текущий status (one of 7 states).
- [ ] Click "Check for updates" → текст меняется на "Checking...", потом результат.
- [ ] При update available — кнопка "Download", прогресс-бар во время скачивания.
- [ ] После download — кнопка "Install and restart", при клике приложение тихо устанавливается и автоматически перезапускается на новой версии.
- [ ] Tray menu отражает тот же status (Check / Download v X / Install v X).
- [ ] Если из tray Check → нет update → OS notification "You're on the latest version".
- [ ] OS notification при готовности к installation.
- [ ] Auto-check через 5 сек после старта и каждые 4 часа в фоне.

### Подвох
Если приложение не code-signed валидным сертификатом, на Windows может всплыть UAC prompt при quitAndInstall(silent). Если ты ставишь в %AppData%/Local (per-user, не Program Files) — silent должен пройти без UAC. Проверь в `electron-builder.config` что `nsis.perMachine: false` и `oneClick: false` (oneClick может конфликтовать с silent install).

---

## Порядок работы

1. **Задача 1** (шрифт Inter) — изолировано, не зависит от других.
2. **Задача 4** (merge About → General) — простой refactor, нужен до задачи 5.
3. **Задача 5** (Update UX) — самая большая, делать после 4.
4. **Задача 3** (Search palette) — изолировано.
5. **Задача 2** (TOC) — изолировано.

Каждая задача — отдельный коммит.

## Что НЕ трогать

- Editor / livePreview / prose CSS — работает, не оптимизируй.
- Markdown rendering.
- MCP server / Sparks.
- Visual tokens (`--bg-elev-*`, `--text-*`, `--accent`) — не меняй значения.

## Что прислать после

- Скриншоты:
  - Документ с Inter Display (заголовок крупный, body мельче)
  - TOC слева от документа
  - Search palette: пустой input → Recent, с текстом → Results
  - Settings → General с merged About секцией
  - Update flow: available, downloading (с прогрессом), ready states
- Проверка:
  - Update install проходит silently без UAC
  - Приложение перезапускается на новой версии автоматически
