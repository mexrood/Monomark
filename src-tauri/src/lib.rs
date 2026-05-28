mod commands;
mod error;

use std::sync::Mutex;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(commands::watcher::WatcherState::new()))
        .manage(Mutex::new(commands::sidecar::SidecarState::new()))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── System tray ──────────────────────────────────────────────
            let show = MenuItemBuilder::with_id("show", "Show / Hide").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("default icon must be set in tauri.conf.json");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Monomark")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window
            commands::window::minimize_window,
            commands::window::toggle_maximize,
            commands::window::close_window,
            commands::window::is_maximized,
            commands::window::open_preview,
            commands::window::close_preview,
            commands::window::preview_open_in_main,
            // Settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
            // Vault
            commands::vault::pick_vault_folder,
            commands::vault::pick_file,
            commands::vault::vault_get_path,
            commands::vault::vault_set_path,
            commands::vault::list_tree,
            commands::vault::read_file,
            commands::vault::write_file,
            commands::vault::create_file,
            commands::vault::create_folder,
            commands::vault::rename_file,
            commands::vault::delete_file,
            commands::vault::file_exists,
            commands::vault::is_inside_vault,
            commands::vault::move_file,
            commands::vault::set_folder_order,
            commands::vault::get_folder_order,
            commands::vault::vault_file_exists,
            commands::vault::write_binary,
            // Watcher
            commands::watcher::start_watcher,
            commands::watcher::stop_watcher,
            // Sidecar (MCP server)
            commands::sidecar::start_sidecar,
            commands::sidecar::stop_sidecar,
            commands::sidecar::sidecar_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
