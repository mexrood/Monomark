use tauri::{AppHandle, Manager};

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
