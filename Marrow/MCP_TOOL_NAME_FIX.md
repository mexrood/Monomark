# MCP Tool Name Fix — dots not allowed

## Проблема

При подключении MCP-сервера Monomark в Claude Desktop появлялась ошибка:

```
tools.49.FrontendRemoteMcpToolDefinition.name: String should match pattern '^[a-zA-Z0-9_-]{1,64}$'
```

## Причина

MCP-инструменты в `electron/mcp/tools/index.ts` использовали точки в именах:

```
vault.list
vault.read
vault.write
vault.search
vault.create_folder
```

Паттерн `^[a-zA-Z0-9_-]{1,64}$` допускает только буквы, цифры, дефис и **подчёркивание**.
Точка (`.`) в этот паттерн **не входит** → MCP-клиент отклонял весь список инструментов.

## Решение

Заменили `.` на `_` во всех именах (файл `electron/mcp/tools/index.ts`):

| До            | После               |
|---------------|---------------------|
| `vault.list`  | `vault_list`        |
| `vault.read`  | `vault_read`        |
| `vault.write` | `vault_write`       |
| `vault.search`| `vault_search`      |
| `vault.create_folder` | `vault_create_folder` |

Изменение затронуло только строки `name:` и `wrapHandler(name, ...)` —
логика инструментов не менялась.

## Выпущено в v1.0.21
