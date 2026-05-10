// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modbus;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(modbus::new_modbus_state())
        .invoke_handler(tauri::generate_handler![
            modbus::modbus_connect,
            modbus::modbus_disconnect,
            modbus::modbus_read_holding,
            modbus::modbus_read_input,
            modbus::modbus_write_single,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
