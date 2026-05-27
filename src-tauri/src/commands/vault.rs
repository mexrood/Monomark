use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;

const STORE_FILE: &str = "settings.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind")]
pub enum VaultNode {
    #[serde(rename = "file")]
    File {
        path: String,
        name: String,
        mtime: f64,
    },
    #[serde(rename = "folder")]
    Folder {
        path: String,
        name: String,
        children: Vec<VaultNode>,
    },
}

#[derive(Debug, Serialize)]
pub struct MoveResult {
    pub conflict: bool,
    #[serde(rename = "newPath")]
    pub new_path: String,
}

#[derive(Debug, Serialize)]
pub struct WriteBinaryResult {
    pub ok: bool,
    #[serde(rename = "relPath")]
    pub rel_path: String,
}

fn get_vault_path(app: &AppHandle) -> Result<Option<String>, AppError> {
    let store = app.store(STORE_FILE)?;
    match store.get("vaultPath") {
        Some(serde_json::Value::String(s)) => Ok(Some(s)),
        _ => Ok(None),
    }
}

fn validate_inside(base: &Path, target: &Path) -> Result<PathBuf, AppError> {
    let canon_base = std::fs::canonicalize(base).map_err(|e| AppError::from(e.to_string()))?;
    let canon_target = std::fs::canonicalize(target).map_err(|e| AppError::from(e.to_string()))?;
    if !canon_target.starts_with(&canon_base) {
        return Err(AppError::from("Path is outside vault"));
    }
    Ok(canon_target)
}

