use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;

pub struct WatcherState {
    handle: Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self { handle: None }
    }
}

#[tauri::command]
pub fn start_watcher(app: AppHandle, vault_path: String) -> Result<(), AppError> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut state = state.lock().map_err(|e| AppError::from(e.to_string()))?;

    // Stop existing watcher
    state.handle = None;

    let app_handle = app.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(300), move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
        match events {
            Ok(events) => {
                let mut tree_changed = false;
                for event in &events {
                    if event.kind == DebouncedEventKind::Any {
                        let path_str = event.path.to_string_lossy().to_string();
                        let _ = app_handle.emit("vault:file-changed", &path_str);
                        tree_changed = true;
                    }
                }
                if tree_changed {
                    let _ = app_handle.emit("vault:tree-changed", ());
                }
            }
            Err(e) => {
                log::error!("Watcher error: {}", e);
            }
        }
    })
    .map_err(|e| AppError::from(e.to_string()))?;

    debouncer
        .watcher()
        .watch(
            &PathBuf::from(&vault_path),
            notify::RecursiveMode::Recursive,
        )
        .map_err(|e| AppError::from(e.to_string()))?;

    state.handle = Some(debouncer);
    log::info!("File watcher started for: {}", vault_path);
    Ok(())
}

#[tauri::command]
pub fn stop_watcher(app: AppHandle) -> Result<(), AppError> {
    let state = app.state::<Mutex<WatcherState>>();
    let mut state = state.lock().map_err(|e| AppError::from(e.to_string()))?;
    state.handle = None;
    log::info!("File watcher stopped");
    Ok(())
}
