use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::error::AppError;

const STORE_FILE: &str = "settings.json";

pub struct SidecarState {
    child: Option<Child>,
    port: u16,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: None,
            port: 7456,
        }
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
        }
    }
}

fn get_store_value(app: &AppHandle, key: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    match store.get(key) {
        Some(serde_json::Value::String(s)) => Some(s),
        _ => None,
    }
}

/// Locate sidecar.js — checks multiple paths for dev vs production vs macOS bundle.
fn find_sidecar(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    let candidates = vec![
        // Production: next to the executable (Windows MSI, Linux AppImage)
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("sidecar.js"))),
        // Production: Tauri resource_dir (macOS .app bundle)
        app.path().resource_dir().ok().map(|d| d.join("sidecar.js")),
        // Dev (Tauri): cwd is src-tauri/
        std::env::current_dir()
            .ok()
            .map(|d| d.join("binaries").join("sidecar.js")),
        // Dev (from project root)
        std::env::current_dir()
            .ok()
            .map(|d| d.join("src-tauri").join("binaries").join("sidecar.js")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(AppError::from("sidecar.js not found"))
}

#[tauri::command]
pub fn start_sidecar(app: AppHandle) -> Result<serde_json::Value, AppError> {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().map_err(|e| AppError::from(e.to_string()))?;

    // Kill existing sidecar if running
    if let Some(ref mut child) = state.child {
        let _ = child.kill();
        let _ = child.wait();
    }
    state.child = None;

    let vault_path = get_store_value(&app, "vaultPath").unwrap_or_default();
    // Token is stored in OS keychain, not settings.json
    let token = super::keychain::get_mcp_token().unwrap_or_else(|| {
        super::keychain::ensure_mcp_token_in_keychain(&app)
    });

    let port = state.port;
    let sidecar_path = find_sidecar(&app)?;

    log::info!(
        "Starting sidecar: node {} (port={}, vault={})",
        sidecar_path.display(),
        port,
        vault_path
    );

    let mut cmd = Command::new("node");
    cmd.arg(&sidecar_path)
        .env("MONOMARK_VAULT_PATH", &vault_path)
        .env("MONOMARK_MCP_TOKEN", &token)
        .env("MONOMARK_PORT", port.to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Hide the console window on Windows (CREATE_NO_WINDOW = 0x08000000)
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let child = cmd
        .spawn()
        .map_err(|e| AppError::from(format!("Failed to spawn sidecar: {}", e)))?;

    log::info!("Sidecar started with PID {}", child.id());
    state.child = Some(child);

    Ok(serde_json::json!({
        "port": port,
        "token": token,
    }))
}

#[tauri::command]
pub fn stop_sidecar(app: AppHandle) -> Result<(), AppError> {
    kill_sidecar(&app);
    Ok(())
}

/// Synchronously kill the sidecar child (if any) and clear it. Safe to call
/// from quit handlers and the app exit event — must run *before* the process
/// terminates, since `process::exit` / `app.exit` skip `Drop` and would
/// otherwise orphan the `node` process (leaking port 7456).
pub fn kill_sidecar(app: &AppHandle) {
    let state = app.state::<Mutex<SidecarState>>();
    let mut guard = match state.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(ref mut child) = guard.child {
        log::info!("Stopping sidecar PID {}", child.id());
        let _ = child.kill();
        let _ = child.wait();
    }
    guard.child = None;
}

#[tauri::command]
pub fn sidecar_status(app: AppHandle) -> Result<serde_json::Value, AppError> {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().map_err(|e| AppError::from(e.to_string()))?;

    // Cross-platform process alive check: try_wait returns Ok(None) if still running
    let running = match state.child.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,     // Still running
            Ok(Some(_)) => false, // Exited
            Err(_) => false,      // Error checking — assume dead
        },
        None => false,
    };

    // Clean up dead child reference
    if !running {
        state.child = None;
    }

    // Token from OS keychain
    let token = super::keychain::get_mcp_token();

    Ok(serde_json::json!({
        "running": running,
        "port": state.port,
        "token": token,
    }))
}