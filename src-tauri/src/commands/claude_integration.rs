use std::path::PathBuf;

use crate::error::AppError;

const MCP_PORT: u16 = 7456;

/// Locate the Claude Desktop config file.
fn claude_desktop_config_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|appdata| PathBuf::from(appdata).join("Claude").join("claude_desktop_config.json"))
    }
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .map(|home| home.join("Library/Application Support/Claude/claude_desktop_config.json"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

/// Find mcp-remote command path. Installs globally if missing.
fn ensure_mcp_remote() -> Result<String, AppError> {
    // Check if mcp-remote is already installed globally
    #[cfg(target_os = "windows")]
    {
        // Check npm global prefix for mcp-remote.cmd
        let npm_prefix = std::env::var("APPDATA")
            .map(|a| PathBuf::from(a).join("npm"))
            .unwrap_or_default();
        let cmd_path = npm_prefix.join("mcp-remote.cmd");
        if cmd_path.exists() {
            return Ok(cmd_path.to_string_lossy().to_string());
        }

        // Not installed — install it
        log::info!("Installing mcp-remote globally...");
        let output = std::process::Command::new("npm")
            .args(["install", "-g", "mcp-remote@latest"])
            .output()
            .map_err(|e| AppError::from(format!("Failed to run npm: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::from(format!("npm install failed: {}", stderr)));
        }

        if cmd_path.exists() {
            Ok(cmd_path.to_string_lossy().to_string())
        } else {
            Err(AppError::from("mcp-remote installed but cmd not found"))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok("mcp-remote".to_string())
    }
}

#[tauri::command]
pub fn install_to_claude_desktop() -> Result<serde_json::Value, AppError> {
    let config_path = claude_desktop_config_path()
        .ok_or_else(|| AppError::from("Unsupported platform"))?;

    let token = super::keychain::get_mcp_token()
        .ok_or_else(|| AppError::from("No MCP token found. Start the server first."))?;

    // Ensure mcp-remote is installed and get its full path
    let mcp_remote_cmd = ensure_mcp_remote()?;

    // Read existing config or start fresh
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| AppError::from(format!("Failed to read config: {}", e)))?;
        serde_json::from_str(&content)
            .map_err(|e| AppError::from(format!("Invalid JSON in config: {}", e)))?
    } else {
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::from(format!("Failed to create config dir: {}", e)))?;
        }
        serde_json::json!({})
    };

    // Build the monomark entry with full path to mcp-remote
    let monomark_entry = serde_json::json!({
        "command": mcp_remote_cmd,
        "args": [
            format!("http://127.0.0.1:{}/mcp", MCP_PORT),
            "--allow-http",
            "--header",
            format!("Authorization: Bearer {}", token),
        ]
    });

    // Ensure mcpServers object exists, then set monomark
    if config.get("mcpServers").is_none() {
        config["mcpServers"] = serde_json::json!({});
    }
    config["mcpServers"]["monomark"] = monomark_entry;

    // Write back with pretty formatting
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| AppError::from(format!("Failed to serialize: {}", e)))?;
    std::fs::write(&config_path, &content)
        .map_err(|e| AppError::from(format!("Failed to write config: {}", e)))?;

    log::info!("Installed monomark to Claude Desktop config at {}", config_path.display());
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn get_claude_desktop_status() -> Result<serde_json::Value, AppError> {
    let config_path = match claude_desktop_config_path() {
        Some(p) => p,
        None => return Ok(serde_json::json!({ "status": "not_installed" })),
    };

    if !config_path.exists() {
        return Ok(serde_json::json!({ "status": "not_installed" }));
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| AppError::from(format!("Failed to read config: {}", e)))?;
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| AppError::from(format!("Invalid JSON: {}", e)))?;

    if config
        .get("mcpServers")
        .and_then(|s| s.get("monomark"))
        .is_some()
    {
        Ok(serde_json::json!({ "status": "configured" }))
    } else {
        Ok(serde_json::json!({ "status": "not_installed" }))
    }
}

#[tauri::command]
pub fn get_claude_code_command() -> Result<String, AppError> {
    let token = super::keychain::get_mcp_token().unwrap_or_default();
    Ok(format!(
        "claude mcp add monomark -- npx -y mcp-remote@latest http://127.0.0.1:{}/mcp --allow-http --header \"Authorization: Bearer {}\"",
        MCP_PORT, token
    ))
}
