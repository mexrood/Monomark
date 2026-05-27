use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;

const STORE_FILE: &str = "settings.json";

#[tauri::command]
pub fn get_setting(app: AppHandle, key: String) -> Result<Value, AppError> {
    let store = app.store(STORE_FILE)?;
    Ok(store.get(&key).unwrap_or(Value::Null))
}

#[tauri::command]
pub fn set_setting(app: AppHandle, key: String, value: Value) -> Result<(), AppError> {
    let store = app.store(STORE_FILE)?;
    store.set(&key, value);
    Ok(())
}

#[tauri::command]
pub fn get_all_settings(app: AppHandle) -> Result<Value, AppError> {
    let store = app.store(STORE_FILE)?;
    let entries = store.entries();
    let map: serde_json::Map<String, Value> = entries.into_iter().collect();
    Ok(Value::Object(map))
}
