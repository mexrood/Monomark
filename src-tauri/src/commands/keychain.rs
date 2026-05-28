use tauri::AppHandle;

use crate::error::AppError;

const SERVICE: &str = "app.marrow.monomark";

/// Store a secret in the OS keychain (Windows Credential Manager / macOS Keychain).
#[tauri::command]
pub fn store_secret(key: String, value: String) -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(|e| AppError::from(e.to_string()))?;
    entry
        .set_password(&value)
        .map_err(|e| AppError::from(e.to_string()))
}

/// Retrieve a secret from the OS keychain. Returns null if not found.
#[tauri::command]
pub fn get_secret(key: String) -> Result<Option<String>, AppError> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(|e| AppError::from(e.to_string()))?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::from(e.to_string())),
    }
}

/// Delete a secret from the OS keychain. No-op if not found.
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), AppError> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(|e| AppError::from(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e.to_string())),
    }
}

/// Migrate MCP token from settings.json to keychain (one-time, on startup).
/// Returns the token (from keychain if migrated, or generates new one).
pub fn ensure_mcp_token_in_keychain(app: &AppHandle) -> String {
    use tauri_plugin_store::StoreExt;

    let keychain_key = "mcpToken";

    // 1. Check if token already in keychain
    if let Ok(entry) = keyring::Entry::new(SERVICE, keychain_key) {
        if let Ok(token) = entry.get_password() {
            if !token.is_empty() {
                return token;
            }
        }
    }

    // 2. Check if token exists in settings.json (legacy location)
    let legacy_token = app
        .store("settings.json")
        .ok()
        .and_then(|store| match store.get("mcpToken") {
            Some(serde_json::Value::String(s)) if !s.is_empty() => Some(s),
            _ => None,
        });

    if let Some(token) = legacy_token {
        // Migrate to keychain
        if let Ok(entry) = keyring::Entry::new(SERVICE, keychain_key) {
            let _ = entry.set_password(&token);
        }
        // Remove from settings.json
        if let Ok(store) = app.store("settings.json") {
            store.delete("mcpToken");
        }
        log::info!("Migrated MCP token from settings.json to OS keychain");
        return token;
    }

    // 3. Generate new token and store in keychain
    let token = generate_token();
    if let Ok(entry) = keyring::Entry::new(SERVICE, keychain_key) {
        let _ = entry.set_password(&token);
    }
    log::info!("Generated new MCP token in OS keychain");
    token
}

/// Get MCP token from keychain (does NOT fall back to settings.json).
pub fn get_mcp_token() -> Option<String> {
    keyring::Entry::new(SERVICE, "mcpToken")
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
}

fn generate_token() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::SystemTime;

    let mut hasher = DefaultHasher::new();
    SystemTime::now().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    format!(
        "{:016x}{:016x}",
        hasher.finish(),
        hasher.finish().wrapping_mul(0x9E3779B97F4A7C15)
    )
}
