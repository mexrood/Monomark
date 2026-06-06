use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use std::process;

use crate::error::AppError;

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    win.minimize().map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
pub fn toggle_maximize(app: AppHandle) -> Result<(), AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    if win.is_maximized().unwrap_or(false) {
        win.unmaximize()
            .map_err(|e| AppError::from(e.to_string()))?;
    } else {
        win.maximize().map_err(|e| AppError::from(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    win.hide().map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
pub fn is_maximized(app: AppHandle) -> Result<bool, AppError> {
    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    win.is_maximized()
        .map_err(|e| AppError::from(e.to_string()))
}

// ── Preview window ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_preview(app: AppHandle, file_path: String, content: String) -> Result<(), AppError> {
    // Reuse existing preview window or create a new one
    let preview = if let Some(win) = app.get_webview_window("preview") {
        win
    } else {
        WebviewWindowBuilder::new(
            &app,
            "preview",
            WebviewUrl::App("index.html?preview=1".into()),
        )
        .title("Preview — Monomark")
        .inner_size(900.0, 700.0)
        .min_inner_size(500.0, 400.0)
        .decorations(false)
        .center()
        .build()
        .map_err(|e| AppError::from(e.to_string()))?
    };

    // Send file data to the preview window's frontend
    preview
        .emit(
            "preview:load",
            serde_json::json!({ "filePath": file_path, "content": content }),
        )
        .map_err(|e| AppError::from(e.to_string()))?;

    preview.show().map_err(|e| AppError::from(e.to_string()))?;
    preview
        .set_focus()
        .map_err(|e| AppError::from(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub fn close_preview(app: AppHandle) -> Result<(), AppError> {
    if let Some(win) = app.get_webview_window("preview") {
        win.destroy().map_err(|e| AppError::from(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), AppError> {
    // Kill the MCP sidecar first — app.exit / process::exit skip Drop, so
    // without this the child `node` process is orphaned and holds port 7456.
    super::sidecar::kill_sidecar(&app);
    app.exit(0);
    // Fallback in case exit doesn't terminate immediately.
    process::exit(0);
}

/// Open a file in the main window from the preview window (after "Save to Vault")
#[tauri::command]
pub fn preview_open_in_main(app: AppHandle, file_path: String) -> Result<(), AppError> {
    if let Some(main_win) = app.get_webview_window("main") {
        main_win
            .emit("vault:open-file", &file_path)
            .map_err(|e| AppError::from(e.to_string()))?;
        main_win.show().map_err(|e| AppError::from(e.to_string()))?;
        main_win
            .set_focus()
            .map_err(|e| AppError::from(e.to_string()))?;
    }
    // Close preview after opening in main
    if let Some(preview) = app.get_webview_window("preview") {
        let _ = preview.destroy();
    }
    Ok(())
}
