use crate::error::AppError;

#[cfg(target_os = "windows")]
const REG_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const APP_NAME: &str = "Monomark";

#[tauri::command]
pub fn get_autostart_enabled() -> Result<bool, AppError> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu.open_subkey(REG_KEY)
            .map_err(|e| AppError::from(e.to_string()))?;
        match run_key.get_value::<String, _>(APP_NAME) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
pub fn set_autostart_enabled(enabled: bool) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run_key, _) = hkcu.create_subkey(REG_KEY)
            .map_err(|e| AppError::from(e.to_string()))?;

        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| AppError::from(e.to_string()))?;
            run_key.set_value(APP_NAME, &exe_path.to_string_lossy().to_string())
                .map_err(|e| AppError::from(e.to_string()))?;
        } else {
            let _ = run_key.delete_value(APP_NAME);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
    }
    Ok(())
}
