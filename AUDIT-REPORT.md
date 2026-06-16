# Post-Tauri Audit Report — 2026-06-16

## 0. Build & Launch

| Проверка | Статус | Детали |
|----------|--------|--------|
| `cargo build` | ✅ | Компилируется чисто, 0 ошибок, 0 warnings |
| `vite build` | ✅ | 539ms, 2210 модулей. Warning: chunk >500 KB (index-DD0bh0Lk.js 1195 KB) |
| `tsc --noEmit` | ✅ | 0 ошибок |
| `npm run build:sidecar` | ✅ | sidecar.js 1.0 MB, 48ms |
| App launch (`npm run dev`) | ✅ | Окно открывается, sidebar с файлами, редактор работает |
| Sidecar spawn | ⚠️ | **Двойной спавн**: PID 15088 + PID 40064. Rust убивает старый перед новым, но это лишние ресурсы |
| DevTools warnings | ⚠️ | `[tiptap warn]: Duplicate extension names found: ['trailingNode']` (×2) |

**Причина двойного спавна**: `useAppStore.init()` вызывает `mcp.start()` (если `mcpEnabled` сохранён), а `setVaultPath` тоже вызывает `start_sidecar`. Оба срабатывают при старте → два спавна. Rust-код убивает предыдущий, так что утечки нет, но порт 7456 кратковременно занят дважды.

---

## 1. MCP Chain — приоритет

| Звено | Статус | Доказательство | Причина (если ❌) |
|-------|--------|----------------|-------------------|
| 1. Sidecar спавнится | ✅ | Rust log: `Sidecar started with PID 15088` | — |
| 2. Порт слушает | ✅ | `curl /health` → `200 {"status":"ok","vault":"C:\\Users\\Alex\\Documents\\Marrow"}` | — |
| 3. Auth token | ✅ | Без Bearer → `401 invalid_token`. С Bearer → проходит. Token из OS keychain → env var → sidecar | — |
| 4. MCP initialize | ✅ | `protocolVersion: "2025-03-26"`, sessionId выдаётся | — |
| 5. Tools перечисляются | ✅ | 11 tools: vault_list, vault_read, vault_write, vault_patch, vault_search, vault_create_folder, vault_summarize_file, vault_search_blocks, vault_find_related, vault_get_block, vault_smart_context | — |
| 6. vault_list | ✅ | 8 папок в корне vault | — |
| 7. vault_read | ✅ | `Tasks/To Do.md` → 23 bytes, block IDs присутствуют | — |
| 8. vault_search (keyword) | ✅ | Ответ без ошибки (0 results для "test" — ожидаемо, нет такого слова) | — |
| 9. vault_search_blocks (semantic) | ❌ | `"Memory index is not ready yet"` | **initDb() не вызывается в sidecar** |
| 10. vault_find_related | ❌ | Зависит от БД → тот же сбой | initDb() |
| 11. vault_get_block | ❌ | Зависит от БД → тот же сбой | initDb() |
| 12. vault_smart_context | ⚠️ | Не падает (graceful fallback), но `distilled: false, blocks: 0` — бесполезный ответ | Индекс пуст |
| 13. vault_write / vault_patch | ✅ | Не тестировал (деструктивно), но код не зависит от БД | — |
| 14. Vault path доходит | ✅ | Health → `vault: C:\Users\Alex\Documents\Marrow`, store-shim читает из env | — |

### Главный вывод: MCP **рвётся на звене 9** — semantic search / embeddings

**Корневая причина**: `sidecar-core/blocks/db.ts:initDb()` вызывается ТОЛЬКО через Electron IPC handler `vault:setVaultPath` в `sidecar-core/ipc/vault.ts:126`. В sidecar-режиме нет Electron IPC → `initDb()` никогда не вызывается → `rawDb === null` → `isDbReady()` всегда false → semantic tools отказывают.

**Предлагаемый фикс (НЕ применён)**: добавить вызов `initDb(VAULT_PATH)` в `src-tauri/sidecar/index.ts` при старте, сразу после HTTP-сервера. Также запустить `startIndexing(VAULT_PATH)` для заполнения embeddings.

---

## 2. Token Savings — приоритет

| Звено | Статус | Доказательство | Причина (если ❌) |
|-------|--------|----------------|-------------------|
| 1. Distillation-путь существует | ✅ | `sidecar-core/mcp/tools/smart-context.ts` — полностью реализован (semantic search → local LLM distillation → ~250 tokens вместо тысяч) | — |
| 2. `_tokens` tracking | ✅ | `wrapHandler` в `tools/index.ts:38-84` считает `tokens_read`, `tokens_returned`, `tokens_saved` | — |
| 3. `mcp_activity` schema | ✅ | Таблица определена в `blocks/db.ts:75-85` с INSERT/SELECT функциями | — |
| 4. `insertMcpActivity` вызывается | ❌ | Формально вызывается (`tools/index.ts:58`), но `rawDb === null` → функция тихо возвращается (`if (!rawDb) return`) → **ничего не пишется** | initDb() не вызывается |
| 5. `emitActivity` → фронтенд | ❌ | `BrowserWindow.getAllWindows()` в electron-shim возвращает `[]` → событие `mcp:activity` отправляется в **0 окон** | Shim не знает о Tauri windows |
| 6. Frontend stats | ❌ | `tauri-stub.ts:141-143` **захардкожены**: `getStatsToday → { tokensSaved: 0, filesRead: 0, callCount: 0 }`, `getStreak → 0`. Данные из sidecar не запрашиваются | Stub не подключён к реальным данным |

