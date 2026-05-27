use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self { message: s }
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self {
            message: s.to_string(),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self {
            message: e.to_string(),
        }
    }
}

impl From<tauri_plugin_store::Error> for AppError {
    fn from(e: tauri_plugin_store::Error) -> Self {
        Self {
            message: e.to_string(),
        }
    }
}