fn validate_parent_inside(base: &Path, target: &Path) -> Result<(), AppError> {
    let canon_base = std::fs::canonicalize(base).map_err(|e| AppError::from(e.to_string()))?;
    if let Some(parent) = target.parent() {
        if parent.exists() {
            let canon_parent =
                std::fs::canonicalize(parent).map_err(|e| AppError::from(e.to_string()))?;
            if !canon_parent.starts_with(&canon_base) {
                return Err(AppError::from("Path is outside vault"));
            }
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct FolderOrder {
    version: u32,
    order: Vec<String>,
}

async fn read_folder_order(dir: &Path) -> Option<Vec<String>> {
    let order_file = dir.join(".marrow-order.json");
    let raw = tokio::fs::read_to_string(&order_file).await.ok()?;
    let parsed: FolderOrder = serde_json::from_str(&raw).ok()?;
    if parsed.version == 1 {
        Some(parsed.order)
    } else {
        None
    }
}

async fn build_tree(dir: &Path) -> Vec<VaultNode> {
    let mut entries = match tokio::fs::read_dir(dir).await {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut nodes = Vec::new();

    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let full_path = entry.path();
        let ft = match entry.file_type().await {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if ft.is_dir() {
            if name.starts_with('_') {
                continue;
            }
            let children = Box::pin(build_tree(&full_path)).await;
            nodes.push(VaultNode::Folder {
                path: full_path.to_string_lossy().to_string(),
                name,
                children,
            });
        } else if ft.is_file() && name.ends_with(".md") {
            let mtime = tokio::fs::metadata(&full_path)
                .await
                .map(|m| {
                    m.modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs_f64() * 1000.0)
                        .unwrap_or(0.0)
                })
                .unwrap_or(0.0);
            nodes.push(VaultNode::File {
                path: full_path.to_string_lossy().to_string(),
                name,
                mtime,
            });
        }
    }

    let order_list = read_folder_order(dir).await;

    if let Some(order) = order_list {
        let mut by_name: std::collections::HashMap<String, VaultNode> =
            nodes.into_iter().map(|n| (node_name(&n).to_string(), n)).collect();
        let mut ordered = Vec::new();
        for name in &order {
            if let Some(node) = by_name.remove(name) {
                ordered.push(node);
            }
        }
        let mut remaining: Vec<VaultNode> = by_name.into_values().collect();
        remaining.sort_by(|a, b| node_name(a).cmp(node_name(b)));
        ordered.extend(remaining);
        ordered
    } else {
        nodes.sort_by(|a, b| {
            let a_is_folder = matches!(a, VaultNode::Folder { .. });
            let b_is_folder = matches!(b, VaultNode::Folder { .. });
            if a_is_folder != b_is_folder {
                return if a_is_folder {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                };
            }
            if !a_is_folder {
                let a_name = node_name(a);
                let b_name = node_name(b);
                if a_name == "CLAUDE.md" {
                    return std::cmp::Ordering::Less;
                }
                if b_name == "CLAUDE.md" {
                    return std::cmp::Ordering::Greater;
                }
                let a_mtime = node_mtime(a);
                let b_mtime = node_mtime(b);
                return b_mtime
                    .partial_cmp(&a_mtime)
                    .unwrap_or(std::cmp::Ordering::Equal);
            }
            node_name(a).cmp(node_name(b))
        });
        nodes
    }
}

fn node_name(n: &VaultNode) -> &str {
    match n {
        VaultNode::File { name, .. } => name,
        VaultNode::Folder { name, .. } => name,
    }
}

fn node_mtime(n: &VaultNode) -> f64 {
    match n {
        VaultNode::File { mtime, .. } => *mtime,
        VaultNode::Folder { .. } => 0.0,
    }
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn pick_vault_folder(app: AppHandle) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    log::info!("pick_vault_folder: opening dialog");
    let folder = app.dialog().file().set_title("Choose Vault Folder").blocking_pick_folder();
    log::info!("pick_vault_folder: result = {:?}", folder.as_ref().map(|p| p.to_string()));
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_file(app: AppHandle) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .set_title("Open File")
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("Text", &["txt"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn vault_get_path(app: AppHandle) -> Result<Option<String>, AppError> {
    get_vault_path(&app)
}

#[tauri::command]
pub async fn vault_set_path(app: AppHandle, path: String) -> Result<(), AppError> {
    let store = app.store(STORE_FILE)?;
    store.set("vaultPath", serde_json::Value::String(path));
    Ok(())
}

#[tauri::command]
pub async fn list_tree(app: AppHandle) -> Result<Vec<VaultNode>, AppError> {
    let vault_path = match get_vault_path(&app)? {
        Some(p) => p,
        None => return Ok(vec![]),
    };
    Ok(build_tree(Path::new(&vault_path)).await)
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, AppError> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), AppError> {
    if let Some(parent) = Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::from(e.to_string()))?;
    }
    tokio::fs::write(&path, &content)
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
pub async fn create_file(dir: String, name: String) -> Result<String, AppError> {
    let file_name = if name.ends_with(".md") {
        name
    } else {
        format!("{}.md", name)
    };
    let full_path = Path::new(&dir).join(&file_name);
    tokio::fs::write(&full_path, "")
        .await
        .map_err(|e| AppError::from(e.to_string()))?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn create_folder(dir: String, name: String) -> Result<String, AppError> {
    let full_path = Path::new(&dir).join(&name);
    tokio::fs::create_dir_all(&full_path)
        .await
        .map_err(|e| AppError::from(e.to_string()))?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_name: String) -> Result<String, AppError> {
    let old = Path::new(&old_path);
    let new_path = old
        .parent()
        .unwrap_or(Path::new(""))
        .join(&new_name);
    tokio::fs::rename(&old, &new_path)
        .await
        .map_err(|e| AppError::from(e.to_string()))?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), AppError> {
    let p = Path::new(&path);
    if p.is_dir() {
        tokio::fs::remove_dir_all(p)
            .await
            .map_err(|e| AppError::from(e.to_string()))?;
    } else {
        tokio::fs::remove_file(p)
            .await
            .map_err(|e| AppError::from(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, AppError> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub async fn is_inside_vault(app: AppHandle, path: String) -> Result<bool, AppError> {
    let vault_path = match get_vault_path(&app)? {
        Some(p) => p,
        None => return Ok(false),
    };
    let vault_abs = std::fs::canonicalize(&vault_path).unwrap_or_else(|_| PathBuf::from(&vault_path));
    let target_abs = std::fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    Ok(target_abs.starts_with(&vault_abs))
}

#[tauri::command]
pub async fn move_file(old_path: String, new_parent_dir: String) -> Result<MoveResult, AppError> {
    let name = Path::new(&old_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let new_path = Path::new(&new_parent_dir).join(&name);
    if new_path.exists() {
        return Ok(MoveResult {
            conflict: true,
            new_path: new_path.to_string_lossy().to_string(),
        });
    }
    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| AppError::from(e.to_string()))?;
    Ok(MoveResult {
        conflict: false,
        new_path: new_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn set_folder_order(
    folder_path: String,
    order: Vec<String>,
) -> Result<(), AppError> {
    let order_file = Path::new(&folder_path).join(".marrow-order.json");
    let data = FolderOrder { version: 1, order };
    let json = serde_json::to_string_pretty(&data).map_err(|e| AppError::from(e.to_string()))?;
    tokio::fs::write(&order_file, json)
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
pub async fn get_folder_order(folder_path: String) -> Result<Option<Vec<String>>, AppError> {
    Ok(read_folder_order(Path::new(&folder_path)).await)
}

#[tauri::command]
pub async fn vault_file_exists(app: AppHandle, rel_path: String) -> Result<bool, AppError> {
    let vault_path = match get_vault_path(&app)? {
        Some(p) => p,
        None => return Ok(false),
    };
    let abs = Path::new(&vault_path).join(&rel_path);
    if let Ok(canon) = std::fs::canonicalize(&abs) {
        let vault_canon =
            std::fs::canonicalize(&vault_path).unwrap_or_else(|_| PathBuf::from(&vault_path));
        if !canon.starts_with(&vault_canon) {
            return Ok(false);
        }
    }
    Ok(abs.exists())
}

#[tauri::command]
pub async fn write_binary(
    app: AppHandle,
    rel_path: String,
    base64: String,
) -> Result<WriteBinaryResult, AppError> {
    use base64::Engine;
    let vault_path = get_vault_path(&app)?
        .ok_or_else(|| AppError::from("No vault path set"))?;
    let abs = Path::new(&vault_path).join(&rel_path);
    validate_parent_inside(Path::new(&vault_path), &abs)?;
    if let Some(parent) = abs.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::from(e.to_string()))?;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64)
        .map_err(|e| AppError::from(e.to_string()))?;
    tokio::fs::write(&abs, bytes)
        .await
        .map_err(|e| AppError::from(e.to_string()))?;
    Ok(WriteBinaryResult {
        ok: true,
        rel_path,
    })
}