### Главный вывод: экономия **код есть, но цепочка разорвана в 3 местах**

1. БД не инициализируется → activity не пишется (звено 4)
2. BrowserWindow shim → фронтенд не получает events (звено 5)
3. Frontend stats захардкожены на нули → UI всегда показывает 0 (звено 6)

**Предлагаемый фикс (НЕ применён)**:
- Звено 4: то же, что MCP — вызвать `initDb()` при старте sidecar
- Звено 5: заменить `emitActivity` на HTTP endpoint (sidecar → frontend polling) или убрать (не нужно для stats)
- Звено 6: добавить HTTP endpoints `/stats/today`, `/stats/lifetime`, `/streak` в sidecar HTTP-сервер + вызывать их из `tauri-stub.ts` вместо захардкоженных нулей

---

## 3. Core Smoke Test

| Фича | Статус | Как проверено |
|------|--------|---------------|
| Vault: список файлов | ✅ | Sidebar показывает 8 корневых папок, файлы внутри Tasks/ раскрываются |
| Vault: открытие файла | ✅ | Клик на "June W2" → контент загрузился, task-чекбоксы отображаются |
| Editor: ввод текста | ✅ | Placeholder "Start writing, or type / for commands..." виден, клавиатура работает |
| Editor: task checkboxes | ✅ | Чекбоксы рендерятся корректно, strikethrough на завершённых |
| Search (Cmd+K) | ✅ | Палитра открывается, "yield" → 6 результатов с правильными сниппетами |
| Window controls | ✅ | Min/max/close видны, стилизованы |
| MCP status dot | ✅ | Зелёная точка в правом нижнем углу |
| Titlebar | ✅ | Breadcrumb "Tasks / June W2" отображается корректно |
| Sidebar toggle | ✅ | Иконка переключения видна |
| File watcher | ⚠️ | Rust `start_watcher` зарегистрирован, но ручная проверка не проводилась |
| Autosave | ⚠️ | Требует ручной проверки: изменить текст → проверить файл на диске |
| Theme switching | ⚠️ | Settings UI существует (`SettingsView.tsx`), но не тестировалось |
| Preview window | ⚠️ | Rust-код реализован (`window.rs:49`), но не тестировалось (нужен внешний файл) |
| Create/Rename/Delete | ⚠️ | Код в Rust-командах, но не тестировалось (деструктивно) |

---

## Сводка: что сломано, по серьёзности

### 1. [CRITICAL] Semantic search не работает
- **Что**: `vault_search_blocks`, `vault_find_related`, `vault_get_block` возвращают ошибку "Memory index is not ready"
- **Причина**: `initDb()` не вызывается в sidecar index.ts
- **Фикс**: Добавить `await initDb(VAULT_PATH)` + `startIndexing(VAULT_PATH)` при старте в `src-tauri/sidecar/index.ts`
- **Файлы**: `src-tauri/sidecar/index.ts`, `sidecar-core/blocks/db.ts`, `sidecar-core/blocks/indexer.ts`

### 2. [HIGH] Token savings pipeline полностью неактивен
- **Что**: mcp_activity не пишется, stats в UI = 0, events не доходят до фронтенда
- **Причина**: 3 разрыва цепочки (см. секцию 2)
- **Фикс**: initDb + HTTP stats endpoints + убрать захардкоженные нули в tauri-stub
- **Файлы**: `src-tauri/sidecar/index.ts`, `sidecar-core/mcp/tools/index.ts`, `src/lib/tauri-stub.ts`

### 3. [MEDIUM] Двойной спавн sidecar при старте
- **Что**: Sidecar запускается дважды (init + setVaultPath)
- **Причина**: `useAppStore.init()` и `setVaultPath` оба вызывают `start_sidecar`
- **Фикс**: Дедупликация — не вызывать `start_sidecar` из `setVaultPath` если уже запущен, или объединить в одну точку запуска
- **Файлы**: `src/lib/tauri-stub.ts`, `src/store/useAppStore.ts`

### 4. [LOW] Tiptap duplicate extension warning
- **Что**: `[tiptap warn]: Duplicate extension names found: ['trailingNode']` (×2)
- **Причина**: `trailingNode` extension зарегистрирован дважды
- **Фикс**: Найти и убрать дубль
- **Файлы**: Tiptap editor config

---

## Инструменты

- `node scripts/mcp-healthcheck.mjs` — прозванивает всю MCP-цепочку (порт → auth → tools → каждый tool), exit 0 если всё зелёное
- `scripts/token-savings-check.mjs` — **не создан** (stats endpoints ещё не существуют, нечего зондировать; создать после фикса звена 6)
